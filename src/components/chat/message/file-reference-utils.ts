import { BasePath } from "@/lib/base-path";

export interface FileReference {
  path: string;
  startLine?: number;
  endLine?: number;
}

const FILE_REFERENCE_PATTERN = /\[\[file:([^\]]+)\]\]/g;

export function parseFileReferenceToken(token: string): FileReference | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }

  const lineAnchorIndex = trimmed.indexOf("#L");
  if (lineAnchorIndex === -1) {
    return { path: trimmed };
  }

  const path = trimmed.slice(0, lineAnchorIndex).trim();
  const linePart = trimmed.slice(lineAnchorIndex + 2).trim();
  if (!path || !linePart) {
    return null;
  }

  const rangeMatch = /^(\d+)(?:-(\d+))?$/.exec(linePart);
  if (!rangeMatch) {
    return null;
  }

  const startLine = Number.parseInt(rangeMatch[1], 10);
  const endLine = rangeMatch[2] ? Number.parseInt(rangeMatch[2], 10) : undefined;
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
