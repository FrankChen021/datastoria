import type { TimelineNode, TimelineStats } from "@/components/shared/timeline/timeline-types";
import { colorGenerator } from "@/lib/color-generator";

export interface SpanLogTreeNode extends TimelineNode {
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

export function transformSpanRowsToTimelineTree(traceLogs: Record<string, unknown>[]): {
  tree: SpanLogTreeNode[];
  flatList: SpanLogTreeNode[];
  stats: TimelineStats;
} {
  if (traceLogs.length === 0) {
    return {
      tree: [],
      flatList: [],
      stats: { totalNodes: 0, minTimestamp: 0, maxTimestamp: 0 },
    };
  }

  const nodeMap = new Map<string, SpanLogTreeNode>();
  const recordList: Array<{
    node: SpanLogTreeNode;
    spanId: string;
    parentSpanId: string;
    eventTime: number;
  }> = [];
  const eventTimeMap = new Map<string, number>();
  const flatList: SpanLogTreeNode[] = [];
  let minTimestamp = Number.MAX_SAFE_INTEGER;
  let maxTimestamp = Number.MIN_SAFE_INTEGER;
  let nodeIndex = 0;

  for (const log of traceLogs) {
    const spanId = toStringValue(log.span_id);
    const parentSpanId = toStringValue(log.parent_span_id);
    const serviceName = toStringValue(log.service_name) || "unknown-service";
    const operationName =
      toStringValue(log.operation_name) || toStringValue(log.span_name) || spanId;

    const startTime = toNumber(log.start_time_us);
    const durationUs = toNumber(log.finish_time_us) - toNumber(log.start_time_us);

    if (startTime < minTimestamp) minTimestamp = startTime;
    if (startTime + durationUs > maxTimestamp) maxTimestamp = startTime + durationUs;

    const node: SpanLogTreeNode = {
      id: `trace-node-${nodeIndex++}`,
      queryId: spanId,
      startTime,
      costTime: durationUs,
      queryLog: log,
      _display: `${operationName}`,
      _description: serviceName,
      _search: `${serviceName} ${operationName}`.toLowerCase(),
      _matchedIndex: -1,
      _matchedLength: 0,
      _color: colorGenerator.getColor(serviceName),
      children: [],
      childCount: 0,
      depth: 0,
    };

    nodeMap.set(spanId, node);
    eventTimeMap.set(node.id, startTime);
    recordList.push({
      node,
      spanId,
      parentSpanId,
      eventTime: startTime,
    });
    flatList.push(node);
  }

  const roots: SpanLogTreeNode[] = [];
  for (const record of recordList) {
    if (record.parentSpanId === "" || record.parentSpanId === record.spanId) {
      roots.push(record.node);
      continue;
    }
    const parent = nodeMap.get(record.parentSpanId);
    if (!parent) {
      roots.push(record.node);
      continue;
    }
    record.node.depth = parent.depth + 1;
    parent.children.push(record.node);
    parent.childCount = parent.children.length;
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
