import type { AppUIMessage } from "@/lib/ai/ai-types";
import { memo } from "react";
import { MessageMarkdown } from "./message-markdown";

const REASONING_MARKDOWN_STYLE = { fontSize: "10px", lineHeight: "1.45" } as const;

/**
 * Render reasoning as assistant text instead of a tool part.
 */
export const MessageReasoning = memo(function MessageReasoning({
  part,
}: {
  part: AppUIMessage["parts"][0] & { state?: string; text: string };
}) {
  if (!part.text.trim()) {
    return null;
  }

  return (
    <div className="text-[12px] [&_.prose]:text-[12px] [&_.prose_*]:text-[12px]">
      <MessageMarkdown
        text={part.text}
        customStyle={REASONING_MARKDOWN_STYLE}
        showExecuteButton={false}
        showSqlActions={false}
        resolveMetadataLinks={false}
      />
    </div>
  );
});
