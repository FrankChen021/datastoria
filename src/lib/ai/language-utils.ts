/** Returns true for any BCP-47 tag whose primary language subtag is "en". */
export function isEnglishLanguageTag(tag: string): boolean {
  const normalized = tag.trim().toLowerCase();
  return normalized === "en" || normalized.startsWith("en-");
}
