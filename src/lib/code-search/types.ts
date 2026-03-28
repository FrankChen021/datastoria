export interface CodeSearchConfig {
  enabled: true;
  rootDir: string;
  maxFileBytes: number;
  maxReadLines: number;
  maxSearchResults: number;
  ignoredNames: string[];
}

export interface DisabledCodeSearchConfig {
  enabled: false;
  reason:
    | "missing_local"
    | "invalid_limits"
    | "missing_remote"
    | "invalid_local"
    | "unreadable_local"
    | "not_directory"
    | "materialize_failed";
}

export type CodeSearchConfigResult = CodeSearchConfig | DisabledCodeSearchConfig;

export interface SearchFileInput {
  query: string;
  glob?: string;
  limit?: number;
}

export interface SearchFileMatch {
  path: string;
  line: number;
  snippet: string;
}

export interface SearchFileSuccess {
  matches: SearchFileMatch[];
  hasMore: boolean;
}

export interface SearchFileFailure {
  error: string;
}

export type SearchFileResult = SearchFileSuccess | SearchFileFailure;

export interface ReadFileInput {
  path: string;
  startLine?: number;
  endLine?: number;
  maxLines?: number;
  maxBytes?: number;
}

export interface ReadFileSuccess {
  path: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  content: string;
  truncated: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface ReadFileFailure {
  error: string;
}

export type ReadFileResult = ReadFileSuccess | ReadFileFailure;

export interface ListFilesSuccess {
  paths: string[];
}

export interface ListFilesFailure {
  error: string;
}

export type ListFilesResult = ListFilesSuccess | ListFilesFailure;

export interface CodeSearch {
  searchFile(input: SearchFileInput): Promise<SearchFileResult>;
  readFile(input: ReadFileInput): Promise<ReadFileResult>;
  listFiles(): Promise<ListFilesResult>;
}
