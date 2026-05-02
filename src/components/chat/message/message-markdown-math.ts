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

function getIndentedFenceMarker(text: string, index: number) {
  let markerStart = index;
  while (text[markerStart] === " " && markerStart - index < 3) {
    markerStart += 1;
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
  };
}

function hasNumericInlineMathClose(text: string, openIndex: number) {
  let index = openIndex + 1;
  while (index < text.length) {
    const character = text[index];

    if (character === "`" || character === "\n") {
      return false;
    }

    if (character === "$" && text[index - 1] !== "\\") {
      if (/\s/.test(text[index - 1] ?? "")) {
        return false;
      }
      return !/\d/.test(text[index + 1] ?? "");
    }

    index += 1;
  }

  return false;
}

export function escapeCurrencyDollarSigns(text: string) {
  let normalized = "";
  let index = 0;
  let atLineStart = true;
  let fenceMarker: string | null = null;
  let inlineCodeDelimiterLength = 0;

  while (index < text.length) {
    if (atLineStart) {
      const fence = getIndentedFenceMarker(text, index);
      const canCloseExistingFence =
        fenceMarker !== null &&
        fence !== null &&
        fence.marker[0] === fenceMarker[0] &&
        fence.marker.length >= fenceMarker.length;

      if (fence !== null) {
        const prefix = text.slice(index, fence.markerStart);
        if (fenceMarker === null) {
          fenceMarker = fence.marker;
        } else if (canCloseExistingFence) {
          fenceMarker = null;
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
      !hasNumericInlineMathClose(text, index)
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
  let inlineCodeDelimiterLength = 0;

  while (index < text.length) {
    if (atLineStart) {
      const fence = getIndentedFenceMarker(text, index);
      const canCloseExistingFence =
        fenceMarker !== null &&
        fence !== null &&
        fence.marker[0] === fenceMarker[0] &&
        fence.marker.length >= fenceMarker.length;

      if (fence !== null) {
        const prefix = text.slice(index, fence.markerStart);
        if (fenceMarker === null) {
          fenceMarker = fence.marker;
        } else if (canCloseExistingFence) {
          fenceMarker = null;
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
