import { CopyButton } from "@/components/ui/copy-button";
import { AnsiText, containsAnsiCodes } from "@/lib/ansi-parser";
import { memo, useMemo } from "react";
import type { QueryResponseViewModel } from "../query-view-model";

interface QueryResponseTextViewProps {
  queryResponse: QueryResponseViewModel;
}

export const QueryResponseTextView = memo(function QueryResponseTextView({
  queryResponse,
}: QueryResponseTextViewProps) {
  // Memoize response text computation
  const responseText = useMemo(
    () =>
      typeof queryResponse.data === "string"
        ? queryResponse.data
        : JSON.stringify(queryResponse.data, null, 2) || "",
    [queryResponse.data]
  );

  // Memoize response text
  const rawQueryResponse = useMemo(() => responseText, [responseText]);

  // Check if response contains ANSI color codes
  const hasAnsiCodes = useMemo(() => containsAnsiCodes(rawQueryResponse), [rawQueryResponse]);

  // Default query view rendering
  if (!rawQueryResponse || rawQueryResponse.length === 0) {
    return (
      <div className="my-3 text-muted-foreground">
        Query was executed successfully. No data is returned to show.
      </div>
    );
  }

  // If response contains ANSI codes, render with ANSI parser
  if (hasAnsiCodes) {
    return <AnsiText>{rawQueryResponse}</AnsiText>;
  }

  return (
    <div className="relative group mt-2">
      <CopyButton
        value={rawQueryResponse}
        className="left-0 top-0 right-auto opacity-0 group-hover:opacity-100 transition-opacity"
      />
      <pre className="text-xs">{rawQueryResponse}</pre>
    </div>
  );
});
