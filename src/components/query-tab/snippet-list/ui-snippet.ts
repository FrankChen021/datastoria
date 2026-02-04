import type { Snippet } from "../query-input/snippet/snippet";

export interface UISnippet {
  snippet: Snippet;
  matchedIndex: number;
  matchedLength: number;
}
