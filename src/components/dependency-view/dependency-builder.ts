import type { GraphEdge } from "@/components/shared/graphviz/Graph";
import { MD5 } from "crypto-js";
import { v7 as uuidv7 } from "uuid";
import type { DependencyTableInfo } from "./dependency-types";

export interface DependencyGraphNode {
  id: string;

  type: "Internal" | "External";

  category: string;

  namespace: string;
  name: string;

  query: string;

  // ids of target nodes
  targets: string[];

  metadataModificationTime?: string;
}

type DependencyInfo = Pick<DependencyGraphNode, "type" | "category" | "namespace" | "name"> & {
  edgeLabel?: string | null;
};

type EngineProcessor = (source: DependencyTableInfo) => DependencyInfo[];

export class DependencyBuilder {
  private static readonly MV_SINK_TO_EXPR =
    /^CREATE MATERIALIZED VIEW [a-zA-Z_0-9\\.]* TO ([a-zA-Z_0-9\\.]*)/;
  private static readonly DISTRIBUTED_REGEXPR =
    / +Distributed\s*\(\s*'[a-zA-Z0-9_]+'\s*,\s*'([a-zA-Z0-9_]+)'\s*,\s*'([a-zA-Z0-9_]+)'\s*(?:,\s*([^)]*\)))?\s*\)/;
  private static readonly MYSQL_ENGINE_REGEXPR =
    / +MySQL\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'/;
  private static readonly BUFFER_ENGINE_REGEXPR = / +Buffer\s*\(\s*'([^']+)'\s*,\s*'([^']+)'/;
  private static readonly KAFKA_BROKER_REGEXPR = /kafka_broker_list\s*=\s*'([^']+)'/;
  private static readonly KAFKA_TOPIC_REGEXPR = /kafka_topic_list\s*=\s*'([^']+)'/;
  private static readonly URL_ENGINE_REGEXPR = / +URL\s*\(\s*'([^']+)'/;

  private static readonly engineProcessors: Map<string, EngineProcessor> = new Map<
    string,
    EngineProcessor
  >();

  static {
    // Register engine processors (static initialization)
    DependencyBuilder.engineProcessors.set(
      "MySQL",
      (source: DependencyTableInfo): DependencyInfo[] => {
        const matches = source.tableQuery.match(DependencyBuilder.MYSQL_ENGINE_REGEXPR);
        if (matches !== null) {
          return [
            {
              type: "External",
              namespace: matches[1], // nodeLabel (server address)
              name: "",
              category: "MySQL Server", // externalType
              edgeLabel: "[Table]" + matches[2] + "." + matches[3],
            },
          ];
        }
        return [];
      }
    );

    DependencyBuilder.engineProcessors.set(
      "Kafka",
      (source: DependencyTableInfo): DependencyInfo[] => {
        const brokerMatch = source.tableQuery.match(DependencyBuilder.KAFKA_BROKER_REGEXPR);
        const topicMatch = source.tableQuery.match(DependencyBuilder.KAFKA_TOPIC_REGEXPR);
        if (
          brokerMatch !== null &&
          topicMatch !== null &&
          brokerMatch[1] !== undefined &&
          topicMatch[1] !== undefined
        ) {
          // Use the first broker in the list
          const broker = brokerMatch[1].split(",")[0];
          return [
            {
              type: "External",
              category: "Kafka Server", // externalType
              namespace: broker, // nodeLabel (broker address)
              name: "",
              edgeLabel: "[Topic]" + topicMatch[1],
            },
          ];
        }
        return [];
      }
    );

    DependencyBuilder.engineProcessors.set(
      "URL",
      (source: DependencyTableInfo): DependencyInfo[] => {
        const matches = source.tableQuery.match(DependencyBuilder.URL_ENGINE_REGEXPR);
        console.log("source", source, matches);
        if (matches !== null && matches[1] !== undefined) {
          const url = matches[1];
          return [
            {
              type: "External",
              category: "HTTP Server", // externalType
              namespace: url, // nodeLabel (URL)
              name: "",
            },
          ];
        }
        return [];
      }
    );

    DependencyBuilder.engineProcessors.set(
      "Dictionary",
      (source: DependencyTableInfo): DependencyInfo[] => {
        console.log("source", source);
        // Match SOURCE with optional whitespace/newlines, then CLICKHOUSE with optional whitespace/newlines
        // Extract HOST (quoted or unquoted), PORT (number), DB (quoted), and TABLE (quoted)
        const clickhouseSourceRegex =
          /SOURCE\s*\(\s*CLICKHOUSE\s*\([\s\S]*?HOST\s+(?:'([^']+)'|(\S+))\s+PORT\s+(\d+)[\s\S]*?DB\s+'([^']+)'[\s\S]*?TABLE\s+'([^']+)'/i;
        const matches = source.tableQuery.match(clickhouseSourceRegex);
        if (matches !== null) {
          // HOST can be in matches[1] (quoted) or matches[2] (unquoted)
          const host = matches[1] ?? matches[2];
          const port = matches[3];
          const database = matches[4];
          const table = matches[5];
          if (host && port && database && table) {
            return [
              {
                type: "External",
                category: "ClickHouse Server",
                namespace: `${host}:${port}`,
                name: `${database}.${table}`,
                edgeLabel: "Load From",
              },
            ];
          }
        }
        return [];
      }
    );

    DependencyBuilder.engineProcessors.set(
      "Distributed",
      (source: DependencyTableInfo): DependencyInfo[] => {
        const matches = source.tableQuery.match(DependencyBuilder.DISTRIBUTED_REGEXPR);
        if (matches !== null && matches[1] !== undefined && matches[2] !== undefined) {
          // Use the 4th parameter (sharding key) as edge label if present, otherwise empty string
          const edgeLabel = matches[3]?.trim() ?? "";
          return [
            {
              type: "Internal",
              category: source.engine,
              namespace: matches[1],
              name: matches[2],
              edgeLabel,
            },
          ];
        }
        return [];
      }
    );

    DependencyBuilder.engineProcessors.set(
      "Buffer",
      (source: DependencyTableInfo): DependencyInfo[] => {
        const matches = source.tableQuery.match(DependencyBuilder.BUFFER_ENGINE_REGEXPR);
        if (matches !== null && matches[1] !== undefined && matches[2] !== undefined) {
          return [
            {
              type: "Internal",
              category: source.engine,
              namespace: matches[1],
              name: matches[2],
            },
          ];
        }
        return [];
      }
    );
  }

  private nodes = new Map<string, DependencyGraphNode>();
  private edges: GraphEdge[] = [];

  /**
   * uuid to table mapping
   */
  private innerTable: Map<string, DependencyTableInfo>;

  /**
   * fqdn name to table mapping
   */
  private tableMap: Map<string, DependencyTableInfo>;

  constructor(
    tableMap: Map<string, DependencyTableInfo>,
    innerTable: Map<string, DependencyTableInfo>
  ) {
    this.tableMap = tableMap;
    this.innerTable = innerTable;
  }

  private processMaterializedView(source: DependencyTableInfo): DependencyInfo[] {
    const matches = source.tableQuery.match(DependencyBuilder.MV_SINK_TO_EXPR);
    if (matches !== null && matches[1] !== undefined) {
      const sinkToFullName = matches[1];
      const dot = sinkToFullName.indexOf(".");
      if (dot > -1) {
        const sinkToNames = sinkToFullName.split(".");
        return [
          {
            type: "Internal",
            category: "",
            namespace: sinkToNames[0],
            name: sinkToNames[1],
            edgeLabel: "Sink To",
          },
        ];
      } else {
        return [
          {
            type: "Internal",
            category: "",
            namespace: source.database,
            name: sinkToFullName,
            edgeLabel: "Sink To",
          },
        ];
      }
    } else {
      // NO 'TO' is found, there must be an inner table
      // The inner table is in the SAME database
      const innerTableKey =
        source.uuid === "00000000-0000-0000-0000-000000000000"
          ? `.inner.${source.name}`
          : `.inner_id.${source.uuid}`;
      const toTable = this.innerTable.get(innerTableKey);
      if (toTable !== undefined) {
        return [
          {
            type: "Internal",
            category: source.engine,
            namespace: source.database,
            name: toTable.name,
            edgeLabel: "Sink To",
          },
        ];
      }
    }
    return [];
  }

  // Build dependency graph
  public build(database: string, table?: string) {
    // Reset previous result
    this.edges = [];
    this.nodes = new Map<string, DependencyGraphNode>();

    const visited = new Set<string>();
    const queue: DependencyTableInfo[] = [];

    if (table) {
      // Use the specific table as input
      const startId = `${database}.${table}`;
      const startTable = this.tableMap.get(startId);
      if (startTable) {
        visited.add(startTable.id);
        queue.push(startTable);
      }
    } else {
      // Find all tables under the given database as input
      for (const source of this.tableMap.values()) {
        if (source.database === database) {
          visited.add(source.id);
          queue.push(source);
        }
      }
    }

    // Build dependencies only for reachable tables (based on seeds above)
    while (queue.length > 0) {
      const source = queue.shift();
      if (!source) continue;

      // Handle dependencies_database and dependencies_table arrays
      if (Array.isArray(source.dependenciesDatabase) && Array.isArray(source.dependenciesTable)) {
        for (let i = 0; i < source.dependenciesDatabase.length; i++) {
          const targetDatabase = source.dependenciesDatabase[i];
          const targetTableName = source.dependenciesTable[i];
          if (!targetDatabase || !targetTableName) continue;

          this.addDependency(source, {
            type: "Internal",
            category: "",
            namespace: targetDatabase,
            name: targetTableName,
          });

          const targetId = `${targetDatabase}.${targetTableName}`;
          const targetTable = this.tableMap.get(targetId);
          if (targetTable && !visited.has(targetTable.id)) {
            visited.add(targetTable.id);
            queue.push(targetTable);
          }
        }
      } else if (source.dependenciesDatabase && source.dependenciesTable) {
        // Handle single string values (legacy support)
        const depDb =
          typeof source.dependenciesDatabase === "string" ? source.dependenciesDatabase : "";
        const depTable =
          typeof source.dependenciesTable === "string" ? source.dependenciesTable : "";
        if (depDb && depTable) {
          this.addDependency(source, {
            type: "Internal",
            category: "",
            namespace: depDb,
            name: depTable,
          });

          const targetId = `${depDb}.${depTable}`;
          const targetTable = this.tableMap.get(targetId);
          if (targetTable && !visited.has(targetTable.id)) {
            visited.add(targetTable.id);
            queue.push(targetTable);
          }
        }
      }

      // Process engine-specific dependencies using registry pattern
      let dependencies: DependencyInfo[] = [];
      if (source.engine === "MaterializedView") {
        // MaterializedView needs access to instance innerTable map
        dependencies = this.processMaterializedView(source);
      } else {
        const processor = DependencyBuilder.engineProcessors.get(source.engine);
        if (processor) {
          dependencies = processor(source);
        }
      }

      for (const depInfo of dependencies) {
        this.addDependency(source, depInfo);

        if (depInfo.type === "Internal") {
          const targetTableId = depInfo.namespace + "." + depInfo.name;
          const targetTable = this.tableMap.get(targetTableId);
          if (targetTable && !visited.has(targetTable.id)) {
            visited.add(targetTable.id);
            queue.push(targetTable);
          }
        }
      }
    }
  }

  private getOrCreateSourceNode(source: DependencyTableInfo): DependencyGraphNode {
    let sourceNode = this.nodes.get(source.id);
    if (sourceNode === undefined) {
      sourceNode = {
        id: source.id,
        type: "Internal",
        namespace: source.database,
        name: source.name,
        category: source.engine,
        query: source.tableQuery,
        targets: [],
        metadataModificationTime: source.metadataModificationTime,
      };
      this.nodes.set(source.id, sourceNode);
    }
    return sourceNode;
  }

  private getOrCreateTargetNode(depInfo: DependencyInfo): {
    node: DependencyGraphNode;
    targetTable?: DependencyTableInfo;
  } {
    if (depInfo.type === "Internal") {
      const targetTableId = depInfo.namespace + "." + depInfo.name;
      const targetTable = this.tableMap.get(targetTableId);
      let targetNode = this.nodes.get(targetTableId);

      if (targetNode === undefined) {
        targetNode = {
          id: targetTableId,
          type: "Internal",
          namespace: depInfo.namespace,
          name: depInfo.name,
          category: targetTable?.engine ?? "",
          query: targetTable?.tableQuery ?? "NOT FOUND",
          targets: [],
          metadataModificationTime: targetTable?.metadataModificationTime,
        };
        this.nodes.set(targetTableId, targetNode);
      }

      return { node: targetNode, targetTable };
    } else {
      // External dependency
      const targetId = "a" + MD5(depInfo.namespace + "@" + depInfo.category).toString();
      let targetNode = this.nodes.get(targetId);

      if (targetNode === undefined) {
        targetNode = {
          id: targetId,
          type: "External",
          namespace: depInfo.namespace,
          name: depInfo.name,
          category: depInfo.category!,
          query: "",
          targets: [],
        };
        this.nodes.set(targetId, targetNode);
      }

      return { node: targetNode };
    }
  }

  private addDependency(source: DependencyTableInfo, depInfo: DependencyInfo): void {
    const sourceNode = this.getOrCreateSourceNode(source);
    const { node: targetNode, targetTable } = this.getOrCreateTargetNode(depInfo);

    // Determine edge label
    let edgeLabel: string | null | undefined;
    if (depInfo.type === "Internal") {
      if (targetTable?.engine === "MaterializedView" && depInfo.edgeLabel === undefined) {
        edgeLabel = "Push To";
      } else {
        edgeLabel = depInfo.edgeLabel ?? null;
      }
    } else {
      edgeLabel = source.engine === "MaterializedView" ? "Sink To" : (depInfo.edgeLabel ?? "");
    }

    // Create edge
    const finalEdgeLabel =
      edgeLabel === null
        ? this.getDependencyDescription(
            sourceNode.category,
            sourceNode.query,
            targetNode.namespace,
            targetNode.name
          )
        : edgeLabel;

    this.edges.push({
      id: "e" + uuidv7(),
      source: sourceNode.id,
      target: targetNode.id,
      label: finalEdgeLabel,
    });
    sourceNode.targets.push(targetNode.id);
  }

  private getDependencyDescription(
    sourceTableEngine: string,
    sourceTableQuery: string,
    targetNodeDatabase: string,
    targetNodeName: string
  ) {
    if (sourceTableEngine === "MaterializedView") {
      const matches = sourceTableQuery.match(DependencyBuilder.MV_SINK_TO_EXPR);
      if (matches !== null && matches[1] !== undefined) {
        const mvSinkTo = matches[1];
        if (targetNodeName === mvSinkTo || targetNodeDatabase + "." + targetNodeName === mvSinkTo) {
          return "Sink To";
        } else {
          return "Select From";
        }
      }
    } else if (sourceTableEngine === "View") {
      return "Select From";
    }
    return undefined;
  }

  public getEdges() {
    return this.edges;
  }

  public getNodes() {
    return this.nodes;
  }
}
