import { CodeViewerContent } from "@/components/code-analysis/code-viewer-content";
import { defaultCodeSearchFactory } from "@/lib/code-search/code-search-factory";
import { buildCodeViewerWindow } from "@/lib/code-search/code-viewer-window";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parsePositiveInteger(rawValue: string | string[] | undefined): number | undefined {
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    return undefined;
  }

  const value = Number.parseInt(rawValue, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function ViewerError({ title, description }: { title: string; description: string }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12">
        <div className="w-full rounded-xl border bg-card p-8 shadow-sm">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

export default async function CodeViewerPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const params = searchParams;
  const codeSearchContext = await defaultCodeSearchFactory.getCodeSearchContext();

  if (!codeSearchContext) {
    return (
      <ViewerError
        title="Code analysis is not available"
        description="The server does not currently have a valid source directory configured."
      />
    );
  }

  const targetPath = typeof params.path === "string" ? params.path : "";
  if (!targetPath) {
    return (
      <ViewerError
        title="Missing file path"
        description="This viewer needs a repo-relative path in the query string."
      />
    );
  }

  const highlightedStartLine = parsePositiveInteger(params.startLine);
  const highlightedEndLine = parsePositiveInteger(params.endLine);
  const viewStartLine = parsePositiveInteger(params.viewStartLine);
  const viewEndLine = parsePositiveInteger(params.viewEndLine);
  const viewerWindow = buildCodeViewerWindow({
    viewStartLine,
    viewEndLine,
    targetStartLine: highlightedStartLine,
    targetEndLine: highlightedEndLine,
  });
  const [result, fileListResult] = await Promise.all([
    codeSearchContext.provider.readFile({
      path: targetPath,
      startLine: viewerWindow.startLine,
      endLine: viewerWindow.endLine,
      maxLines: viewerWindow.maxLines,
      maxBytes: viewerWindow.maxBytes,
    }),
    codeSearchContext.provider.listFiles(),
  ]);

  if ("error" in result) {
    return <ViewerError title="Unable to load file" description={result.error} />;
  }

  if ("error" in fileListResult) {
    return <ViewerError title="Unable to load file tree" description={fileListResult.error} />;
  }

  return (
    <CodeViewerContent
      filePaths={fileListResult.paths}
      path={result.path}
      content={result.content}
      startLine={result.startLine}
      endLine={result.endLine}
      totalLines={result.totalLines}
      highlightedStartLine={highlightedStartLine}
      highlightedEndLine={highlightedEndLine}
      autoScrollToHighlight={
        highlightedStartLine != null && viewStartLine == null && viewEndLine == null
      }
      truncated={result.truncated}
      hasPrevious={result.hasPrevious}
      hasNext={result.hasNext}
    />
  );
}
