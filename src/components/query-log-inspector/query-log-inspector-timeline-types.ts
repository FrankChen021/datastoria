import { colorGenerator, type Color } from "@/lib/color-generator";
import { hostNameManager } from "@/lib/host-name-manager";

// Query log tree node structure for timeline
export interface QueryLogTreeNode {
  // Unique identifier for this node
  id: string;

  // Original query log data
  queryLog: any;

  // Display properties
  _display: string;
  _search: string;
  _matchedIndex: number;
  _matchedLength: number;
  _color: Color;

  // Tree structure
  children: QueryLogTreeNode[];
  childCount: number;
  depth: number;

  // Timeline positioning
  startTime: number; // in microseconds
  costTime: number; // duration in microseconds

  // Query log specific fields
  host: string;
  queryType: string;
  queryId: string;
  eventTime: number;
}

export interface TimelineStats {
  totalNodes: number;
  minTimestamp: number;
  maxTimestamp: number;
}

/**
 * Transform query logs into a tree structure based on query_id relationships
 * - If initial_query_id == query_id, this is a root node
 * - Otherwise, use initial_query_id to find the parent node
 * - Merges QueryStart and QueryFinish/Exception records for the same query_id
 */
export function transformQueryLogsToTree(queryLogs: any[]): {
  tree: QueryLogTreeNode[];
  flatList: QueryLogTreeNode[];
  stats: TimelineStats;
} {
  if (!queryLogs || queryLogs.length === 0) {
    return {
      tree: [],
      flatList: [],
      stats: { totalNodes: 0, minTimestamp: 0, maxTimestamp: 0 },
    };
  }

  // Step 2: Create nodes from merged logs
  const nodeMap = new Map<string, QueryLogTreeNode>();
  const flatList: QueryLogTreeNode[] = [];
  let minTimestamp = Number.MAX_SAFE_INTEGER;
  let maxTimestamp = Number.MIN_SAFE_INTEGER;
  let nodeIndex = 0;

  queryLogs.forEach((log) => {
    const startTime = log.start_time_microseconds || 0;
    const duration = (log.query_duration_ms || 0) * 1000; // Convert ms to microseconds

    // Update min/max timestamps
    if (startTime < minTimestamp) minTimestamp = startTime;
    if (startTime + duration > maxTimestamp) maxTimestamp = startTime + duration;

    const host = log.host || "Unknown";
    const queryType = log.type || "Unknown";
    const queryId = log.query_id || "";
    const displayName = hostNameManager.getShortHostname(host);
    const color = colorGenerator.getColor(host);

    const node: QueryLogTreeNode = {
      id: `node-${nodeIndex++}`,
      queryLog: log,
      _display: displayName,
      _search: displayName.toLowerCase(),
      _matchedIndex: -1,
      _matchedLength: 0,
      _color: color,
      children: [],
      childCount: 0,
      depth: 0, // Will be calculated when building tree
      startTime: startTime,
      costTime: duration,
      host: host,
      queryType: queryType,
      queryId: queryId,
      eventTime: startTime, // Use start time for sorting
    };

    nodeMap.set(queryId, node);
    flatList.push(node);
  });

  // Step 3: Build parent-child relationships
  const rootNodes: QueryLogTreeNode[] = [];

  flatList.forEach((node) => {
    const log = node.queryLog;
    const queryId = log.query_id || "";
    const initialQueryId = log.initial_query_id || "";

    // Root node: initial_query_id == query_id
    if (initialQueryId === queryId || !initialQueryId) {
      rootNodes.push(node);
      node.depth = 0;
    } else {
      // Find parent by initial_query_id
      const parent = nodeMap.get(initialQueryId);
      if (parent) {
        parent.children.push(node);
        parent.childCount = parent.children.length;
        node.depth = parent.depth + 1;
      } else {
        // If parent not found, treat as root
        rootNodes.push(node);
        node.depth = 0;
      }
    }
  });

  // Step 4: Sort children by event time for each parent
  const sortChildren = (node: QueryLogTreeNode) => {
    if (node.children.length > 0) {
      node.children.sort((a, b) => a.eventTime - b.eventTime);
      node.children.forEach((child) => sortChildren(child));
    }
  };

  rootNodes.forEach((root) => sortChildren(root));

  // Sort root nodes by event time
  rootNodes.sort((a, b) => a.eventTime - b.eventTime);

  return {
    tree: rootNodes,
    flatList,
    stats: {
      totalNodes: flatList.length,
      minTimestamp: minTimestamp === Number.MAX_SAFE_INTEGER ? 0 : minTimestamp,
      maxTimestamp: maxTimestamp === Number.MIN_SAFE_INTEGER ? 0 : maxTimestamp,
    },
  };
}
