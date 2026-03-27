import { CodeViewerContent } from "@/components/code-analysis/code-viewer-content";
import { getCodeAnalysisConfig } from "@/lib/ai/code-analysis/code-analysis-config";
import { readCodeFileForViewer } from "@/lib/ai/code-analysis/code-analysis-service";

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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const config = getCodeAnalysisConfig();

  if (!config.enabled) {
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
  const result = await readCodeFileForViewer(config, { path: targetPath });

  if ("error" in result) {
    return <ViewerError title="Unable to load file" description={result.error} />;
  }

  return (
    <CodeViewerContent
      path={result.path}
      content={result.content}
      startLine={result.startLine}
      endLine={result.endLine}
      highlightedStartLine={highlightedStartLine}
      highlightedEndLine={highlightedEndLine}
      truncated={result.truncated}
    />
  );
}
