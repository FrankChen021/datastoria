import type { Ace } from "ace-builds";
import { QuerySuggestionManager } from "./query-suggestion-manager";

/**
 * Custom ACE mode for chat input that:
 * 1. Tokenizes text by whitespace
 * 2. Highlights table names (database.table format)
 * 3. No keyword highlighting
 */
export function defineChatMode() {
  const ace = (window as any).ace;
  if (!ace) return;

  ace.define(
    "ace/mode/chat",
    [
      "require",
      "exports",
      "module",
      "ace/lib/oop",
      "ace/mode/text",
      "ace/mode/text_highlight_rules",
    ],
    function (require: any, exports: any) {
      const oop = require("ace/lib/oop");
      const TextMode = require("ace/mode/text").Mode;
      const TextHighlightRules = require("ace/mode/text_highlight_rules").TextHighlightRules;

      // Shared function to build highlighting rules for table names
      const buildHighlightRules = function (this: any, tableNames: string[]) {
        // Escape special regex characters in table names (especially dots in database.table)
        const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        // Create keyword mapper to classify tokens
        // Maps table names to 'keyword' token type, with default 'table.name' for non-matching
        const keywordMapper = this.createKeywordMapper(
          {
            keyword: tableNames.join("|"),
          },
          "table.name", // default token type for non-table identifiers
          false // case sensitive
        );

        // Create a regex pattern that matches table names with word boundaries
        // Use \b for word boundaries to ensure exact matches (e.g., a.b won't match a.bb)
        const tablePattern =
          tableNames.length > 0 ? `\\b(${tableNames.map(escapeRegex).join("|")})\\b` : null;

        return {
          start: tablePattern
            ? [
                {
                  token: keywordMapper, // Use keyword mapper to assign token type
                  regex: tablePattern, // Match exact table names with word boundaries
                },
                {
                  token: "token",
                  merge: false,
                  regex: "[^\\s]+",
                },
              ]
            : [
                {
                  token: "text",
                  regex: "[^\\s]+",
                },
              ],
        };
      };

      // Define highlighting rules for chat mode
      const ChatHighlightRules = function (this: any) {
        // Get all table names from QuerySuggestionManager
        const tableNames = QuerySuggestionManager.getInstance().getQualifiedTableNames();

        // Use shared function to build rules
        this.$rules = buildHighlightRules.call(this, tableNames);
      };

      oop.inherits(ChatHighlightRules, TextHighlightRules);

      // Define the chat mode
      const ChatMode = function (this: any) {
        this.HighlightRules = ChatHighlightRules;
      };

      oop.inherits(ChatMode, TextMode);

      (function (this: any) {
        this.$id = "ace/mode/chat";

        // Update table names dynamically
        this.updateTableNames = function () {
          const tableNames = QuerySuggestionManager.getInstance().getQualifiedTableNames();

          const highlightRules = this.$highlightRules || this.HighlightRules;
          if (highlightRules) {
            // Use shared function to rebuild rules with updated table names
            highlightRules.$rules = buildHighlightRules.call(highlightRules, tableNames);
          }
        };
      }).call(ChatMode.prototype);

      exports.Mode = ChatMode;
    }
  );
}

/**
 * Update table name highlighting in chat mode
 */
export function updateChatModeTableNames(editor: Ace.Editor) {
  const session = editor.getSession();
  if (session) {
    const mode = session.getMode() as any;

    if (mode && mode.$id === "ace/mode/chat" && typeof mode.updateTableNames === "function") {
      mode.updateTableNames();
      // Force re-tokenization
      session.bgTokenizer.start(0);
    }
  }
}
