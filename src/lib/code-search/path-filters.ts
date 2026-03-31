import path from "node:path";

export const ALWAYS_EXCLUDED_NAMES = [".git", "node_modules"];

export function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/").replace(/^\.\//, "");
}

function getPathSegments(relativePath: string): string[] {
  const normalized = normalizeRelativePath(relativePath);
  return normalized.split("/").filter(Boolean);
}

export function matchesExcludedName(relativePath: string, excludedNames: string[]): boolean {
  const segments = getPathSegments(relativePath);
  return segments.some((segment) => excludedNames.includes(segment));
}

export function matchesIncludedName(relativePath: string, includeNames: string[]): boolean {
  if (includeNames.length === 0) {
    return true;
  }

  const lowerIncludeNames = includeNames.map((name) => name.toLowerCase());
  const lowerSegments = getPathSegments(relativePath).map((segment) => segment.toLowerCase());
  return lowerSegments.some((segment) => lowerIncludeNames.includes(segment));
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
