// This file a modified version of the file located at
// https://github.com/druid

import * as druidKeywords from './keywords';
// ace-builds uses CommonJS - import the default export
// @ts-ignore - ace-builds is CommonJS and may not have proper types
// @ts-expect-error - Vite transforms CommonJS, but types may not match
import ace from 'ace-builds/src-noconflict/ace';

ace.define(
  'ace/mode/dsql_highlight_rules',
  ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text_highlight_rules'],
  function (acequire, exports, module) {
    'use strict';

    var oop = acequire('../lib/oop');
    var TextHighlightRules = acequire('./text_highlight_rules').TextHighlightRules;

    var SqlHighlightRules = function () {
      // Stuff like: 'with|select|from|where|and|or|group|by|order|limit|having|as|case|'
      var keywords = druidKeywords.SQL_KEYWORDS.concat(druidKeywords.SQL_EXPRESSION_PARTS)
        .join('|')
        .replace(/\s/g, '|');

      // Stuff like: 'true|false'
      var builtinConstants = druidKeywords.SQL_CONSTANTS.join('|');

      // Stuff like: 'avg|count|first|last|max|min'
      var builtinFunctions = '';

      // Stuff like: 'int|numeric|decimal|date|varchar|char|bigint|float|double|bit|binary|text|set|timestamp'
      var dataTypes = 'int|numeric|decimal|date|varchar|char|bigint|float|double|bit|binary|text|set|timestamp';

      var keywordMapper = this.createKeywordMapper(
        {
          'support.function': builtinFunctions,
          keyword: keywords,
          'constant.language': builtinConstants,
          'storage.type': dataTypes,
        },
        'identifier',
        true
      );

      this.$rules = {
        start: [
          {
            token: 'comment',
            regex: '--.*$',
          },
          {
            token: 'comment',
            start: '/\\*',
            end: '\\*/',
          },
          {
            token: 'string', // " string
            regex: '".*?"',
          },
          {
            token: 'string', // ' string
            regex: "'.*?'",
          },
          {
            token: 'string', // ` string (apache drill)
            regex: '`.*?`',
          },
          {
            token: 'constant.numeric', // float
            regex: '[+-]?\\d+(?:(?:\\.\\d*)?(?:[eE][+-]?\\d+)?)?\\b',
          },
          {
            token: keywordMapper,
            regex: '[a-zA-Z_$][a-zA-Z0-9_$]*\\b',
          },
          {
            token: 'keyword.operator',
            regex: '\\+|\\-|\\/|\\/\\/|%|<@>|@>|<@|&|\\^|~|<|>|<=|=>|==|!=|<>|=',
          },
          {
            token: 'paren.lparen',
            regex: '[\\(]',
          },
          {
            token: 'paren.rparen',
            regex: '[\\)]',
          },
          {
            token: 'text',
            regex: '\\s+',
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
  'ace/mode/dsql',
  ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text', 'ace/mode/dsql_highlight_rules'],
  function (acequire, exports, module) {
    'use strict';

    var oop = acequire('../lib/oop');
    var TextMode = acequire('./text').Mode;
    var SqlHighlightRules = acequire('./dsql_highlight_rules').SqlHighlightRules;

    var Mode = function () {
      this.HighlightRules = SqlHighlightRules;
      this.$behaviour = this.$defaultBehaviour;
    };
    oop.inherits(Mode, TextMode);

    (function () {
      this.lineCommentStart = '--';

      this.$id = 'ace/mode/dsql';
    }.call(Mode.prototype));

    exports.Mode = Mode;
  }
);