import type { TimelineNode } from "@/components/shared/timeline/timeline-types";
import { Separator } from "@/components/ui/separator";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { Formatter } from "@/lib/formatter";
import type { SpanLogElement } from "./span-log-inspector-timeline-types";

export function spanLogTimelineTooltip(node: TimelineNode) {
  const log = node.data as SpanLogElement;
  const depth = node.depth;
  const hostName = log.hostname;
  const operationName = typeof log.operation_name === "string" ? log.operation_name : "-";
  const spanId = String(log.span_id);
  const parentSpanId = String(log.parent_span_id);
  const traceId = typeof log.trace_id === "string" ? log.trace_id : "-";
  const spanKind = String(log.kind);
  const startTimeUs = Number(log.start_time_us);
  const startTime =
    Number.isFinite(startTimeUs) && startTimeUs > 0
      ? DateTimeExtension.toYYYYMMddHHmmss(new Date(Math.floor(startTimeUs / 1000)))
      : "-";
  const costTime = Number(log.finish_time_us) - Number(log.start_time_us);

  return (
    <div className="flex flex-col gap-1">
      <Separator />
      <div className="text-sm overflow-x-auto max-w-[440px]">
        <div className="min-w-max space-y-1">
          <div className="flex">
            <span className="font-bold w-32">Trace ID:</span>
            <span className="text-muted-foreground break-all flex-1">{traceId}</span>
          </div>
          <div className="flex">
            <span className="font-bold w-32">Span ID:</span>
            <span className="text-muted-foreground break-all flex-1">{spanId}</span>
          </div>
          <div className="flex">
            <span className="font-bold w-32">Parent Span ID:</span>
            <span className="text-muted-foreground break-all flex-1">{parentSpanId}</span>
          </div>
          <Separator className="my-2" />
          <div className="flex">
            <span className="font-bold w-32">Host name:</span>
            <span className="text-muted-foreground flex-1">{hostName}</span>
          </div>
          <div className="flex">
            <span className="font-bold w-32">Operation:</span>
            <span className="text-muted-foreground flex-1">{operationName}</span>
          </div>
          <div className="flex">
            <span className="font-bold w-32">Span Kind:</span>
            <span className="text-muted-foreground flex-1">{spanKind}</span>
          </div>
          <div className="flex">
            <span className="font-bold w-32">Depth:</span>
            <span className="text-muted-foreground flex-1">{depth}</span>
          </div>
          <div className="flex">
            <span className="font-bold w-32">Start Time:</span>
            <span className="text-muted-foreground flex-1">{startTime}</span>
          </div>
          <div className="flex">
            <span className="font-bold w-32">Duration:</span>
            <span className="text-muted-foreground flex-1">
              {Formatter.getInstance().getFormatter("microsecond")(costTime)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
