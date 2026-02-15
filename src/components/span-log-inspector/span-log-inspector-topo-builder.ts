import { colorGenerator } from "@/lib/color-generator";
import type { SpanLogElement, SpanLogTreeNode } from "./span-log-inspector-timeline-types";
import { parseAttributes } from "./span-log-utils";

interface TraceRowRef {
  spanId: string;
  parentSpanId: string;
  serviceName: string;
  instanceName: string;
  kind: string;
  durationUs: number;
  status: string;
  startTimeUs: number;
  attributes: Record<string, unknown>;
  raw: SpanLogElement;
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
  sampleRows: SpanLogElement[];
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

function normalizeKind(kind: string): string {
  const k = kind.trim().toUpperCase();
  if (k !== "") {
    return k;
  }
  return "";
}

function normalizeTraceRow(row: SpanLogElement): TraceRowRef {
  const serviceName = "ClickHouse";
  const instanceName = toStringValue(row.hostname) || "";

  const startTimeUs = toNumber(row.start_time_us);
  const finishTimeUs = toNumber(row.finish_time_us);
  const durationUs = Math.max(finishTimeUs - startTimeUs, toNumber(row.duration_us));

  return {
    spanId: toStringValue(row.span_id),
    parentSpanId: toStringValue(row.parent_span_id),
    serviceName,
    instanceName,
    kind: normalizeKind(toStringValue(row.kind)),
    durationUs,
    status: toStringValue(row.status_code || row.status),
    startTimeUs,
    attributes: parseAttributes(row.attribute) ?? {},
    raw: row,
  };
}

function getNodeKey(row: TraceRowRef): string {
  return `${row.serviceName}::${row.instanceName}`;
}

function isTerminationKind(kind: string): boolean {
  return kind === "SERVER" || kind === "CONSUMER" || kind === "TIMER";
}

function isClientKind(kind: string): boolean {
  return kind === "CLIENT";
}

function isProducerKind(kind: string): boolean {
  return kind === "PRODUCER";
}

function shortenUserAgent(userAgent: string): string {
  const trimmed = userAgent.trim();
  if (trimmed === "") {
    return "user";
  }
  if (!trimmed.startsWith("Mozilla/")) {
    return trimmed;
  }

  const osMatch = trimmed.match(/\(([^)]+)\)/);
  const os = osMatch ? ` (${osMatch[1]})` : "";
  if (trimmed.includes("Edg/")) {
    return `Edge${os}`;
  }
  if (trimmed.includes("OPR/")) {
    return `Opera${os}`;
  }
  if (trimmed.includes("Firefox/")) {
    return `Firefox${os}`;
  }
  if (trimmed.includes("Safari/") && !trimmed.includes("Chrome/")) {
    return `Safari${os}`;
  }
  if (trimmed.includes("Chrome/")) {
    return `Chrome${os}`;
  }
  return trimmed;
}

function getFirstNonEmptyValue(
  row: Record<string, unknown>,
  attributes: Record<string, unknown>,
  keys: string[]
): string {
  for (const key of keys) {
    const value = toStringValue(attributes[key] ?? row[key]);
    if (value !== "") {
      return value;
    }
  }
  return "";
}

function buildEndpoint(row: Record<string, unknown>, attributes: Record<string, unknown>): string {
  const directEndpoint = getFirstNonEmptyValue(row, attributes, [
    "net.peer",
    "peer.service",
    "peer.address",
    "peer.hostname",
    "net.sock.peer.addr",
    "net.peer.ip",
    "network.peer.address",
    "network.peer.name",
    "server.address",
    "server.socket.address",
    "http.host",
    "rpc.service",
    "db.instance",
  ]);
  if (directEndpoint !== "") {
    const normalizedEndpoint = directEndpoint.trim();
    const explicitPort = getFirstNonEmptyValue(row, attributes, [
      "net.peer.port",
      "net.sock.peer.port",
      "network.peer.port",
      "server.port",
      "server.socket.port",
      "db.port",
    ]);
    if (
      explicitPort !== "" &&
      !normalizedEndpoint.includes(":") &&
      !normalizedEndpoint.startsWith("[")
    ) {
      return `${normalizedEndpoint}:${explicitPort}`;
    }
    return directEndpoint;
  }

  const host = getFirstNonEmptyValue(row, attributes, [
    "net.peer.name",
    "net.peer.ip",
    "network.peer.address",
    "network.peer.name",
    "server.address",
    "server.socket.address",
    "peer.hostname",
    "db.host",
    "target",
  ]);
  const port = getFirstNonEmptyValue(row, attributes, [
    "net.peer.port",
    "net.sock.peer.port",
    "network.peer.port",
    "server.port",
    "server.socket.port",
    "db.port",
  ]);
  if (host !== "" && port !== "") {
    return `${host}:${port}`;
  }
  if (host !== "") {
    return host;
  }

  const endpointFromUrl = getFirstNonEmptyValue(row, attributes, [
    "http.url",
    "url.full",
    "url.original",
    "db.connection_string",
  ]);
  if (endpointFromUrl !== "") {
    try {
      const parsed = new URL(endpointFromUrl);
      if (parsed.hostname !== "" && parsed.port !== "") {
        return `${parsed.hostname}:${parsed.port}`;
      }
      if (parsed.hostname !== "") {
        return parsed.hostname;
      }
    } catch {
      // Keep raw endpoint text.
    }
    return endpointFromUrl;
  }
  return "";
}

function buildRemoteTarget(child: TraceRowRef): TraceRowRef | undefined {
  let remoteApplication = "";
  let remoteInstance = buildEndpoint(child.raw, child.attributes);
  const operationName = toStringValue(
    child.raw.operation_name || child.attributes["operation_name"]
  );

  if (isClientKind(child.kind)) {
    if (operationName === "Connection::sendQuery()") {
      remoteApplication = "ClickHouse";
    } else if (toStringValue(child.attributes["http.client"]) !== "") {
      remoteApplication = "http";
    } else if (toStringValue(child.attributes["messaging.system"]) !== "") {
      remoteApplication = toStringValue(child.attributes["messaging.system"]);
    } else if (toStringValue(child.attributes["db.system"]) !== "") {
      remoteApplication = toStringValue(child.attributes["db.system"]);
      const fromConnection = toStringValue(child.attributes["db.connection_string"]);
      if (remoteInstance === "") {
        remoteInstance = fromConnection;
      }
      if (remoteInstance === "") {
        remoteInstance = "unknown";
      }
    } else if (toStringValue(child.attributes["rpc.system"]) !== "") {
      remoteApplication = toStringValue(child.attributes["rpc.system"]);
    } else {
      remoteApplication = "unknown";
    }
  } else if (isProducerKind(child.kind)) {
    remoteApplication = toStringValue(child.attributes["messaging.system"]);
    if (remoteApplication === "") {
      remoteApplication =
        toStringValue(child.attributes["messaging.kafka.topic"]) !== "" ? "kafka" : "unknown";
    }
  }

  if (remoteApplication === "") {
    return undefined;
  }

  if (remoteInstance === "") {
    remoteInstance = "unknown";
  }

  if (remoteInstance === child.instanceName && remoteApplication === child.serviceName) {
    return undefined;
  }

  return {
    spanId: `remote::${remoteApplication}::${remoteInstance}::${child.spanId}`,
    parentSpanId: child.spanId,
    serviceName: remoteApplication,
    instanceName: remoteInstance,
    kind: "",
    durationUs: 0,
    status: "",
    startTimeUs: child.startTimeUs,
    attributes: {},
    raw: child.raw,
  };
}

function inferEntryServiceName(roots: SpanLogTreeNode[]): string {
  for (const root of roots) {
    const rootRef = normalizeTraceRow(root.data);
    const userAgent = getFirstNonEmptyValue(rootRef.raw, rootRef.attributes, [
      "http.user.agent",
      "http.request.header.user-agent",
      "http.header.User-Agent",
      "user_agent",
      "user-agent",
    ]);
    if (userAgent !== "") {
      return shortenUserAgent(userAgent);
    }
  }

  for (const root of roots) {
    const rootRef = normalizeTraceRow(root.data);
    const rpcSystem = getFirstNonEmptyValue(rootRef.raw, rootRef.attributes, ["rpc.system"]);
    if (rpcSystem !== "") {
      return `${rpcSystem}-client`;
    }
  }

  return "user";
}

export function buildTraceTopo(spanTree: SpanLogTreeNode[]): TraceTopoData {
  if (spanTree.length === 0) {
    return { nodes: [], edges: [] };
  }

  const roots = spanTree.filter((node) => toStringValue(node.data.span_id) !== "");

  const nodeMap = new Map<string, TraceTopoNode>();
  const edgeMap = new Map<string, TraceTopoEdge>();
  const getOrCreateNode = (row: TraceRowRef): TraceTopoNode => {
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

  const getOrCreateEdge = (sourceId: string, targetId: string): TraceTopoEdge => {
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

  const updateEdge = (edge: TraceTopoEdge, row: TraceRowRef): void => {
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

  const addLink = (source: TraceRowRef, target: TraceRowRef, isTargetFake = false): void => {
    const sourceNode = getOrCreateNode(source);
    const targetNode = getOrCreateNode(target);
    const edge = getOrCreateEdge(sourceNode.id, targetNode.id);
    updateEdge(edge, isTargetFake ? source : target);
  };

  const buildLink = (upstreamService: TraceRowRef, childSpans: SpanLogTreeNode[]): boolean => {
    let hasTermination = false;

    for (const childNode of childSpans) {
      const child = normalizeTraceRow(childNode.data);
      if (
        upstreamService.serviceName === child.serviceName &&
        upstreamService.instanceName === child.instanceName &&
        !isTerminationKind(child.kind)
      ) {
        if (buildLink(upstreamService, childNode.children)) {
          hasTermination = true;
        }
      } else {
        hasTermination = true;
        addLink(upstreamService, child);
        buildLink(child, childNode.children);
      }

      if (childNode.children.length === 0 || !hasTermination) {
        const remoteTarget = buildRemoteTarget(child);
        if (remoteTarget) {
          addLink(child, remoteTarget, true);
          hasTermination = true;
        }
      }
    }

    return hasTermination;
  };

  for (const root of roots) {
    const rootRef = normalizeTraceRow(root.data);
    getOrCreateNode(rootRef);
    buildLink(rootRef, root.children);
  }

  if (roots.length > 0) {
    const entryNodeId = "entry::user";
    if (!nodeMap.has(entryNodeId)) {
      const entryServiceName = inferEntryServiceName(roots);
      nodeMap.set(entryNodeId, {
        id: entryNodeId,
        serviceName: entryServiceName,
        instanceName: "user",
        label: entryServiceName,
        description: "",
        color: colorGenerator.getColor(entryServiceName).foreground,
      });
    }

    for (const root of roots) {
      const rootRef = normalizeTraceRow(root.data);
      const rootNode = getOrCreateNode(rootRef);
      const edge = getOrCreateEdge(entryNodeId, rootNode.id);
      updateEdge(edge, rootRef);
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
