import type { Connection } from "@/lib/connection/connection";
import { LocalStorage } from "@/lib/local-storage";
import type { Ace } from "ace-builds";
import { builtinSnippet } from "./builtin-snippet";
import type { Snippet } from "./snippet";

export class QuerySnippetManager {
  private static instance: QuerySnippetManager;

  public static getInstance(): QuerySnippetManager {
    return this.instance || (this.instance = new this());
  }

  private readonly snippets: Map<string, Snippet>;
  private snippetCompletionList: Ace.SnippetCompletion[];

  constructor() {
    try {
      const stored = LocalStorage.getInstance().getAsJSON<Record<string, Snippet>>(
        "query-snippet",
        () => ({})
      );
      this.snippets = new Map(Object.entries(stored));
    } catch (e) {
      this.snippets = new Map<string, Snippet>();
    }

    this.snippetCompletionList = this.toCompletion();
  }

  public getSnippetCompletionList(): Ace.SnippetCompletion[] {
    return this.snippetCompletionList;
  }

  public hasSnippet(caption: string): boolean {
    return this.snippets.has(caption);
  }

  public addSnippet(caption: string, sql: string): void {
    this.snippets.set(caption, { caption: caption, sql: sql, builtin: false });
    const snippetsObj = Object.fromEntries(this.snippets);
    LocalStorage.getInstance().setJSON("query-snippet", snippetsObj);
    this.snippetCompletionList = this.toCompletion();
  }

  /**
   * Replace an existing snippet with new names
   */
  public replaceSnippet(old: string, newCaption: string, sql: string): void {
    this.snippets.delete(old);
    this.addSnippet(newCaption, sql);
  }

  private toCompletion(): Ace.SnippetCompletion[] {
    const completions: Ace.SnippetCompletion[] = [];
    this.snippets.forEach((snippet) => {
      completions.push({
        caption: snippet.caption,
        snippet: snippet.sql,
        meta: "snippet",
      });
    });
    return completions.sort((a, b) => {
      return (a.caption as string).localeCompare(b.caption as string);
    });
  }

  // Process connection
  onCollectionSelected(conn: Connection | null): void {
    const useCluster = conn !== null && conn.cluster !== undefined && conn.cluster.length > 0;

    builtinSnippet.forEach((snippet) => {
      this.snippets.set(snippet.caption, {
        sql: useCluster ? snippet.sql.replace("{cluster}", conn!.cluster!) : snippet.sql,
        caption: snippet.caption,
        builtin: true,
      });
    });

    this.snippetCompletionList = this.toCompletion();
  }
}
