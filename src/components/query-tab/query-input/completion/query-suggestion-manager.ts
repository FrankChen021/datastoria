import { markedAdmonitionExtension } from "@/lib/clickhouse/admonition-preprocessor";
import { transformMarkdownLink } from "@/lib/clickhouse/clickhouse-docs-link";
import { Connection, type JSONCompactFormatResponse } from "@/lib/connection/connection";
import { StringUtils } from "@/lib/string-utils";
import type { Ace } from "ace-builds";
import { marked } from "marked";
import { QuerySnippetManager } from "../../snippet/query-snippet-manager";

// Register the custom extension for :::type blocks (like :::note, :::warning)
marked.use({ extensions: [markedAdmonitionExtension] });

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

  /**
   * key: database name
   * value: table completions for the database
   */
  private tableCompletion: Map<string, CompletionItem[]> = new Map();
  private columnCompletion: Map<string, CompletionItem[]> = new Map();
  private allSettingsCompletion: CompletionItem[] = [];
  private userSettingsCompletion: CompletionItem[] = [];
  private formatCompletion: CompletionItem[] = [];
  private clusterCompletion: CompletionItem[] = [];
  private engineCompletion: CompletionItem[] = [];
  private currentConnectionName: string | null = null;
  private qualifiedTableCompletions: CompletionItem[] = [];

  /**
   * Convert markdown text to HTML for ACE editor docHTML
   */
  private static markdownToHtml(markdown: string, type?: string): string {
    if (!markdown) return "";
    try {
      // Create a custom renderer to customize link rendering
      const renderer = new marked.Renderer();

      // Override link renderer to add target="_blank", styling, and normalize URLs
      // marked v17 uses an object parameter: {href, title, tokens}
      // Use regular function (not arrow) to access 'this.parser'
      renderer.link = function ({
        href,
        title,
        tokens,
      }: {
        href: string | null;
        title?: string | null;
        tokens: any;
      }) {
        // Parse tokens to get the link text using the parser
        const text = this.parser
          ? this.parser.parseInline(tokens)
          : tokens.map((t: any) => t.raw || t.text || "").join("");

        if (!href) {
          // If no href, render just the text content
          return text;
        }

        // Style links with underline and color, open in new window
        const absoluteUrl = transformMarkdownLink(type || "default", href);
        const titleAttr = title ? ` title="${title}"` : "";
        return `<a href="${absoluteUrl}" target="_blank" rel="noopener noreferrer"${titleAttr} style="text-decoration: underline; cursor: pointer;">${text}</a>`;
      };

      // Use marked.parse() with custom renderer
      return marked.parse(markdown, {
        breaks: true, // Convert line breaks to <br>
        gfm: true, // GitHub Flavored Markdown
        renderer: renderer,
      }) as string;
    } catch (error) {
      console.error("Failed to convert markdown to HTML:", error);
      // Fallback: escape HTML and preserve line breaks
      return markdown
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br />");
    }
  }

  /**
   * Helper function to create docHTML with standard styling
   */
  private static createDescriptionHTML(
    title: string,
    markdownContent: string,
    type?: string,
    extraHtml: string = ""
  ): string {
    if (markdownContent === undefined || markdownContent === null) {
      return extraHtml;
    }

    //
    // Dedent the content to avoid it being treated as a code block
    // Actually this is not well formatted text
    //
    const lines = markdownContent.split("\n");
    let minIndent = Infinity;
    for (const line of lines) {
      // If the line is not empty
      if (/\S/.test(line)) {
        const indent = line.match(/^\s*/)![0].length;
        if (indent < minIndent) {
          minIndent = indent;
        }
      }
    }
    if (minIndent < Infinity && minIndent > 0) {
      markdownContent = lines.map((line) => line.slice(minIndent)).join("\n");
    }
    markdownContent = markdownContent.trim();

    const descriptionHtml = QuerySuggestionManager.markdownToHtml(markdownContent, type);
    if (markdownContent === "" && extraHtml === "") {
      return "";
    }

    return (
      '<div class="ace-tooltip-head">' +
      title +
      "</div>" +
      // Use max-height: 320px for scrollable content, but allow it to shrink for short content
      '<div class="ace-tooltip-scrollable">' +
      descriptionHtml +
      (extraHtml || "") +
      "</div>"
    );
  }

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
    /**
     * @param eachRowObject [name, type, score, description, extra description]
     */
    const processCompletionItem = (eachRowObject: any) => {
      const type = eachRowObject[1];

      let extraHtml = "";
      if (eachRowObject.length > 4 && eachRowObject[4] !== undefined) {
        extraHtml = eachRowObject[4];
      }

      const completion: CompletionItem = {
        caption: eachRowObject[0],
        value: eachRowObject[0],
        meta: type,
        score: eachRowObject[2],
        docHTML: QuerySuggestionManager.createDescriptionHTML(
          eachRowObject[0],
          eachRowObject[3] || "",
          eachRowObject[1],
          extraHtml
        ),
      };

      // Add custom insertMatch for function completions to position cursor inside parentheses
      if (type === "function") {
        completion.completer = {
          insertMatch: QuerySuggestionManager.insertFunctionCompletion,
        } as Ace.Completer;
      }

      if (type === "format") {
        this.formatCompletion.push(completion);
      } else if (type === "setting") {
        this.userSettingsCompletion.push(completion);
        this.allSettingsCompletion.push(completion);
      } else if (type === "merge_tree_setting" || type === "server_setting") {
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

    // Query 1: Databases - use metadata if available, otherwise query SQL
    if (connection.metadata?.databaseNames && connection.metadata.databaseNames.size > 0) {
      // Use metadata to build database completions
      const databaseCompletions: CompletionItem[] = [];

      for (const [dbName, dbInfo] of connection.metadata.databaseNames) {
        const completion: CompletionItem = {
          caption: dbName,
          value: dbName,
          meta: "database",
          score: -30,
          docHTML: QuerySuggestionManager.createDescriptionHTML(
            dbName,
            dbInfo.comment || "",
            "database"
          ),
        };

        databaseCompletions.push(completion);
        // Add to miscCompletion too
        this.miscCompletion.push(completion);
      }

      // Also add to databaseCompletion for specific database completion
      this.databaseCompletion = databaseCompletions;
    }

    // Query 2: Functions
    connection
      .query(
        `
SELECT * FROM (
        SELECT concat(name, '()') AS name, ${connection.metadata.function_table_has_description_column ? "description" : "''"} FROM system.functions WHERE is_aggregate = 0
    UNION ALL
        -- Aggregate Combinator
        SELECT concat(functions.name, combinator.name, '()') AS name, ${connection.metadata.function_table_has_description_column ? "functions.description" : "''"} FROM system.functions AS functions
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
        const returnList = response.data.json<JSONCompactFormatResponse>().data;
        returnList.forEach((eachRowObject: any) => {
          const suggestion = [eachRowObject[0], "function", -50, eachRowObject[1]];
          processCompletionItem(suggestion);
        });
      })
      .catch((error) => {
        console.error("Failed to load function completion data:", error);
      });

    // Query 3: Data Types
    connection
      .query(
        `SELECT multiIf(alias_to = '', name, alias_to) AS name, 'type', -0, '' FROM system.data_type_families`,
        {
          default_format: "JSONCompact",
        }
      )
      .response.then((response) => {
        const returnList = response.data.json<JSONCompactFormatResponse>().data;
        returnList.forEach((eachRowObject: unknown[]) => {
          processCompletionItem(eachRowObject);
        });
      })
      .catch((error) => {
        console.error("Failed to load data type completion data:", error);
      });

    // Query 4: Settings
    connection
      .query(`SELECT name, 'setting', -60, description, value FROM system.settings ORDER BY name`, {
        default_format: "JSONCompact",
      })
      .response.then((response) => {
        const returnList = response.data.json<JSONCompactFormatResponse>().data;
        returnList.forEach((eachRowObject: any) => {
          if (eachRowObject.length > 4 && eachRowObject[4] !== undefined) {
            eachRowObject[4] = `<div style="margin-top: 8px; font-weight: bold;">Current value: ${eachRowObject[4]}</div>`;
          }
          processCompletionItem(eachRowObject);
        });
      })
      .catch((error) => {
        console.error("Failed to load settings completion data:", error);
      });

    // Query 5: Merge Tree Settings
    connection
      .query(
        `SELECT name, 'merge_tree_setting', -100, description, value FROM system.merge_tree_settings ORDER BY name`,
        {
          default_format: "JSONCompact",
        }
      )
      .response.then((response) => {
        const returnList = response.data.json<JSONCompactFormatResponse>().data;
        returnList.forEach((eachRowObject: any) => {
          if (eachRowObject.length > 4 && eachRowObject[4] !== undefined) {
            eachRowObject[4] = `<div style="margin-top: 8px; font-weight: bold;">Current value: ${eachRowObject[4]}</div>`;
          }
          processCompletionItem(eachRowObject);
        });
      })
      .catch((error) => {
        console.error("Failed to load merge tree settings completion data:", error);
      });

    connection
      .query(
        `SELECT name, 'server_setting', -100, description, value FROM system.server_settings ORDER BY name`,
        {
          default_format: "JSONCompact",
        }
      )
      .response.then((response) => {
        const returnList = response.data.json<JSONCompactFormatResponse>().data;
        returnList.forEach((eachRowObject: any) => {
          if (eachRowObject.length > 4 && eachRowObject[4] !== undefined) {
            eachRowObject[4] = `<div style="margin-top: 8px; font-weight: bold;">Current value: ${eachRowObject[4]}</div>`;
          }
          processCompletionItem(eachRowObject);
        });
      })
      .catch((error) => {
        console.error("Failed to load server tree settings completion data:", error);
      });

    // Query 6: Table Engines
    connection
      .query(`SELECT name, 'engine', -100, '' FROM system.table_engines ORDER BY name`, {
        default_format: "JSONCompact",
      })
      .response.then((response) => {
        const returnList = response.data.json<JSONCompactFormatResponse>().data;
        returnList.forEach((eachRowObject: any) => {
          processCompletionItem(eachRowObject);
        });
      })
      .catch((error) => {
        console.error("Failed to load table engine completion data:", error);
      });

    // Query 7: Formats
    connection
      .query(`SELECT name, 'format', -60, '' FROM system.formats WHERE is_output ORDER BY name`, {
        default_format: "JSONCompact",
      })
      .response.then((response) => {
        const returnList = response.data.json<JSONCompactFormatResponse>().data;
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
      .query(`SELECT keyword, 'keyword', -10, '' FROM system.keywords ORDER BY keyword`, {
        default_format: "JSONCompact",
      })
      .response.then((response) => {
        const returnList = response.data.json<JSONCompactFormatResponse>().data;
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
    // Get tables from metadata (if available) or query SQL
    //
    if (connection.metadata?.tableNames && connection.metadata.tableNames.size > 0) {
      // Use metadata to build completions
      this.tableCompletion.clear();

      const qualifiedTableCompletions: CompletionItem[] = [];

      // Group tables by database for tableCompletion
      const tablesByDatabase = new Map<string, CompletionItem[]>();

      for (const [qualifiedName, tableInfo] of connection.metadata.tableNames) {
        const { database, table, comment } = tableInfo;

        // Add to database-specific table completion
        if (!tablesByDatabase.has(database)) {
          tablesByDatabase.set(database, []);
        }

        const docHTML = QuerySuggestionManager.createDescriptionHTML(table, comment || "", "table");
        tablesByDatabase.get(database)?.push({
          caption: table,
          value: table,
          meta: "table",
          score: 100,
          docHTML: docHTML,
        });

        // Add qualified table name (database.table) to qualified completions
        qualifiedTableCompletions.push({
          caption: qualifiedName,
          value: qualifiedName,
          meta: "table",
          score: 100,
          docHTML: docHTML,
        });
      }

      // Set tableCompletion from grouped data
      for (const [database, completions] of tablesByDatabase) {
        this.tableCompletion.set(database, completions);
      }

      // Store qualified table completions in class property
      this.qualifiedTableCompletions = qualifiedTableCompletions;

      // Add all qualified table names to miscCompletion
      // If miscCompletion is empty, the main query hasn't completed yet, but that's okay
      // The qualified names will be added when the main query completes
      // If miscCompletion already has items, add them now
      if (this.miscCompletion.length > 0) {
        this.miscCompletion.push(...qualifiedTableCompletions);
      }
    }

    //
    // Get columns
    //
    connection
      .query(
        `SELECT table, name, type, comment FROM system.columns WHERE NOT startsWith(table, '.inner') ORDER BY table, name`,
        {
          default_format: "JSONCompact",
        }
      )
      .response.then((response) => {
        this.columnCompletion.clear();

        const returnList = response.data.json<JSONCompactFormatResponse>().data;
        returnList.forEach((eachRowObject) => {
          const table = eachRowObject[0] as string;
          const column = eachRowObject[1] as string;
          const type = eachRowObject[2] as string;
          const comment = (eachRowObject[3] as string) || "";

          if (!this.columnCompletion.has(table)) {
            this.columnCompletion.set(table, []);
          }
          const completions = this.columnCompletion.get(table);
          completions?.push({
            caption: column,
            value: column,
            meta: "column",
            score: 100,
            docHTML: QuerySuggestionManager.createDescriptionHTML(
              column,
              comment,
              "column",
              `type: ${type}`
            ),
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
        .query(`SELECT distinct cluster FROM system.clusters ORDER BY cluster`, {
          default_format: "JSONCompact",
        })
        .response.then((response) => {
          const returnList = response.data.json<JSONCompactFormatResponse>().data;
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

  /**
   * Get all qualified table names for highlighting
   */
  public getQualifiedTableNames(): string[] {
    return this.qualifiedTableCompletions
      .map((c) => c.value)
      .filter((v): v is string => v !== undefined);
  }

  /**
   * Custom insertMatch function for function completions that positions the cursor
   * inside the parentheses after inserting the function name
   */
  private static insertFunctionCompletion(editor: Ace.Editor, completion: Ace.Completion): void {
    const session = editor.getSession();
    const pos = editor.getCursorPosition();
    const value = completion.value || completion.caption || "";

    // Find the start of the prefix to replace
    const line = session.getLine(pos.row);
    let startCol = pos.column;
    while (startCol > 0 && /[\w$]/.test(line[startCol - 1])) {
      startCol--;
    }

    // Replace the prefix with the function name
    const range = {
      start: { row: pos.row, column: startCol },
      end: { row: pos.row, column: pos.column },
    };

    session.replace(range, value);

    // Move cursor back one character to position it inside the parentheses
    // This works because function names end with '()', so we want cursor between '(' and ')'
    const newPos = editor.getCursorPosition();
    if (newPos.column > 0) {
      editor.moveCursorTo(newPos.row, newPos.column - 1);
    }
  }

  /**
   * Custom insertMatch function for table completions that removes the '@' trigger character
   * when inserting the completion
   */
  private static insertTableCompletion(editor: Ace.Editor, table: Ace.Completion): void {
    const session = editor.getSession();
    const pos = editor.getCursorPosition();
    const line = session.getLine(pos.row);

    // Find the '@' before the cursor
    let startCol = pos.column;
    while (startCol > 0 && line[startCol - 1] !== "@") {
      startCol--;
    }
    if (startCol > 0 && line[startCol - 1] === "@") {
      startCol--; // Include the '@' in the range to replace
    }

    // Replace from '@' to cursor position with the table name
    const range = {
      start: { row: pos.row, column: startCol },
      end: { row: pos.row, column: pos.column },
    };

    session.replace(range, table.value || table.caption || "");
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
        getCompletions: (
          editor: Ace.Editor,
          session: Ace.EditSession,
          pos: Ace.Point,
          prefix: any,
          callback: any
        ) => {
          if (session !== undefined) {
            // Get current token with 'start' and 'index' property assigned at the edit position
            let currentToken = session.getTokenAt(pos.row, pos.column);

            // If current token is the 'dot' and this dot token is not the first,
            // we can continue to check previous token
            // Since the token might contain leading space, we use 'endsWith' to compare
            if (
              currentToken !== null &&
              currentToken.index !== undefined &&
              currentToken.index > 0
            ) {
              // tokens in the list does not contain the 'start' and 'index' property, the behavior is strange
              const tokenList = session.getTokens(pos.row);

              // Find backward until it's a non-space token
              let currentTokenIndex = currentToken.index;

              // If the current token is blank text, it means that the auto-completion is triggered by Option+Space or Space key,
              // In this case, we need to backward the previous token to make decision which completion list should be used.
              // Only once backward
              let iterations = 2;
              if (
                currentTokenIndex > 0 &&
                currentToken.type === "text" &&
                StringUtils.isAllSpace(currentToken.value)
              ) {
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
                  if (
                    currentToken.value.localeCompare("CLUSTER", undefined, {
                      sensitivity: "accent",
                    }) === 0
                  ) {
                    callback(null, this.clusterCompletion);
                    return;
                  }
                  if (
                    currentToken.value.localeCompare("SETTINGS", undefined, {
                      sensitivity: "accent",
                    }) === 0
                  ) {
                    callback(null, this.allSettingsCompletion);
                    return;
                  }
                  if (
                    currentToken.value.localeCompare("SETTING", undefined, {
                      sensitivity: "accent",
                    }) === 0
                  ) {
                    callback(null, this.allSettingsCompletion);
                    return;
                  }
                  if (
                    currentToken.value.localeCompare("FORMAT", undefined, {
                      sensitivity: "accent",
                    }) === 0
                  ) {
                    callback(null, this.formatCompletion);
                    return;
                  }
                  if (
                    currentToken.value.localeCompare("FROM", undefined, {
                      sensitivity: "accent",
                    }) === 0
                  ) {
                    callback(null, this.qualifiedTableCompletions);
                    return;
                  }
                  if (
                    currentToken.value.localeCompare("SET", undefined, {
                      sensitivity: "accent",
                    }) === 0
                  ) {
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

  /**
   * Get table completers for chat mode that trigger on '@' character
   * Returns all qualified table names (database.table) as suggestions
   */
  public getTableCompleters(): Ace.Completer[] {
    return [
      {
        id: "table-suggestion",
        triggerCharacters: ["@"],

        getCompletions: (
          editor: Ace.Editor,
          session: Ace.EditSession,
          pos: Ace.Point,
          prefix: string,
          callback: (error: Error | null, completions: CompletionItem[]) => void
        ) => {
          const tokenList = session.getTokens(pos.row);

          // Check if we're in a context where '@' was typed
          // Look for '@' in the prefix or check if the character before cursor is '@'
          if (tokenList.length > 0 && tokenList[tokenList.length - 1].value.startsWith("@")) {
            const searchPrefix = prefix.replace("@", "").toLowerCase();

            // Filter completions based on the search prefix (after @)
            const tableCompletions = searchPrefix
              ? this.qualifiedTableCompletions.filter(
                  (c) => c.value && c.value.toLowerCase().includes(searchPrefix)
                )
              : this.qualifiedTableCompletions;

            // Add custom insertMatch to each completion item
            const finalCompletionItems = tableCompletions.map((tableCompletion) => ({
              ...tableCompletion,
              completer: {
                insertMatch: QuerySuggestionManager.insertTableCompletion,
              },
            })) as CompletionItem[];

            callback(null, finalCompletionItems);
            return;
          }

          // No completions if '@' not found
          callback(null, []);
        },
      },
    ];
  }
}
