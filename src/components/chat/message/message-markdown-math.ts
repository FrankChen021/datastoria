function countRepeatedCharacter(source: string, start: number, character: string) {
  let end = start;
  while (source[end] === character) {
    end += 1;
  }
  return end - start;
}

function trimMathContent(content: string) {
  return content.replace(/^\s+|\s+$/g, "");
}

function getCurrentLineIndentation(text: string, index: number) {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  const line = text.slice(lineStart, index);
  const indentationMatch = line.match(/^[ \t]*/);
  return indentationMatch?.[0] ?? "";
}

function indentMathBlock(content: string, indentation: string) {
  const trimmed = trimMathContent(content);
  const lines = trimmed.split("\n");
  const indentedLines = lines.map((line) => `${indentation}${line.trim()}`);
  return `${indentation}$$\n${indentedLines.join("\n")}\n${indentation}$$`;
}

function getCurrentLinePrefix(text: string, index: number) {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  return text.slice(lineStart, index);
}

function skipOptionalIndent(text: string, index: number) {
  let markerStart = index;
  while (text[markerStart] === " " && markerStart - index < 3) {
    markerStart += 1;
  }
  return markerStart;
}

function getMarkdownLineContentStart(text: string, index: number) {
  let markerStart = skipOptionalIndent(text, index);
  let hasBlockquoteMarker = false;

  while (text[markerStart] === ">") {
    hasBlockquoteMarker = true;
    markerStart += 1;
    if (text[markerStart] === " " || text[markerStart] === "\t") {
      markerStart += 1;
    }
    markerStart = skipOptionalIndent(text, markerStart);
  }

  return { markerStart, hasBlockquoteMarker };
}

function getIndentedFenceMarker(
  text: string,
  index: number,
  { allowBlockquoteMarkers }: { allowBlockquoteMarkers: boolean }
) {
  const { markerStart, hasBlockquoteMarker } = getMarkdownLineContentStart(text, index);
  if (hasBlockquoteMarker && !allowBlockquoteMarkers) {
    return null;
  }

  const fenceCharacter = text[markerStart];
  if (fenceCharacter !== "`" && fenceCharacter !== "~") {
    return null;
  }

  const fenceCount = countRepeatedCharacter(text, markerStart, fenceCharacter);
  if (fenceCount < 3) {
    return null;
  }

  return {
    markerStart,
    marker: fenceCharacter.repeat(fenceCount),
    hasBlockquoteMarker,
  };
}

function isUnescapedDollar(text: string, index: number) {
  if (text[index] !== "$") {
    return false;
  }

  let backslashCount = 0;
  let cursor = index - 1;
  while (text[cursor] === "\\") {
    backslashCount += 1;
    cursor -= 1;
  }

  return backslashCount % 2 === 0;
}

function getLineEnd(text: string, lineStart: number) {
  const lineEnd = text.indexOf("\n", lineStart);
  return lineEnd === -1 ? text.length : lineEnd;
}

function findNumericInlineMathOpenIndexes(text: string, lineStart: number) {
  const lineEnd = getLineEnd(text, lineStart);
  const openIndexes = new Set<number>();
  let pendingNumericOpenIndex: number | null = null;
  let index = lineStart;

  while (index < lineEnd) {
    const character = text[index];

    if (character === "`") {
      pendingNumericOpenIndex = null;
      const delimiterLength = countRepeatedCharacter(text, index, "`");
      const delimiter = "`".repeat(delimiterLength);
      const closeIndex = text.indexOf(delimiter, index + delimiterLength);
      if (closeIndex === -1 || closeIndex >= lineEnd) {
        break;
      }
      index = closeIndex + delimiterLength;
      continue;
    }

    if (isUnescapedDollar(text, index)) {
      if (pendingNumericOpenIndex !== null) {
        const previousCharacter = text[index - 1] ?? "";
        const nextCharacter = text[index + 1] ?? "";
        if (!/\s/.test(previousCharacter) && !/\d/.test(nextCharacter)) {
          openIndexes.add(pendingNumericOpenIndex);
          pendingNumericOpenIndex = null;
          index += 1;
          continue;
        }
      }

      pendingNumericOpenIndex = /\d/.test(text[index + 1] ?? "") ? index : null;
    }

    index += 1;
  }

  return openIndexes;
}

export function escapeCurrencyDollarSigns(text: string) {
  let normalized = "";
  let index = 0;
  let atLineStart = true;
  let fenceMarker: string | null = null;
  let fenceHasBlockquoteMarker = false;
  let inlineCodeDelimiterLength = 0;
  const numericInlineMathOpenIndexesByLine = new Map<number, Set<number>>();

  function isNumericInlineMathOpen(openIndex: number) {
    const lineStart = text.lastIndexOf("\n", openIndex - 1) + 1;
    let openIndexes = numericInlineMathOpenIndexesByLine.get(lineStart);
    if (openIndexes === undefined) {
      openIndexes = findNumericInlineMathOpenIndexes(text, lineStart);
      numericInlineMathOpenIndexesByLine.set(lineStart, openIndexes);
    }
    return openIndexes.has(openIndex);
  }

  while (index < text.length) {
    if (atLineStart) {
      const fence = getIndentedFenceMarker(text, index, {
        allowBlockquoteMarkers: fenceMarker === null || fenceHasBlockquoteMarker,
      });
      const canCloseExistingFence =
        fenceMarker !== null &&
        fence !== null &&
        fence.marker[0] === fenceMarker[0] &&
        fence.marker.length >= fenceMarker.length;

      if (fence !== null) {
        const prefix = text.slice(index, fence.markerStart);
        if (fenceMarker === null) {
          fenceMarker = fence.marker;
          fenceHasBlockquoteMarker = fence.hasBlockquoteMarker;
        } else if (canCloseExistingFence) {
          fenceMarker = null;
          fenceHasBlockquoteMarker = false;
        }
        normalized += `${prefix}${fence.marker}`;
        index = fence.markerStart + fence.marker.length;
        atLineStart = false;
        continue;
      }
    }

    if (fenceMarker === null && text[index] === "`") {
      const backtickCount = countRepeatedCharacter(text, index, "`");
      if (inlineCodeDelimiterLength === 0) {
        inlineCodeDelimiterLength = backtickCount;
      } else if (inlineCodeDelimiterLength === backtickCount) {
        inlineCodeDelimiterLength = 0;
      }
      normalized += "`".repeat(backtickCount);
      index += backtickCount;
      atLineStart = false;
      continue;
    }

    const inCode = fenceMarker !== null || inlineCodeDelimiterLength > 0;
    const character = text[index] ?? "";

    if (
      !inCode &&
      character === "$" &&
      /\d/.test(text[index + 1] ?? "") &&
      !isNumericInlineMathOpen(index)
    ) {
      const previousCharacter = text[index - 1] ?? "";
      normalized += previousCharacter === "\\" ? "$" : "\\$";
      index += 1;
      atLineStart = false;
      continue;
    }

    normalized += character;
    atLineStart = character === "\n";
    index += 1;
  }

  return normalized;
}

export function normalizeMathMarkdown(text: string) {
  let normalized = "";
  let index = 0;
  let atLineStart = true;
  let fenceMarker: string | null = null;
  let fenceHasBlockquoteMarker = false;
  let inlineCodeDelimiterLength = 0;

  while (index < text.length) {
    if (atLineStart) {
      const fence = getIndentedFenceMarker(text, index, {
        allowBlockquoteMarkers: fenceMarker === null || fenceHasBlockquoteMarker,
      });
      const canCloseExistingFence =
        fenceMarker !== null &&
        fence !== null &&
        fence.marker[0] === fenceMarker[0] &&
        fence.marker.length >= fenceMarker.length;

      if (fence !== null) {
        const prefix = text.slice(index, fence.markerStart);
        if (fenceMarker === null) {
          fenceMarker = fence.marker;
          fenceHasBlockquoteMarker = fence.hasBlockquoteMarker;
        } else if (canCloseExistingFence) {
          fenceMarker = null;
          fenceHasBlockquoteMarker = false;
        }
        normalized += `${prefix}${fence.marker}`;
        index = fence.markerStart + fence.marker.length;
        atLineStart = false;
        continue;
      }
    }

    if (fenceMarker === null && text[index] === "`") {
      const backtickCount = countRepeatedCharacter(text, index, "`");
      if (inlineCodeDelimiterLength === 0) {
        inlineCodeDelimiterLength = backtickCount;
      } else if (inlineCodeDelimiterLength === backtickCount) {
        inlineCodeDelimiterLength = 0;
      }
      normalized += "`".repeat(backtickCount);
      index += backtickCount;
      atLineStart = false;
      continue;
    }

    const inCode = fenceMarker !== null || inlineCodeDelimiterLength > 0;
    if (!inCode && text.startsWith("\\[", index)) {
      const endIndex = text.indexOf("\\]", index + 2);
      if (endIndex !== -1) {
        const linePrefix = getCurrentLinePrefix(text, index);
        if (!/^[ \t]*$/.test(linePrefix)) {
          const character = text[index] ?? "";
          normalized += character;
          atLineStart = character === "\n";
          index += 1;
          continue;
        }

        const indentation = getCurrentLineIndentation(text, index);
        const content = text.slice(index + 2, endIndex);
        normalized = normalized.slice(0, normalized.length - linePrefix.length);

        if (!normalized.endsWith("\n\n")) {
          normalized += normalized.endsWith("\n") ? "\n" : "\n\n";
        }

        normalized += `${indentMathBlock(content, indentation)}\n`;
        index = endIndex + 2;
        atLineStart = false;
        continue;
      }
    }

    if (!inCode && text.startsWith("\\(", index)) {
      const endIndex = text.indexOf("\\)", index + 2);
      if (endIndex !== -1) {
        const content = text.slice(index + 2, endIndex);
        if (!content.includes("\n")) {
          normalized += `$${trimMathContent(content)}$`;
          index = endIndex + 2;
          atLineStart = false;
          continue;
        }
      }
    }

    const character = text[index] ?? "";
    normalized += character;
    atLineStart = character === "\n";
    index += 1;
  }

  return normalized;
}
