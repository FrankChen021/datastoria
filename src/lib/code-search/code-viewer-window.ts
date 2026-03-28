const VIEWER_MAX_READ_LINES = 2000;
const VIEWER_MAX_FILE_BYTES = 256 * 1024;

export interface BuildCodeViewerWindowInput {
  viewStartLine?: number;
  viewEndLine?: number;
  targetStartLine?: number;
  targetEndLine?: number;
}

export interface CodeViewerWindow {
  startLine: number;
  endLine: number;
  maxLines: number;
  maxBytes: number;
}

export function buildCodeViewerWindow(input: BuildCodeViewerWindowInput): CodeViewerWindow {
  const { viewStartLine, viewEndLine, targetStartLine, targetEndLine } = input;

  if (viewStartLine != null || viewEndLine != null) {
    const startLine = Math.max(1, viewStartLine ?? 1);
    const endLine = Math.max(startLine, viewEndLine ?? startLine + VIEWER_MAX_READ_LINES - 1);
    return {
      startLine,
      endLine,
      maxLines: VIEWER_MAX_READ_LINES,
      maxBytes: VIEWER_MAX_FILE_BYTES,
    };
  }

  if (targetStartLine != null) {
    const safeTargetStart = Math.max(1, targetStartLine);
    const safeTargetEnd = Math.max(targetEndLine ?? targetStartLine, safeTargetStart);
    const targetSpan = Math.max(1, safeTargetEnd - safeTargetStart + 1);
    const remaining = Math.max(0, VIEWER_MAX_READ_LINES - targetSpan);
    const startLine = Math.max(1, safeTargetStart - Math.floor(remaining / 2));
    const endLine = Math.max(startLine, safeTargetEnd + Math.ceil(remaining / 2));

    return {
      startLine,
      endLine,
      maxLines: VIEWER_MAX_READ_LINES,
      maxBytes: VIEWER_MAX_FILE_BYTES,
    };
  }

  return {
    startLine: 1,
    endLine: VIEWER_MAX_READ_LINES,
    maxLines: VIEWER_MAX_READ_LINES,
    maxBytes: VIEWER_MAX_FILE_BYTES,
  };
}
