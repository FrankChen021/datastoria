import * as React from "react";

export class TextHighlighter {
  public static highlight(
    text: string,
    search: string,
    matchedCssStyleClass: string = "text-yellow-500"
  ): React.ReactNode {
    const textLower = text.toLowerCase();
    const searchLower = search.toLowerCase();
    const start = textLower.indexOf(searchLower);
    return TextHighlighter.highlight2(text, start, start + search.length, matchedCssStyleClass);
  }

  public static highlight2(
    text: string,
    start: number,
    end: number,
    matchedCssStyleClass: string
  ): React.ReactNode {
    if (start > -1) {
      const first = text.substring(0, start);
      const middle = text.substring(start, end);
      const last = text.substring(end);
      return (
        <>
          <span>{first}</span>
          {middle.length > 0 && (
            <span className={matchedCssStyleClass}>
              <b>{middle}</b>
            </span>
          )}
          <span>{last}</span>
        </>
      );
    } else {
      return text;
    }
  }
}
