import { BasePath } from "@/lib/base-path";

export class FileLink {
  private static readonly FILE_REFERENCE_WITH_LINES_PATTERN =
    /^(.*?)\s*#L\s*(\d+)(?:\s*-\s*L?\s*(\d+))?$/i;

  readonly path: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly href: string;
  readonly label: string;

  constructor({
    path,
    startLine,
    endLine,
  }: {
    path: string;
    startLine?: number;
    endLine?: number;
  }) {
    this.path = path;
    this.startLine = startLine;
    this.endLine = endLine;
    this.href = this.buildHref();
    this.label = this.buildLabel();
  }

  static parse(token: string): FileLink | null {
    const trimmed = token.trim();
    if (!trimmed) {
      return null;
    }

    const lineMatch = FileLink.FILE_REFERENCE_WITH_LINES_PATTERN.exec(trimmed);
    if (!lineMatch) {
      return new FileLink({ path: trimmed });
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

    return new FileLink({
      path,
      startLine,
      endLine,
    });
  }

  static toViewerUrl(href: string): string {
    const parsed = new URL(href);
    return new FileLink({
      path: parsed.searchParams.get("path") ?? "",
      startLine: FileLink.parseLineNumber(parsed.searchParams.get("startLine")),
      endLine: FileLink.parseLineNumber(parsed.searchParams.get("endLine")),
    }).toViewerUrl();
  }

  toViewerUrl(): string {
    const searchParams = new URLSearchParams({ path: this.path });
    if (this.startLine != null) {
      searchParams.set("startLine", String(this.startLine));
    }
    if (this.endLine != null) {
      searchParams.set("endLine", String(this.endLine));
    }
    return BasePath.getURL(`/code-viewer?${searchParams.toString()}`);
  }

  toLinkNode() {
    return {
      type: "link" as const,
      url: this.href,
      title: null,
      children: [
        {
          type: "text" as const,
          value: this.label,
        },
      ],
    };
  }

  private buildLabel(): string {
    const fileName = this.path.split("/").filter(Boolean).at(-1) ?? this.path;
    if (this.startLine == null) {
      return fileName;
    }
    if (this.endLine != null && this.endLine !== this.startLine) {
      return `${fileName}:${this.startLine}-${this.endLine}`;
    }
    return `${fileName}:${this.startLine}`;
  }

  private buildHref(): string {
    const searchParams = new URLSearchParams({ path: this.path });
    if (this.startLine != null) {
      searchParams.set("startLine", String(this.startLine));
    }
    if (this.endLine != null) {
      searchParams.set("endLine", String(this.endLine));
    }
    return `codefile://open?${searchParams.toString()}`;
  }

  private static parseLineNumber(value: string | null): number | undefined {
    return value ? Number.parseInt(value, 10) : undefined;
  }
}
