import { readFileSync } from "node:fs";
import { join } from "node:path";

const schemaCache = new Map<string, string>();

export function readRepositorySchemaSql(fileName: string): string {
  const cached = schemaCache.get(fileName);
  if (cached) {
    return cached;
  }

  const schemaSql = readFileSync(join(process.cwd(), "resources/database", fileName), "utf8");
  schemaCache.set(fileName, schemaSql);
  return schemaSql;
}

export function splitSqlStatements(schemaSql: string): string[] {
  return schemaSql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
