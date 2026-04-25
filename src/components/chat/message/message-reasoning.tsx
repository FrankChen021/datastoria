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

  const isStreaming = part.state !== undefined && part.state !== "done";
  if (isStreaming) {
    return (
      <div className="whitespace-pre-wrap break-words text-[10px] leading-[1.45]">{part.text}</div>
    );
  }

  return (
    <div className="text-[10px] [&_.prose]:text-[10px] [&_.prose_*]:text-[10px]">
      <MessageMarkdown
        text={part.text}
        customStyle={REASONING_MARKDOWN_STYLE}
        showExecuteButton={false}
        showSqlActions={false}
        resolveMetadataLinks={false}
        renderLinks={false}
      />
    </div>
  );
});
