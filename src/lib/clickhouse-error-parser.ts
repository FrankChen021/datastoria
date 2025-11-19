export interface ErrorLocation {
  lineNumber: number;
  columnNumber: number;
  contextLines: Array<{ lineNum: number; content: string; isErrorLine: boolean }>;
  caretPosition: number;
  message?: string;
}

type ErrorHandler = (detailMessage: string, sql: string) => ErrorLocation | null;

function buildErrorLocation(
  lineNumber: number,
  columnNumber: number,
  sql: string,
  message?: string
): ErrorLocation | null {
  if (isNaN(lineNumber) || isNaN(columnNumber) || lineNumber < 1 || columnNumber < 1) {
    return null;
  }

  const sqlLines = sql.split("\n");
  if (lineNumber > sqlLines.length) {
    return null;
  }

  // Calculate start line (3 lines before error line, or line 1 if error is too early)
  const startLine = Math.max(1, lineNumber - 3);
  // Calculate end line (3 lines after error line, or last line if error is too late)
  const endLine = Math.min(sqlLines.length, lineNumber + 3);

  // Build context lines with line numbers
  const contextLines: Array<{ lineNum: number; content: string; isErrorLine: boolean }> = [];
  let errorLineContent = "";
  for (let i = startLine; i <= endLine; i++) {
    const lineIndex = i - 1; // Convert to 0-based index
    const lineContent = sqlLines[lineIndex] || "";
    const isErrorLine = i === lineNumber;

    // For error line, show only first 50 characters if column is smaller than 50
    let displayContent = lineContent;
    if (isErrorLine && columnNumber <= 50) {
      displayContent = lineContent.substring(0, 50);
    }

    if (isErrorLine) {
      errorLineContent = displayContent;
    }

    contextLines.push({
      lineNum: i,
      content: displayContent,
      isErrorLine,
    });
  }

  // Calculate caret position for error line - use tracked errorLineContent instead of find
  const caretPosition = Math.min(columnNumber - 1, errorLineContent.length - 1);

  return {
    lineNumber,
    columnNumber,
    contextLines,
    caretPosition,
    message,
  };
}

/**
 * Extract line and column from pattern: (line 12, col 4)
 */
const handleCode62: ErrorHandler = (detailMessage, sql) => {
  let match = detailMessage.match(/\(line\s+(\d+),\s*col\s+(\d+)\)/i);
  let lineNumber: number;
  let columnNumber: number;

  if (match) {
    lineNumber = parseInt(match[1], 10);
    columnNumber = parseInt(match[2], 10);
  } else {
    // Fallback: try pattern "failed at position yyy" where yyy is a number
    match = detailMessage.match(/failed at position\s+(\d+)/i);
    if (!match) {
      return null;
    }
    // For this pattern, line number is 1, column is the captured position
    lineNumber = 1;
    columnNumber = parseInt(match[1], 10);
  }

  return buildErrorLocation(lineNumber, columnNumber, sql, "Syntax error");
};

const isIdentifierChar = (char: string) => /[a-zA-Z0-9_]/.test(char);

const CODE_47_PATTERNS = [
  /(Unknown expression identifier) [`']([^`']+)['`]/i,
  /(Missing columns): [`']([^`']+)['`]/i,
];

/**
 * Unknown expression identifier `compressed_size` in scope
 * OR
 * Missing columns: 'compressed_size' while processing query
 */
const handleCode47: ErrorHandler = (detailMessage, sql) => {
  let message = "";
  let identifier: string | null = null;
  for (const pattern of CODE_47_PATTERNS) {
    const match = detailMessage.match(pattern);
    if (match) {
      message = match[1];
      identifier = match[2];
      break;
    }
  }

  if (!identifier) {
    return null;
  }

  let identifierIndex = -1;
  let startIndex = 0;

  while (true) {
    const index = sql.indexOf(identifier, startIndex);
    if (index === -1) {
      break;
    }

    // Check if it's a whole word (not part of another identifier)
    const charBefore = index > 0 ? sql[index - 1] : "";
    const charAfter = index + identifier.length < sql.length ? sql[index + identifier.length] : "";

    if (!isIdentifierChar(charBefore) && !isIdentifierChar(charAfter)) {
      identifierIndex = index;
      break;
    }

    startIndex = index + 1;
  }

  if (identifierIndex === -1) {
    return null;
  }

  // Calculate line number and column number from index
  const sqlBeforeError = sql.substring(0, identifierIndex);
  const newlines = sqlBeforeError.match(/\n/g);
  const lineNumber = (newlines ? newlines.length : 0) + 1;

  const lastNewlineIndex = sqlBeforeError.lastIndexOf("\n");
  const columnNumber = identifierIndex - lastNewlineIndex; // 1-based column since lastNewlineIndex is -1 if not found, or index of \n.

  return buildErrorLocation(lineNumber, columnNumber, sql, message);
};

const ERROR_HANDLERS: Record<string, ErrorHandler> = {
  "47": handleCode47,
  "62": handleCode62,
};

/**
 * TODO:    * Code: 206. DB::Exception: No alias for subquery or table function in JOIN (set joined_subquery_requires_alias=0 to disable restriction). While processing ' (SELECT * FROM system.tables AS B)'. (ALIAS_REQUIRED) (version vSClickhouse-22.3-011)
 * extract while parsing xxxxx
 */
export function parseErrorLocation(
  clickHouseErrorCode: string | undefined,
  detailMessage: string | null,
  sql: string | undefined
): ErrorLocation | null {
  if (!clickHouseErrorCode || !detailMessage || !sql) {
    return null;
  }

  const handler = ERROR_HANDLERS[clickHouseErrorCode];
  if (handler) {
    return handler(detailMessage, sql);
  }

  return null;
}
