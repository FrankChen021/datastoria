import type { Connection } from "@/lib/connection/connection";
import { StorageManager } from "@/lib/storage/storage-provider-manager";
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
  private listeners: Array<() => void> = [];

  private getStorage() {
    return StorageManager.getInstance()
      .getStorageProvider()
      .subStorage("sql:snippet")
      .withCompression(true);
  }

  private loadFromStorage(): void {
    try {
      const stored = this.getStorage().getAsJSON<Record<string, Snippet>>(() => ({}));
      this.snippets.clear();
      for (const [k, v] of Object.entries(stored)) {
        this.snippets.set(k, v);
      }
    } catch {
      this.snippets.clear();
    }
    this.snippetCompletionList = this.toCompletion();
    this.notifyListeners();
  }

  constructor() {
    this.snippets = new Map<string, Snippet>();
    this.snippetCompletionList = [];
    this.loadFromStorage();
    StorageManager.getInstance().subscribeToStorageProviderChange(() => this.loadFromStorage());
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener());
  }

  public getSnippets(): Snippet[] {
    return Array.from(this.snippets.values()).sort((a, b) => a.caption.localeCompare(b.caption));
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
    this.getStorage().setJSON(snippetsObj);
    this.snippetCompletionList = this.toCompletion();
    this.notifyListeners();
  }

  /**
   * Replace an existing snippet with new names
   */
  public replaceSnippet(old: string, newCaption: string, sql: string): void {
    this.snippets.delete(old);
    this.addSnippet(newCaption, sql);
  }

  public deleteSnippet(caption: string): void {
    this.snippets.delete(caption);
    const snippetsObj = Object.fromEntries(this.snippets);
    this.getStorage().setJSON(snippetsObj);
    this.snippetCompletionList = this.toCompletion();
    this.notifyListeners();
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
  onConnectionChanged(conn: Connection | null): void {
    const useCluster = conn !== null && conn.cluster !== undefined && conn.cluster.length > 0;

    builtinSnippet.forEach((snippet) => {
      this.snippets.set(snippet.caption, {
        sql: useCluster ? snippet.sql.replace("{cluster}", conn!.cluster!) : snippet.sql,
        caption: snippet.caption,
        builtin: true,
      });
    });

    this.snippetCompletionList = this.toCompletion();
    this.notifyListeners();
  }
}
