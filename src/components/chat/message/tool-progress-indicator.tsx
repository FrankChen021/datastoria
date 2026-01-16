import { useToolProgressStore } from "@/lib/ai/tools/client/tool-progress-store";
import { Loader2 } from "lucide-react";
import { memo } from "react";

/**
 * Tool Progress Indicator Component
 *
 * Displays real-time progress for tool execution, subscribing to the tool progress store
 * for a specific toolCallId. Only re-renders when that specific tool's progress updates.
 */
export const ToolProgressIndicator = memo(function ToolProgressIndicator({
  toolCallId,
}: {
  toolCallId: string;
}) {
  // Subscribe to progress updates for this specific toolCallId
  // Use a selector that returns the specific progress entry
  const progress = useToolProgressStore((state) => {
    return state.progresses.get(toolCallId);
  });

  if (!progress || progress.stages.length === 0) {
    return null;
  }

  return (
    <div className="tool-progress text-[10px]">
      <div className="text-muted-foreground">stages:</div>
      {progress.stages.map((stage, i) => (
        <div key={i} className="flex items-center gap-2 px-2 text-[10px]">
          {stage.status === "started" && <Loader2 className="h-3 w-3 animate-spin" />}
          {stage.status === "success" && <span className="text-green-600">✓</span>}
          {stage.status === "failed" && <span className="text-red-600">✗</span>}
          {stage.status === "skipped" && <span className="text-muted-foreground">⊘</span>}
          <span className="flex-1">{stage.stage}</span>
          {stage.error && (
            <span className="text-red-600 text-[9px] truncate max-w-[200px]" title={stage.error}>
              {stage.error}
            </span>
          )}
        </div>
      ))}
    </div>
  );
});
