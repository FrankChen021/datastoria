import type { TimelineNode, TimelineStats } from "@/components/shared/timeline/timeline-types";
import { colorGenerator } from "@/lib/color-generator";

export interface SpanLogElement extends Record<string, unknown> {
  attribute?: Record<string, string>;
  hostname: string;
  operation_name?: string;
  span_id?: string | number;
  parent_span_id?: string | number;
  trace_id?: string;
  kind?: string | number;
  start_time_us?: string | number;
  finish_time_us?: string | number;
}

export interface SpanLogTreeNode extends TimelineNode<SpanLogElement> {
  children: SpanLogTreeNode[];
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function toStringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function compactServerName(value: string): string {
  const first = value.split(".")[0];
  return first || value;
}

function getInstanceName(span: SpanLogElement): string {
  return toStringValue(span.hostname) || "-";
}

export function transformSpanRowsToTimelineTree(spanLogs: SpanLogElement[]): {
  tree: SpanLogTreeNode[];
  flatList: SpanLogTreeNode[];
  stats: TimelineStats;
} {
  if (spanLogs.length === 0) {
    return {
      tree: [],
      flatList: [],
      stats: { totalNodes: 0, minTimestamp: 0, maxTimestamp: 0 },
    };
  }

  /**
   * key: span id
   * val: span
   */
  const spanMap = new Map<string, SpanLogTreeNode>();
  const spanList: Array<{
    node: SpanLogTreeNode;
    spanId: string;
    parentSpanId: string;
    eventTime: number;
    instanceName: string;
  }> = [];
  const eventTimeMap = new Map<string, number>();
  const flatList: SpanLogTreeNode[] = [];
  let minTimestamp = Number.MAX_SAFE_INTEGER;
  let maxTimestamp = Number.MIN_SAFE_INTEGER;
  let nodeIndex = 0;

  for (const span of spanLogs) {
    const spanId = toStringValue(span.span_id);
    const parentSpanId = toStringValue(span.parent_span_id);
    const instanceName = getInstanceName(span);
    const operationName = toStringValue(span.operation_name) || spanId;

    const startTime = toNumber(span.start_time_us);
    const durationUs = toNumber(span.finish_time_us) - toNumber(span.start_time_us);

    if (startTime < minTimestamp) minTimestamp = startTime;
    if (startTime + durationUs > maxTimestamp) maxTimestamp = startTime + durationUs;

    const spanTreeNode: SpanLogTreeNode = {
      id: `trace-node-${nodeIndex++}`,
      queryId: spanId,
      startTime,
      costTime: durationUs,
      data: span,
      _display: `${operationName}`,
      _description: "",
      _search: `${instanceName} ${operationName}`.toLowerCase(),
      _matchedIndex: -1,
      _matchedLength: 0,
      _color: colorGenerator.getColor(instanceName),
      children: [],
      childCount: 0,
      depth: 0,
    };

    spanMap.set(spanId, spanTreeNode);
    eventTimeMap.set(spanTreeNode.id, startTime);
    spanList.push({
      node: spanTreeNode,
      spanId,
      parentSpanId,
      eventTime: startTime,
      instanceName,
    });
    flatList.push(spanTreeNode);
  }

  const roots: SpanLogTreeNode[] = [];
  for (const span of spanList) {
    if (span.parentSpanId === "" || span.parentSpanId === span.spanId) {
      roots.push(span.node);
      continue;
    }
    const parent = spanMap.get(span.parentSpanId);
    if (!parent) {
      roots.push(span.node);
      continue;
    }
    parent.children.push(span.node);
    parent.childCount = parent.children.length;
  }

  const assignDepth = (node: SpanLogTreeNode, depth: number) => {
    node.depth = depth;
    for (const child of node.children) {
      assignDepth(child, depth + 1);
    }
  };

  for (const root of roots) {
    assignDepth(root, 0);
  }

  const sortChildren = (node: SpanLogTreeNode) => {
    if (node.children.length === 0) {
      return;
    }
    node.children.sort((a, b) => (eventTimeMap.get(a.id) || 0) - (eventTimeMap.get(b.id) || 0));
    for (const child of node.children) {
      sortChildren(child);
    }
  };

  roots.sort((a, b) => (eventTimeMap.get(a.id) || 0) - (eventTimeMap.get(b.id) || 0));
  for (const root of roots) {
    sortChildren(root);
  }

  return {
    tree: roots,
    flatList,
    stats: {
      totalNodes: flatList.length,
      minTimestamp: minTimestamp === Number.MAX_SAFE_INTEGER ? 0 : minTimestamp,
      maxTimestamp: maxTimestamp === Number.MIN_SAFE_INTEGER ? 0 : maxTimestamp,
    },
  };
}
