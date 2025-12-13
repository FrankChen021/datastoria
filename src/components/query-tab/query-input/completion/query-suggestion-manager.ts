import { Connection } from "@/lib/connection/connection";
import { StringUtils } from "@/lib/string-utils";
import type { Ace } from "ace-builds";
import { QuerySnippetManager } from "../snippet/QuerySnippetManager";

type CompletionItem = {
  doc?: string;
} & Ace.Completion;

export class QuerySuggestionManager {
  private static instance: QuerySuggestionManager;

  public static getInstance(): QuerySuggestionManager {
    return this.instance || (this.instance = new this());
  }

  private miscCompletion: CompletionItem[] = [];
  private databaseCompletion: CompletionItem[] = [];
  private tableCompletion: Map<string, CompletionItem[]> = new Map();
  private columnCompletion: Map<string, CompletionItem[]> = new Map();
  private allSettingsCompletion: CompletionItem[] = [];
  private userSettingsCompletion: CompletionItem[] = [];
  private formatCompletion: CompletionItem[] = [];
  private clusterCompletion: CompletionItem[] = [];
  private engineCompletion: CompletionItem[] = [];
  private currentConnectionName: string | null = null;
  private qualifiedTableCompletions: CompletionItem[] = [];

  public onConnectionSelected(connection: Connection) {
    if (!connection) {
      this.currentConnectionName = null;
      return;
    }

    // Skip if already loaded for this connection
    if (this.currentConnectionName === connection.name) {
      return;
    }

    this.currentConnectionName = connection.name;

    // Clear qualified table completions for new connection
    this.qualifiedTableCompletions = [];

    // Initialize completion arrays
    this.miscCompletion = [];
    this.databaseCompletion = [];
    this.formatCompletion = [];
    this.allSettingsCompletion = [];
    this.userSettingsCompletion = [];
    this.engineCompletion = [];

    // Helper function to process completion items
    const processCompletionItem = (eachRowObject: any) => {
      const description = eachRowObject[3];
      const docHTML =
        description !== "" ? ["<b>", eachRowObject[0], "</b>", "<hr />", eachRowObject[3]].join("") : undefined;

      const completion: CompletionItem = {
        caption: eachRowObject[0],
        value: eachRowObject[0],
        meta: eachRowObject[1],
        score: eachRowObject[2],
        docHTML: docHTML,
      };

      const type = eachRowObject[1];
      if (type === "format") {
        this.formatCompletion.push(completion);
      } else if (type === "setting") {
        this.userSettingsCompletion.push(completion);
        this.allSettingsCompletion.push(completion);
      } else if (type === "merge_tree_setting") {
        this.allSettingsCompletion.push(completion);
      } else if (type === "engine") {
        this.engineCompletion.push(completion);
      } else if (type === "database") {
        this.databaseCompletion.push(completion);
        // Add to misc too
        this.miscCompletion.push(completion);
      } else {
        this.miscCompletion.push(completion);
      }
    };

    // Helper function to add cluster completions
    const addClusterCompletions = () => {
      if (connection.cluster && connection.cluster.length > 0) {
        this.miscCompletion.push({
          caption: `${connection.cluster}`,
          value: `${connection.cluster}`,
          meta: "cluster",
          score: -10,
        });

        this.miscCompletion.push({
          caption: `ON CLUSTER ${connection.cluster}`,
          value: `ON CLUSTER ${connection.cluster}`,
          meta: "cluster",
          score: -10,
        });
      }

      // Add qualified table completions if they've been loaded
      if (this.qualifiedTableCompletions.length > 0) {
        this.miscCompletion.push(...this.qualifiedTableCompletions);
      }
    };

    // Query 1: Databases
    connection
      .executeAsync(`SELECT name, 'database', -30, '' FROM system.databases ORDER BY name`, {
        default_format: "JSONCompact",
      })
      .response.then((response) => {
        const returnList = response.data.data;
        returnList.forEach((eachRowObject: any) => {
          processCompletionItem(eachRowObject);
        });
      })
      .catch((error) => {
        console.error("Failed to load database completion data:", error);
      });

    // Query 2: Functions
    connection
      .executeAsync(
        `
SELECT * FROM (
        SELECT concat(name, '()') AS name, ${connection.session.function_table_has_description_column ? 'description' : ''} FROM system.functions WHERE is_aggregate = 0
    UNION ALL
        -- Aggregate Combinator
        SELECT concat(functions.name, combinator.name, '()') AS name, ${connection.session.function_table_has_description_column ? 'functions.description' : ''} FROM system.functions AS functions
        CROSS JOIN system.aggregate_function_combinators  AS combinator
        WHERE functions.is_aggregate
    UNION ALL
        -- cluster/clusterAllReplicas functions are not in the table now
        SELECT 'cluster()', 'execute query on one replica of all shards in a given cluster' AS name
    UNION ALL
        SELECT 'clusterAllReplicas()', 'execute query on all replicas of all shards in a given cluster' AS name
) ORDER BY name`,
        {
          default_format: "JSONCompact",
        }
      )
      .response.then((response) => {
        const returnList = response.data.data;
        returnList.forEach((eachRowObject: any) => {
          const suggestion = [
            eachRowObject[0],
            'function',
            -50,
            eachRowObject[1]
          ];
          processCompletionItem(suggestion);
        });
      })
      .catch((error) => {
        console.error("Failed to load function completion data:", error);
      });

    // Query 3: Data Types
    connection
      .executeAsync(
        `SELECT multiIf(alias_to = '', name, alias_to) AS name, 'type', -0, '' FROM system.data_type_families`,
        {
          default_format: "JSONCompact",
        }
      )
      .response.then((response) => {
        const returnList = response.data.data;
        returnList.forEach((eachRowObject: any) => {
          processCompletionItem(eachRowObject);
        });
      })
      .catch((error) => {
        console.error("Failed to load data type completion data:", error);
      });

    // Query 4: Settings
    connection
      .executeAsync(
        `SELECT name, 'setting', -60, concat(description, '<br/><br/>Current value: ', value) FROM system.settings ORDER BY name`,
        {
          default_format: "JSONCompact",
        }
      )
      .response.then((response) => {
        const returnList = response.data.data;
        returnList.forEach((eachRowObject: any) => {
          processCompletionItem(eachRowObject);
        });
      })
      .catch((error) => {
        console.error("Failed to load settings completion data:", error);
      });

    // Query 5: Merge Tree Settings
    connection
      .executeAsync(
        `SELECT name, 'merge_tree_setting', -100, concat(description, '<br/><br/>Current value: ', value) FROM system.merge_tree_settings ORDER BY name`,
        {
          default_format: "JSONCompact",
        }
      )
      .response.then((response) => {
        const returnList = response.data.data;
        returnList.forEach((eachRowObject: any) => {
          processCompletionItem(eachRowObject);
        });
      })
      .catch((error) => {
        console.error("Failed to load merge tree settings completion data:", error);
      });

    // Query 6: Table Engines
    connection
      .executeAsync(`SELECT name, 'engine', -100, '' FROM system.table_engines ORDER BY name`, {
        default_format: "JSONCompact",
      })
      .response.then((response) => {
        const returnList = response.data.data;
        returnList.forEach((eachRowObject: any) => {
          processCompletionItem(eachRowObject);
        });
      })
      .catch((error) => {
        console.error("Failed to load table engine completion data:", error);
      });

    // Query 7: Formats
    connection
      .executeAsync(`SELECT name, 'format', -60, '' FROM system.formats WHERE is_output ORDER BY name`, {
        default_format: "JSONCompact",
      })
      .response.then((response) => {
        const returnList = response.data.data;
        returnList.forEach((eachRowObject: any) => {
          processCompletionItem(eachRowObject);
        });
      })
      .catch((error) => {
        console.error("Failed to load format completion data:", error);
      });

    //
    // Get keywords from system.keywords if the table exists
    //
    connection
      .executeAsync(`SELECT keyword, 'keyword', -10, '' FROM system.keywords ORDER BY keyword`, {
        default_format: "JSONCompact",
      })
      .response.then((response) => {
        const returnList = response.data.data as any[];
        const keywordCompletions: CompletionItem[] = returnList.map((eachRowObject) => {
          return {
            caption: eachRowObject[0],
            value: eachRowObject[0],
            meta: "keyword",
            score: -10,
          } as CompletionItem;
        });
        // Add keywords to miscCompletion
        this.miscCompletion.push(...keywordCompletions);
      })
      .catch(() => {
        // Silently fail if system.keywords table doesn't exist
        // This is expected for older ClickHouse versions
      });

    //
    // Get tables
    //
    connection
      .executeAsync(
        `SELECT database, name, comment FROM system.tables WHERE NOT startsWith(tables.name, '.inner') ORDER BY database, name`,
        {
          default_format: "JSONCompact",
        }
      )
      .response.then((response) => {
        this.tableCompletion.clear();

        const returnList = response.data.data as any[];
        const qualifiedTableCompletions: CompletionItem[] = [];
        returnList.forEach((eachRowObject) => {
          const database = eachRowObject[0];
          const table = eachRowObject[1];
          const comment = eachRowObject[2] || "";

          // Build docHTML with comment if available
          const docHTML = comment ? ["<b>", table, "</b>", "<hr />", comment].join("") : undefined;

          if (!this.tableCompletion.has(database)) {
            this.tableCompletion.set(database, []);
          }
          const completions = this.tableCompletion.get(database);
          completions?.push({
            caption: table,
            value: table,
            meta: "table",
            score: 100,
            docHTML: docHTML,
          });

          // Add qualified table name (database.table) to miscCompletion
          const qualifiedName = `${database}.${table}`;
          qualifiedTableCompletions.push({
            caption: qualifiedName,
            value: qualifiedName,
            meta: "table",
            score: 100,
            docHTML: docHTML,
          });
        });

        // Store qualified table completions in class property
        this.qualifiedTableCompletions = qualifiedTableCompletions;

        // Add all qualified table names to miscCompletion
        // If miscCompletion is empty, the main query hasn't completed yet, but that's okay
        // The qualified names will be added when the main query completes
        // If miscCompletion already has items, add them now
        if (this.miscCompletion.length > 0) {
          this.miscCompletion.push(...qualifiedTableCompletions);
        }
      })
      .catch((error) => {
        console.error("Failed to load table completion data:", error);
      });

    //
    // Get columns
    //
    connection
      .executeAsync(
        `SELECT table, name, type, comment FROM system.columns WHERE NOT startsWith(table, '.inner') ORDER BY table, name`,
        {
          default_format: "JSONCompact",
        }
      )
      .response.then((response) => {
        this.columnCompletion.clear();

        const returnList = response.data.data as any[];
        returnList.forEach((eachRowObject) => {
          const table = eachRowObject[0];
          const column = eachRowObject[1];
          const type = eachRowObject[2];
          const comment = eachRowObject[3] || "";

          // Build docHTML with type and comment if available
          const docHTMLParts = ["<b>", column, "</b>", "<hr />", "type: ", type];
          if (comment) {
            docHTMLParts.push("<hr />", comment);
          }
          const docHTML = docHTMLParts.join("");

          if (!this.columnCompletion.has(table)) {
            this.columnCompletion.set(table, []);
          }
          const completions = this.columnCompletion.get(table);
          completions?.push({
            caption: column,
            value: column,
            meta: "column",
            score: 100,
            docHTML: docHTML,
          });
        });
      })
      .catch((error) => {
        console.error("Failed to load column completion data:", error);
      });

    //
    // GET CLUSTER
    //
    if (connection.cluster && connection.cluster.length > 0) {
      this.clusterCompletion = [
        {
          caption: connection.cluster,
          value: connection.cluster,
          meta: "cluster",
          score: 100,
        },
      ];
    } else {
      connection
        .executeAsync(`SELECT distinct cluster FROM system.clusters ORDER BY cluster`, {
          default_format: "JSONCompact",
        })
        .response.then((response) => {
          const returnList = response.data.data as any[];
          this.clusterCompletion = returnList.map((eachRowObject) => {
            const cluster = eachRowObject[0];
            return {
              caption: cluster,
              value: cluster,
              meta: "cluster",
              score: 100,
            } as CompletionItem;
          });
        })
        .catch((error) => {
          console.error("Failed to load cluster completion data:", error);
        });
    }

    addClusterCompletions();
  }

  public getCompleters(completers: Ace.Completer[] | undefined): Ace.Completer[] {
    if (completers !== undefined) {
      // Remove the local completer which does not define the 'id' property. The local completer uses tokens in current editor as suggestion list.
      // Remove the default keyword because we're going to use the ClickHouse own keywords
      completers = completers.filter((completer) => completer.id !== undefined);
    } else {
      completers = [];
    }

    return [
      {
        id: "clickhouse-schema",
        triggerCharacters: [".", "="],

        /**
         * 'ENGINE ='
         * 'ENGINE = '
         * 'ENGINE = anyInput'
         *
         */
        getCompletions: (editor: Ace.Editor, session: Ace.EditSession, pos: Ace.Point, prefix: any, callback: any) => {
          if (session !== undefined) {
            // Get current token
            let currentToken = session.getTokenAt(pos.row, pos.column);

            // If current token is the 'dot' and this dot token is not the first,
            // we can continue to check previous token
            // Since the token might contain leading space, we use 'endsWith' to compare
            if (currentToken !== null && currentToken.index !== undefined && currentToken.index > 0) {
              const tokenList = session.getTokens(pos.row);

              // Find backward until it's a non-space token
              let currentTokenIndex = currentToken.index;

              // If the current token is blank text, it means that the auto-completion is triggered by Option+Space or Space key,
              // In this case, we need to backward the previous token to make decision which completion list should be used.
              // Only once backward
              let iterations = 2;
              if (currentTokenIndex > 0 && currentToken.type === "text" && StringUtils.isAllSpace(currentToken.value)) {
                currentToken = tokenList[--currentTokenIndex];

                // because here it's already backward
                iterations--;
              }

              // Process twice
              // The first time, we process input token to see if it matches the keyword.
              // In this case, the completion is most likely to be triggered by Option+Space hotkey.
              //
              // The 2nd time, we process previous token of current input,
              // In this case, the completion is triggered by keyboard input
              for (let i = 0; i < iterations; i++) {
                if (currentTokenIndex > 0 && currentToken.value.indexOf(".") > -1) {
                  if (this.getTableCompletion(currentTokenIndex, tokenList, callback)) {
                    return;
                  }
                } else if (currentTokenIndex > 0 && currentToken.value.indexOf("=") > -1) {
                  if (this.getEngineCompletion(currentTokenIndex, tokenList, callback)) {
                    return;
                  }
                } else {
                  if (currentToken.value.localeCompare("CLUSTER", undefined, { sensitivity: "accent" }) === 0) {
                    callback(null, this.clusterCompletion);
                    return;
                  }
                  if (currentToken.value.localeCompare("SETTINGS", undefined, { sensitivity: "accent" }) === 0) {
                    callback(null, this.allSettingsCompletion);
                    return;
                  }
                  if (currentToken.value.localeCompare("SETTING", undefined, { sensitivity: "accent" }) === 0) {
                    callback(null, this.allSettingsCompletion);
                    return;
                  }
                  if (currentToken.value.localeCompare("FORMAT", undefined, { sensitivity: "accent" }) === 0) {
                    callback(null, this.formatCompletion);
                    return;
                  }
                  if (currentToken.value.localeCompare("FROM", undefined, { sensitivity: "accent" }) === 0) {
                    callback(null, this.databaseCompletion);
                    return;
                  }
                  if (currentToken.value.localeCompare("SET", undefined, { sensitivity: "accent" }) === 0) {
                    callback(null, this.userSettingsCompletion);
                    return;
                  }

                  // Backward to the non-space token
                  do {
                    currentTokenIndex--;
                  } while (
                    currentTokenIndex > 0 &&
                    tokenList[currentTokenIndex].type === "text" &&
                    StringUtils.isAllSpace(tokenList[currentTokenIndex].value)
                  );
                  currentToken = tokenList[currentTokenIndex];
                }
              }
            }
          }

          // Use default completer
          callback(null, QuerySnippetManager.getInstance().getSnippetCompletionList());
          callback(null, this.miscCompletion);
          completers.forEach((c) => c.getCompletions(editor, session, pos, prefix, callback));
        },
      },
    ];
  }

  private getTableCompletion(currentTokenIndex: number, tokenList: any[], callback: any): boolean {
    const preToken = tokenList[currentTokenIndex - 1];

    const tableCompletion = this.tableCompletion.get(preToken.value);
    if (tableCompletion !== undefined) {
      callback(null, tableCompletion);
      return true;
    }

    const columnCompletion = this.columnCompletion.get(preToken.value);
    if (columnCompletion !== undefined) {
      callback(null, columnCompletion);
      return true;
    }

    return false;
  }

  private getEngineCompletion(currentTokenIndex: number, tokenList: any[], callback: any): boolean {
    let prevToken = null;
    do {
      prevToken = tokenList[--currentTokenIndex];
    } while (currentTokenIndex > 0 && prevToken.type === "text" && prevToken.value.trim() === "");

    if (prevToken.value.localeCompare("ENGINE", undefined, { sensitivity: "accent" }) === 0) {
      callback(null, this.engineCompletion);
      return true;
    }
    return false;
  }
}
