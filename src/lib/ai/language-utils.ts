/** Returns true for any BCP-47 tag whose primary language subtag is "en". */
export function isEnglishLanguageTag(tag: string): boolean {
  const normalized = tag.trim().toLowerCase();
  return normalized === "en" || normalized.startsWith("en-");
}

const BCP47_LANGUAGE_TAG_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const MAX_LANGUAGE_TAG_LENGTH = 32;

export function sanitizeLanguageTag(tag: string | undefined): string | undefined {
  if (typeof tag !== "string") {
    return undefined;
  }

  const normalized = tag.trim();
  if (normalized.length === 0 || normalized.length > MAX_LANGUAGE_TAG_LENGTH) {
    return undefined;
  }

  if (!BCP47_LANGUAGE_TAG_PATTERN.test(normalized)) {
    return undefined;
  }

  return normalized;
}
