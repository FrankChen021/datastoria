import AnsiToHtml from "ansi-to-html";
import { useMemo } from "react";

/**
 * Check if a string contains ANSI escape codes
 */
export function containsAnsiCodes(text: string): boolean {
  // ANSI escape codes start with ESC (0x1B or \x1B) followed by [ and control characters
  // Common patterns: \x1B[XXXm where XXX is a number (color/style code)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences require control characters
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /\x1B\[[0-9;]*m/;
  return ansiRegex.test(text);
}

/**
 * React component to render text with ANSI color codes
 */
export function AnsiText({ children }: { children: string }) {
  const html = useMemo(() => {
    // Create a new converter instance to ensure proper color handling
    const converter = new AnsiToHtml({
      newline: true,
      escapeXML: true,
      stream: false,
      // Use default ANSI colors which will work well with both light and dark themes
      colors: {
        0: "#000",
        1: "#A00",
        2: "#0A0",
        3: "#A50",
        4: "#00A",
        5: "#A0A",
        6: "#0AA",
        7: "#AAA",
        8: "#555",
        9: "#F55",
        10: "#5F5",
        11: "#FF5",
        12: "#55F",
        13: "#F5F",
        14: "#5FF",
        15: "#FFF",
      },
    });
    return converter.toHtml(children);
  }, [children]);

  return (
    <div
      className="ansi-text"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: ANSI codes are escaped by ansi-to-html library
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
