import type { GraphEdge } from "@/components/graphviz-component/Graph";
import { uuid2 } from "@/lib/uuid-utils";
import { MD5 } from "crypto-js";

// The response data object
interface Table {
  id: string;
  uuid: string;
  database: string;
  name: string;
  engine: string;
  tableQuery: string;

  dependenciesDatabase: string[];
  dependenciesTable: string[];

  // Runtime Argument
  // 0: not inner table
  // 1: inner table, .inner.
  // 2: inner table, .inner_id.
  innerTable: number;
}

export interface DependencyGraphNode {
  id: string;

  type: "Internal" | "External";

  category: string;

  namespace: string;
  name: string;

  query: string;

  // ids of target nodes
  targets: string[];
}

type DependencyInfo = Pick<DependencyGraphNode, "type" | "category" | "namespace" | "name"> & {
  edgeLabel?: string | null;
};

type EngineProcessor = (source: Table) => DependencyInfo[];

export class DependencyBuilder {
  private MV_SINK_TO_EXPR = /^CREATE MATERIALIZED VIEW [a-zA-Z_0-9\\.]* TO ([a-zA-Z_0-9\\.]*)/;
  private DISTRIBUTED_REGEXPR = / +Distributed\('[a-zA-Z0-9_]+', '([a-zA-Z0-9_]+)', '([a-zA-Z0-9_]+)'/;
  private MYSQL_ENGINE_REGEXPR = / +MySQL\('([^']+)', *'([^']+)', *'([^']+)'/;
  private BUFFER_ENGINE_REGEXPR = / +Buffer\('([^']+)', *'([^']+)'/;
  private KAFKA_BROKER_REGEXPR = /kafka_broker_list *= *'([^']+)'/;
  private KAFKA_TOPIC_REGEXPR = /kafka_topic_list *= *'([^']+)'/;
  private URL_ENGINE_REGEXPR = / +URL\('([^']+)'/;

  private tables: Table[] = [];
  private nodes = new Map<string, DependencyGraphNode>();
  private edges: GraphEdge[] = [];

  /**
   * uuid to table mapping
   */
  private innerTable = new Map<string, Table>();

  /**
   * fqdn name to table mapping
   */
  private tableMap: Map<string, Table> = new Map<string, Table>();
  private engineProcessors: Map<string, EngineProcessor> = new Map<string, EngineProcessor>();

  constructor(tables: Table[]) {
    this.tables = tables;

    //
    // Register engine processor
    //
    this.engineProcessors.set("MySQL", (source: Table): DependencyInfo[] => {
      const matches = source.tableQuery.match(this.MYSQL_ENGINE_REGEXPR);
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
    });

    this.engineProcessors.set("Kafka", (source: Table): DependencyInfo[] => {
      const brokerMatch = source.tableQuery.match(this.KAFKA_BROKER_REGEXPR);
      const topicMatch = source.tableQuery.match(this.KAFKA_TOPIC_REGEXPR);
      if (brokerMatch !== null && topicMatch !== null && brokerMatch[1] !== undefined && topicMatch[1] !== undefined) {
        // Use the first broker in the list
        const broker = brokerMatch[1].split(",")[0];
        return [
          {
            type: "External",
            category: "Kafka Server", // externalType
            namespace: broker, // nodeLabel (broker address)
            name: "[Topic]" + topicMatch[1],
          },
        ];
      }
      return [];
    });

    this.engineProcessors.set("URL", (source: Table): DependencyInfo[] => {
      const matches = source.tableQuery.match(this.URL_ENGINE_REGEXPR);
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
    });

    this.engineProcessors.set("Dictionary", (source: Table): DependencyInfo[] => {
      const index = source.tableQuery.indexOf("SOURCE(CLICKHOUSE(");
      if (index > -1) {
        const configuration = source.tableQuery.substring(index);
        const database = configuration.match(/DB *'([^']*)'/);
        const table = configuration.match(/TABLE *'([^']*)'/);
        if (database !== null && table !== null) {
          return [
            {
              type: "Internal",
              category: "ClickHouse Server",
              namespace: database[1],
              name: table[1],
              edgeLabel: "Load From",
            },
          ];
        }
      }
      return [];
    });

    // Internal dependencies
    this.engineProcessors.set("MaterializedView", (source: Table): DependencyInfo[] => {
      const matches = source.tableQuery.match(this.MV_SINK_TO_EXPR);
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
          source.uuid === "00000000-0000-0000-0000-000000000000" ? `.inner.${source.name}` : `.inner_id.${source.uuid}`;
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
    });

    this.engineProcessors.set("Distributed", (source: Table): DependencyInfo[] => {
      const matches = source.tableQuery.match(this.DISTRIBUTED_REGEXPR);
      if (matches !== null && matches[1] !== undefined && matches[2] !== undefined) {
        return [
          {
            type: "Internal",
            category: source.engine,
            namespace: matches[1],
            name: matches[2],
            // Set to empty string so if the distributed is built on materialized, no edge label such as 'Push to' is shown
            edgeLabel: "",
          },
        ];
      }
      return [];
    });

    this.engineProcessors.set("Buffer", (source: Table): DependencyInfo[] => {
      const matches = source.tableQuery.match(this.BUFFER_ENGINE_REGEXPR);
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
    });
  }

  private processTableDependencies(source: Table, database: string): void {
    // Handle dependencies_database and dependencies_table arrays
    if (Array.isArray(source.dependenciesDatabase) && Array.isArray(source.dependenciesTable)) {
      for (let i = 0; i < source.dependenciesDatabase.length; i++) {
        const targetDatabase = source.dependenciesDatabase[i];
        const targetTable = source.dependenciesTable[i];
        if (targetDatabase && targetTable && targetDatabase === database) {
          this.addDependency(source, {
            type: "Internal",
            category: "",
            namespace: targetDatabase,
            name: targetTable,
          });
        }
      }
    } else if (source.dependenciesDatabase && source.dependenciesTable) {
      // Handle single string values (legacy support)
      const depDb = typeof source.dependenciesDatabase === "string" ? source.dependenciesDatabase : "";
      const depTable = typeof source.dependenciesTable === "string" ? source.dependenciesTable : "";
      if (depDb && depTable) {
        this.addDependency(source, {
          type: "Internal",
          category: "",
          namespace: depDb,
          name: depTable,
        });
      }
    }

    // Process engine-specific dependencies using registry pattern
    const processor = this.engineProcessors.get(source.engine);
    if (processor) {
      const dependencies = processor(source);
      for (const depInfo of dependencies) {
        this.addDependency(source, depInfo);
      }
    }
  }

  // Build dependency graph
  public build(database: string) {
    // Populate table maps and build dependencies in a single pass
    for (const table of this.tables) {
      this.tableMap.set(table.id, table);
      // Populate inner table map for MaterializedView inner table lookup
      if (table.name.startsWith(".inner_id.")) {
        const originalTableId = table.name.substring(".inner_id.".length);
        this.innerTable.set(`.inner_id.${originalTableId}`, table);
      } else if (table.name.startsWith(".inner.")) {
        this.innerTable.set(`.inner.${table.name.substring(".inner.".length)}`, table);
      }
    }

    // Build dependencies for all tables (after maps are populated)
    for (const source of this.tables) {
      this.processTableDependencies(source, database);
    }
  }

  private getOrCreateSourceNode(source: Table): DependencyGraphNode {
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
      };
      this.nodes.set(source.id, sourceNode);
    }
    return sourceNode;
  }

  private getOrCreateTargetNode(depInfo: DependencyInfo): { node: DependencyGraphNode; targetTable?: Table } {
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

  private addDependency(source: Table, depInfo: DependencyInfo): void {
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
        ? this.getDependencyDescription(sourceNode.category, sourceNode.query, targetNode.namespace, targetNode.name)
        : edgeLabel;

    this.edges.push({
      id: "e" + uuid2(),
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
      const matches = sourceTableQuery.match(this.MV_SINK_TO_EXPR);
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
