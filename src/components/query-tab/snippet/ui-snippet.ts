import type { Snippet } from "./snippet";

export interface UISnippet {
  snippet: Snippet;
  matchedIndex: number;
  matchedLength: number;
}
