import type { GraphEdge } from "@/components/graphviz-component/Graph";
import { uuid2 } from "@/lib/uuid-utils";
import { MD5 } from "crypto-js";

// The response data object
interface Table {
  id: string;
  database: string;
  name: string;
  engine: string;
  tableQuery: string;

  dependenciesDatabase: string[];
  dependenciesTable: string[];

  serverVersion: string;

  isTargetDatabase: boolean;
}

export interface DependencyGraphNode {
  id: string;

  type: "Internal" | "External";

  database: string;
  name: string;
  engine: string;
  query: string;

  // ids of target nodes
  targets: string[];
}

export class DependencyBuilder {
  private mvRegExpr = /^CREATE MATERIALIZED VIEW [a-zA-Z_0-9\\.]* (TO ([a-zA-Z_0-9\\.]*))?/;
  private distributedRegExpr = / +Distributed\('[a-zA-Z0-9_]+', '([a-zA-Z0-9_]+)', '([a-zA-Z0-9_]+)'/;
  private mySQLEngineExpr = / +MySQL\('([^']+)', *'([^']+)', *'([^']+)'/;
  private kafkaBrokerExpr = /kafka_broker_list *= *'([^']+)'/;
  private kafkaTopicExpr = /kafka_topic_list *= *'([^']+)'/;
  private bufferEngineExpr = / +Buffer\('([^']+)', *'([^']+)'/;

  private tables: Table[] = [];
  private nodes = new Map<string, DependencyGraphNode>();
  private edges: GraphEdge[] = [];
  private tableMap: Map<string, Table> = new Map<string, Table>();

  constructor(tables: Table[]) {
    this.tables = tables;
    this.tables.forEach((table) => {
      this.tableMap.set(table.id, table);
    });
  }

  // Build dependency graph
  public build() {
    this.tables.forEach((source) => {
      if (!source.isTargetDatabase) {
        return;
      }

      // Handle dependencies_database and dependencies_table arrays
      if (Array.isArray(source.dependenciesDatabase) && Array.isArray(source.dependenciesTable)) {
        for (let i = 0; i < source.dependenciesDatabase.length; i++) {
          const depDb = source.dependenciesDatabase[i];
          const depTable = source.dependenciesTable[i];
          if (depDb && depTable) {
            this.addTableDependency(source, depDb, depTable, true);
          }
        }
      } else if (source.dependenciesDatabase && source.dependenciesTable) {
        // Handle single string values (legacy support)
        const depDb = typeof source.dependenciesDatabase === "string" ? source.dependenciesDatabase : "";
        const depTable = typeof source.dependenciesTable === "string" ? source.dependenciesTable : "";
        if (depDb && depTable) {
          this.addTableDependency(source, depDb, depTable, true);
        }
      }

      if (source.engine === "MySQL") {
        const matches = source.tableQuery.match(this.mySQLEngineExpr);
        if (matches !== null) {
          this.addExternalDependency(source, "MySQL Server", matches[1], "[Table]" + matches[2] + "." + matches[3]);
        }
      } else if (source.engine === "Kafka") {
        const brokerMatch = source.tableQuery.match(this.kafkaBrokerExpr);
        const topicMatch = source.tableQuery.match(this.kafkaTopicExpr);
        if (brokerMatch !== null && topicMatch !== null) {
          let broker;
          const brokers = brokerMatch[1];
          if (brokers !== undefined) {
            broker = brokers.split(",")[0];

            this.addExternalDependency(source, "Kafka Server", broker, "[Topic]" + topicMatch[1]);
          }
        }
      } else if (source.engine === "Dictionary") {
        const index = source.tableQuery.indexOf("SOURCE(CLICKHOUSE(");
        if (index > -1) {
          const configuration = source.tableQuery.substring(index);
          const database = configuration.match(/DB *'([^']*)'/);
          const table = configuration.match(/TABLE *'([^']*)'/);
          if (database !== null && table !== null) {
            this.addTableDependency(source, database[1], table[1], false, "Load From");
          }
        }
      }

      // ADD SinkTo/Distributed for lower version
      if (source.engine === "MaterializedView") {
        const matches = source.tableQuery.match(this.mvRegExpr);
        if (matches !== null && matches[2] !== undefined) {
          const sinkToFullName = matches[2];
          const dot = sinkToFullName.indexOf(".");
          if (dot > -1) {
            const sinkToNames = sinkToFullName.split(".");
            this.addTableDependency(source, sinkToNames[0], sinkToNames[1], false, "Sink To");
          } else {
            this.addTableDependency(source, source.database, sinkToFullName, false, "Sink To");
          }
        }
      } else if (source.engine === "Distributed") {
        const matches = source.tableQuery.match(this.distributedRegExpr);
        if (matches !== null && matches[1] !== undefined && matches[2] !== undefined) {
          this.addTableDependency(source, matches[1], matches[2], false);
        }
      } else if (source.engine === "Buffer") {
        const matches = source.tableQuery.match(this.bufferEngineExpr);
        if (matches !== null && matches[1] !== undefined && matches[2] !== undefined) {
          this.addTableDependency(source, matches[1], matches[2], false);
        }
      }
    });
  }

  private addTableDependency(
    source: Table,
    targetTableDb: string,
    targetTableName: string,
    checkVersion: boolean,
    edgeLabel: string | null = null
  ) {
    let sourceNode = this.nodes.get(source.id);
    if (sourceNode === undefined) {
      sourceNode = {
        id: source.id,
        type: "Internal",
        database: source.database,
        name: source.name,
        engine: source.engine,
        query: source.tableQuery /*format(table.query)*/,
        targets: [],
      };
      this.nodes.set(source.id, sourceNode);
    }

    const targetTableId = targetTableDb + "_" + targetTableName;
    const targetTable = this.tableMap.get(targetTableId);

    let targetNode = this.nodes.get(targetTableId);
    if (targetNode === undefined) {
      targetNode = {
        id: targetTableId,
        type: "Internal",
        database: targetTableDb,
        name: targetTableName,
        engine: targetTable === undefined ? "" : targetTable.engine,
        query: targetTable === undefined ? "NOT FOUND" : targetTable.tableQuery,
        targets: [],
      };
      this.nodes.set(targetTableId, targetNode);
    }

    // if (checkVersion && source.serverVersion < "23") {
    //   /// Before 23 or some earlier version, ClickHouse returns the dependencies in reverse order
    //   const t = sourceNode;
    //   sourceNode = targetNode;
    //   targetNode = t;
    // }
    if (targetTable?.engine === "MaterializedView") {
      const t = sourceNode;
      sourceNode = targetNode;
      targetNode = t;
      edgeLabel = 'Select From';
    }

    this.edges.push({
      id: "e" + uuid2(),
      source: sourceNode.id,
      target: targetNode.id,
      label:
        edgeLabel === null
          ? this.getDependencyDescription(targetNode.database, targetNode.name, sourceNode.engine, sourceNode.query)
          : edgeLabel,
    });
    sourceNode.targets.push(targetNode.id);
  }

  private addExternalDependency(source: Table, type: string, nodeLabel: string, edgeLabel: string = "") {
    let sourceNode = this.nodes.get(source.id);
    if (sourceNode === undefined) {
      sourceNode = {
        id: source.id,
        type: "Internal",
        database: source.database,
        name: source.name,
        engine: source.engine,
        query: source.tableQuery /*format(table.query)*/,
        targets: [],
      };
      this.nodes.set(source.id, sourceNode);
    }

    const targetId = "a" + MD5(nodeLabel + "@" + type).toString();

    let targetNode = this.nodes.get(targetId);
    if (targetNode === undefined) {
      targetNode = {
        id: targetId,
        type: "External",
        database: nodeLabel,
        name: "",
        engine: type,
        query: "",
        targets: [],
      };
      this.nodes.set(targetId, targetNode);
    }

    this.edges.push({
      id: "e" + uuid2(),
      source: sourceNode.id,
      target: targetNode.id,
      label: edgeLabel,
    });
    sourceNode.targets.push(targetNode.id);
  }

  private getDependencyDescription(
    targetNodeDatabase: string,
    targetNodeName: string,
    sourceTableEngine: string,
    sourceTableQuery: string
  ) {
    if (sourceTableEngine === "MaterializedView") {
      const matches = sourceTableQuery.match(this.mvRegExpr);
      if (matches !== null) {
        const mvSinkTo = matches[2];
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

