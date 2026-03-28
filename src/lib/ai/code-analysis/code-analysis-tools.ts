import { tool } from "ai";
import { z } from "zod";
import type { CodeAnalysisConfig } from "./code-analysis-config";
import { readCodeFile, searchCode } from "./code-analysis-service";

export function createCodeAnalysisTools(config: CodeAnalysisConfig) {
  return {
    search_file: tool({
      description:
        "Search the configured source project for relevant lines before reading files. Use this first to discover candidate files and line numbers. Query is plain text and matches case-insensitively. Results always use repo-relative paths. When citing files in the final answer, use the exact format [[file:path/to/file.ts#L12-L34]].",
      inputSchema: z.object({
        query: z.string().min(1).describe("Plain-text search query."),
        glob: z.string().optional().describe("Optional file-path glob, e.g. 'src/**/*.ts'."),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(`Max matches to return, capped at ${config.maxSearchResults}.`),
      }),
      execute: (input) => searchCode(config, input),
    }),
    read_file: tool({
      description:
        "Read a targeted section of a file from the configured source project. Prefer narrow line ranges after using search_file. Results use repo-relative paths and bounded output. When citing files in the final answer, use the exact format [[file:path/to/file.ts#L12-L34]].",
      inputSchema: z.object({
        path: z.string().min(1).describe("Repo-relative file path."),
        startLine: z.number().int().positive().optional().describe("1-based inclusive start line."),
        endLine: z.number().int().positive().optional().describe("1-based inclusive end line."),
      }),
      execute: (input) => readCodeFile(config, input),
    }),
  };
}
