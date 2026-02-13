import { colorGenerator } from "@/lib/color-generator";

interface TraceRowRef {
  spanId: string;
  parentSpanId: string;
  serviceName: string;
  instanceName: string;
  kind: string;
  durationUs: number;
  status: string;
  raw: Record<string, unknown>;
}

export interface TraceTopoNode {
  id: string;
  serviceName: string;
  instanceName: string;
  label: string;
  description: string;
  color: string;
}

export interface TraceTopoEdge {
  id: string;
  source: string;
  target: string;
  count: number;
  errorCount: number;
  minDurationUs: number;
  maxDurationUs: number;
  totalDurationUs: number;
  sampleRows: Record<string, unknown>[];
}

export interface TraceTopoData {
  nodes: TraceTopoNode[];
  edges: TraceTopoEdge[];
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

function isErrorStatus(status: string): boolean {
  if (status === "" || status === "0" || status.toUpperCase() === "OK") {
    return false;
  }
  const statusCode = Number(status);
  if (Number.isFinite(statusCode)) {
    return statusCode >= 400;
  }
  const normalized = status.toLowerCase();
  return normalized.includes("error") || normalized.includes("fail");
}

function normalizeTraceRow(row: Record<string, unknown>): TraceRowRef {
  const serviceName = toStringValue(row.service_name) || "unknown-service";
  const instanceName =
    toStringValue(row.service_instance_id) ||
    toStringValue(row.host_name) ||
    toStringValue(row.host) ||
    toStringValue(row.fqdn) ||
    "-";

  const startTimeUs = toNumber(row.start_time_us);
  const finishTimeUs = toNumber(row.finish_time_us);
  const durationUs = Math.max(finishTimeUs - startTimeUs, toNumber(row.duration_us));

  return {
    spanId: toStringValue(row.span_id),
    parentSpanId: toStringValue(row.parent_span_id),
    serviceName,
    instanceName,
    kind: toStringValue(row.kind).toUpperCase(),
    durationUs,
    status: toStringValue(row.status_code),
    raw: row,
  };
}

function getNodeKey(row: TraceRowRef): string {
  return `${row.serviceName}::${row.instanceName}`;
}

export function buildTraceTopo(traceLogs: Record<string, unknown>[]): TraceTopoData {
  if (traceLogs.length === 0) {
    return { nodes: [], edges: [] };
  }

  const rows = traceLogs.map(normalizeTraceRow).filter((row) => row.spanId !== "");
  const spanMap = new Map<string, TraceRowRef>();
  for (const row of rows) {
    spanMap.set(row.spanId, row);
  }

  const nodeMap = new Map<string, TraceTopoNode>();
  const edgeMap = new Map<string, TraceTopoEdge>();
  const getOrCreateNode = (row: TraceRowRef) => {
    const nodeId = getNodeKey(row);
    const existing = nodeMap.get(nodeId);
    if (existing) {
      return existing;
    }
    const node: TraceTopoNode = {
      id: nodeId,
      serviceName: row.serviceName,
      instanceName: row.instanceName,
      label: row.serviceName,
      description: row.instanceName,
      color: colorGenerator.getColor(row.serviceName).foreground,
    };
    nodeMap.set(nodeId, node);
    return node;
  };

  const getOrCreateEdge = (sourceId: string, targetId: string) => {
    const edgeId = `${sourceId}->${targetId}`;
    const existing = edgeMap.get(edgeId);
    if (existing) {
      return existing;
    }
    const edge: TraceTopoEdge = {
      id: edgeId,
      source: sourceId,
      target: targetId,
      count: 0,
      errorCount: 0,
      minDurationUs: Number.MAX_SAFE_INTEGER,
      maxDurationUs: 0,
      totalDurationUs: 0,
      sampleRows: [],
    };
    edgeMap.set(edgeId, edge);
    return edge;
  };

  const updateEdge = (edge: TraceTopoEdge, row: TraceRowRef) => {
    edge.count += 1;
    edge.totalDurationUs += row.durationUs;
    edge.minDurationUs = Math.min(edge.minDurationUs, row.durationUs);
    edge.maxDurationUs = Math.max(edge.maxDurationUs, row.durationUs);
    if (isErrorStatus(row.status)) {
      edge.errorCount += 1;
    }
    if (edge.sampleRows.length < 200) {
      edge.sampleRows.push(row.raw);
    }
  };

  // Build service dependency edges based on span parent-child relationships.
  for (const row of rows) {
    getOrCreateNode(row);
    if (row.parentSpanId === "" || row.parentSpanId === row.spanId) {
      continue;
    }
    const parent = spanMap.get(row.parentSpanId);
    if (!parent) {
      continue;
    }
    getOrCreateNode(parent);
    const sourceNodeId = getNodeKey(parent);
    const targetNodeId = getNodeKey(row);

    // Follow Bithon's approach: collapse in-process calls within same service/instance.
    if (sourceNodeId === targetNodeId && row.kind !== "SERVER" && row.kind !== "CONSUMER") {
      continue;
    }

    const edge = getOrCreateEdge(sourceNodeId, targetNodeId);
    updateEdge(edge, row);
  }

  const roots = rows.filter((row) => {
    if (row.parentSpanId === "" || row.parentSpanId === row.spanId) {
      return true;
    }
    return !spanMap.has(row.parentSpanId);
  });
  if (roots.length > 0) {
    const entryNodeId = "entry::user";
    if (!nodeMap.has(entryNodeId)) {
      nodeMap.set(entryNodeId, {
        id: entryNodeId,
        serviceName: "entry",
        instanceName: "user",
        label: "Entry",
        description: "user",
        color: colorGenerator.getColor("entry").foreground,
      });
    }

    for (const root of roots) {
      const rootNode = getOrCreateNode(root);
      const edge = getOrCreateEdge(entryNodeId, rootNode.id);
      updateEdge(edge, root);
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()).map((edge) => ({
      ...edge,
      minDurationUs: edge.minDurationUs === Number.MAX_SAFE_INTEGER ? 0 : edge.minDurationUs,
    })),
  };
}
