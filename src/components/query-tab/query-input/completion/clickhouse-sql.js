// Based on https://github.com/thlorenz/brace/blob/master/mode/sql.js

import * as keywordsModule from "./keywords";

// Access ace from global scope (set by ace-setup.ts)
// This avoids importing ace-builds at module level which causes SSR issues
const ace = typeof window !== "undefined" ? window.ace : null;

if (ace) {
  ace.define(
    "ace/mode/dsql_highlight_rules",
    ["require", "exports", "module", "ace/lib/oop", "ace/mode/text_highlight_rules"],
    function (acequire, exports, module) {
      "use strict";

      var oop = acequire("../lib/oop");
      var TextHighlightRules = acequire("./text_highlight_rules").TextHighlightRules;

      var SqlHighlightRules = function () {
        // Stuff like: 'with|select|from|where|and|or|group|by|order|limit|having|as|case|'
        var keywords = keywordsModule.SQL_KEYWORDS.concat(keywordsModule.SQL_EXPRESSION_PARTS)
          .join("|")
          .replace(/\s/g, "|");

        // Stuff like: 'true|false'
        var builtinConstants = keywordsModule.SQL_CONSTANTS.join("|");

        // Stuff like: 'avg|count|first|last|max|min'
        var builtinFunctions = "";

        // Stuff like: 'int|numeric|decimal|date|varchar|char|bigint|float|double|bit|binary|text|set|timestamp'
        var dataTypes =
          "int|numeric|decimal|date|varchar|char|bigint|float|double|bit|binary|text|set|timestamp";

        var keywordMapper = this.createKeywordMapper(
          {
            "support.function": builtinFunctions,
            keyword: keywords,
            "constant.language": builtinConstants,
            "storage.type": dataTypes,
          },
          "identifier",
          true
        );

        this.$rules = {
          start: [
            {
              token: "comment",
              regex: "--.*$",
            },
            {
              token: "comment",
              start: "/\\*",
              end: "\\*/",
            },
            {
              token: "string", // " string
              regex: '".*?"',
            },
            {
              token: "string", // ' string
              regex: "'.*?'",
            },
            {
              token: "string", // ` string (apache drill)
              regex: "`.*?`",
            },
            {
              token: "constant.numeric", // float
              regex: "[+-]?\\d+(?:(?:\\.\\d*)?(?:[eE][+-]?\\d+)?)?\\b",
            },
            {
              token: keywordMapper,
              regex: "[a-zA-Z_$][a-zA-Z0-9_$]*\\b",
            },
            {
              token: "keyword.operator",
              regex: "\\+|\\-|\\/|\\/\\/|%|<@>|@>|<@|&|\\^|~|<|>|<=|=>|==|!=|<>|=",
            },
            {
              token: "paren.lparen",
              regex: "[\\(]",
            },
            {
              token: "paren.rparen",
              regex: "[\\)]",
            },
            {
              token: "text",
              regex: "\\s+",
            },
          ],
        };
        this.normalizeRules();
      };

      oop.inherits(SqlHighlightRules, TextHighlightRules);

      exports.SqlHighlightRules = SqlHighlightRules;
    }
  );

  ace.define(
    "ace/mode/dsql",
    [
      "require",
      "exports",
      "module",
      "ace/lib/oop",
      "ace/mode/text",
      "ace/mode/dsql_highlight_rules",
      "ace/mode/folding/cstyle",
    ],
    function (acequire, exports, module) {
      "use strict";

      var oop = acequire("../lib/oop");
      var TextMode = acequire("./text").Mode;
      var SqlHighlightRules = acequire("./dsql_highlight_rules").SqlHighlightRules;
      var FoldMode = acequire("./folding/cstyle").FoldMode;

      var Mode = function () {
        this.HighlightRules = SqlHighlightRules;
        this.foldingRules = new FoldMode();
        this.$behaviour = this.$defaultBehaviour;
      };
      oop.inherits(Mode, TextMode);

      (function () {
        this.lineCommentStart = "--";
        this.blockComment = { start: "/*", end: "*/" };

        this.$id = "ace/mode/dsql";
      }).call(Mode.prototype);

      exports.Mode = Mode;
    }
  );
}
