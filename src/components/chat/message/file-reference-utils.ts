import { BasePath } from "@/lib/base-path";

export interface FileReference {
  path: string;
  startLine?: number;
  endLine?: number;
}

const FILE_REFERENCE_PATTERN = /\[\[\s*file\s*:\s*([^\]]+?)\s*\]\]/gi;
const SKILL_REFERENCE_PATTERN =
  /\[\[\s*skill\s*:\s*([^\]|]+?)\s*\|\s*([^\]|]+?)(?:\s*\|\s*([^\]]+?))?\s*\]\]/gi;
const CODE_WRAPPED_FILE_REFERENCE_PATTERN = /`(\s*\[\[\s*file\s*:\s*[^\]]+?\s*\]\]\s*)`/gi;
const CODE_WRAPPED_SKILL_REFERENCE_PATTERN =
  /`(\s*\[\[\s*skill\s*:\s*[^\]|]+?\s*\|\s*[^\]|]+?(?:\s*\|\s*[^\]]+?)?\s*\]\]\s*)`/gi;
const FILE_REFERENCE_WITH_LINES_PATTERN = /^(.*?)\s*#L\s*(\d+)(?:\s*-\s*L?\s*(\d+))?$/i;

export function parseFileReferenceToken(token: string): FileReference | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }

  const lineMatch = FILE_REFERENCE_WITH_LINES_PATTERN.exec(trimmed);
  if (!lineMatch) {
    return { path: trimmed };
  }

  const path = lineMatch[1]?.trim();
  if (!path) {
    return null;
  }

  const startLine = Number.parseInt(lineMatch[2], 10);
  const endLine = lineMatch[3] ? Number.parseInt(lineMatch[3], 10) : undefined;
  if (!Number.isFinite(startLine) || startLine <= 0) {
    return null;
  }
  if (endLine != null && (!Number.isFinite(endLine) || endLine < startLine)) {
    return null;
  }

  return {
    path,
    startLine,
    endLine,
  };
}

export function getFileReferenceLabel(reference: FileReference): string {
  const fileName = reference.path.split("/").filter(Boolean).at(-1) ?? reference.path;
  if (reference.startLine == null) {
    return fileName;
  }
  if (reference.endLine != null && reference.endLine !== reference.startLine) {
    return `${fileName}:${reference.startLine}-${reference.endLine}`;
  }
  return `${fileName}:${reference.startLine}`;
}

export function buildCodeFileHref(reference: FileReference): string {
  const searchParams = new URLSearchParams({ path: reference.path });
  if (reference.startLine != null) {
    searchParams.set("startLine", String(reference.startLine));
  }
  if (reference.endLine != null) {
    searchParams.set("endLine", String(reference.endLine));
  }
  return `codefile://open?${searchParams.toString()}`;
}

export function buildCodeViewerUrl(reference: FileReference): string {
  const searchParams = new URLSearchParams({ path: reference.path });
  if (reference.startLine != null) {
    searchParams.set("startLine", String(reference.startLine));
  }
  if (reference.endLine != null) {
    searchParams.set("endLine", String(reference.endLine));
  }
  return BasePath.getURL(`/code-viewer?${searchParams.toString()}`);
}

export function replaceFileReferenceTokens(markdown: string): string {
  return markdown.replace(FILE_REFERENCE_PATTERN, (fullMatch, tokenBody: string) => {
    const reference = parseFileReferenceToken(tokenBody);
    if (!reference) {
      return fullMatch;
    }

    const label = getFileReferenceLabel(reference);
    return `[${label}](${buildCodeFileHref(reference)})`;
  });
}

function escapeMarkdownLinkText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function escapeMarkdownLinkTitle(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function replaceSkillReferenceTokens(markdown: string): string {
  return markdown.replace(
    SKILL_REFERENCE_PATTERN,
    (fullMatch, skillId: string, label: string, title?: string) => {
      const normalizedSkillId = skillId.trim();
      const normalizedLabel = label.trim();
      const normalizedTitle = title?.trim();

      if (!normalizedSkillId || !normalizedLabel) {
        return fullMatch;
      }

      const escapedLabel = escapeMarkdownLinkText(normalizedLabel);
      const escapedTitle = normalizedTitle ? ` "${escapeMarkdownLinkTitle(normalizedTitle)}"` : "";
      return `[${escapedLabel}](skill://${normalizedSkillId}${escapedTitle})`;
    }
  );
}

function unwrapCodeWrappedReferenceTokens(markdown: string): string {
  return markdown
    .replace(CODE_WRAPPED_FILE_REFERENCE_PATTERN, (_, token: string) => token.trim())
    .replace(CODE_WRAPPED_SKILL_REFERENCE_PATTERN, (_, token: string) => token.trim());
}

/**
 * Rewrites custom reference tokens into standard markdown links before rendering.
 *
 * Examples:
 * - input: "See [[file:src/app/page.tsx#L12-18]]."
 *   output: "See [page.tsx:12-18](codefile://open?path=src%2Fapp%2Fpage.tsx&startLine=12&endLine=18)."
 *
 * - input: "Use [[skill:source-code-inspection|/source-code-inspection]]."
 *   output: "Use [/source-code-inspection](skill://source-code-inspection)."
 *
 * - input: "Definition: `[[file:src/app/page.tsx#L12]]`."
 *   output: "Definition: [page.tsx:12](codefile://open?path=src%2Fapp%2Fpage.tsx&startLine=12)."
 */
export function replaceReferenceTokens(markdown: string): string {
  return replaceSkillReferenceTokens(
    replaceFileReferenceTokens(unwrapCodeWrappedReferenceTokens(markdown))
  );
}
