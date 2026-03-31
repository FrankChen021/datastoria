import path from "node:path";

export function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

export function shouldIgnoreRelativePath(relativePath: string, ignoredNames: string[]): boolean {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.split("/").filter(Boolean);
  return segments.some((segment) => ignoredNames.includes(segment));
}

export function matchesSearchableSuffix(
  relativePath: string,
  searchableSuffixes: string[]
): boolean {
  if (searchableSuffixes.length === 0) {
    return true;
  }

  const normalized = normalizeRelativePath(relativePath).toLowerCase();
  return searchableSuffixes.some((suffix) => normalized.endsWith(suffix));
}
