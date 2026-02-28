export function normalizeMemoryContent(content: string): string {
  return content.toLowerCase().trim().replace(/\s+/g, " ");
}

export function normalizeMemorySearchText(text: string): string[] {
  return normalizeMemoryContent(text)
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}
