import type { AppUIMessage } from "@/lib/ai/common-types";
import { memo } from "react";
import { CollapsiblePart } from "./collapsible-part";

/**
 * Render reasoning part with collapsible display
 */
export const MessageReasoning = memo(function MessageReasoning({
  part,
}: {
  part: AppUIMessage["parts"][0] & { state?: string; text: string };
}) {
  return (
    <CollapsiblePart toolName="Reasoning" state={part.state}>
      <div className="mt-1 max-h-[300px] overflow-auto text-[10px] text-muted-foreground">
        <pre className="bg-muted/30 overflow-x-auto shadow-sm leading-tight whitespace-pre-wrap break-words">
          {part.text}
        </pre>
      </div>
    </CollapsiblePart>
  );
});
