import type { GraphEdge, GraphNode } from "@/components/graphviz-component/Graph";
import { shortenHostNameForDisplay } from "@/lib/string-utils";
import { MD5 } from "crypto-js";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { QueryLogGraphFlow } from "./query-log-graph-flow";

// Graph controls ref type
export interface GraphControlsRef {
  zoomIn: () => void;
  zoomOut: () => void;
  fitView: () => void;
}

class QueryLogUtils {
  public static getExceptionCode(queryLog: any): number {
    return queryLog.exception_code;
  }

  public static getQueryTypeTag(queryLog: any): string {
    if (queryLog.type === "QueryStart") {
      return "Started";
    }
    if (queryLog.type === "QueryFinish") {
      return "Finished";
    }

    // Exception
    return "Exception";
  }

  public static getClientName(queryLog: any): string {
    if (queryLog.client_name !== "") {
      return queryLog.client_name;
    }
    if (queryLog.client_hostname !== "") {
      return queryLog.client_hostname;
    }
    if (queryLog.http_referer !== "") {
      return queryLog.http_referer;
    }
    if (queryLog.http_user_agent !== "") {
      return queryLog.http_user_agent;
    }
    return "User";
  }
}

export interface NodeDetails {
  id: string;
  label: string;
  incomingEdges: Array<{
    source: string;
    sourceLabel: string;
    queryLog: any;
  }>;
  outgoingEdges: Array<{
    target: string;
    targetLabel: string;
    queryLog: any;
  }>;
}

// Sub-component: Graph Content
interface QueryLogGraphProps {
  queryLogs: any[];
  onQueryLogSelected: (queryLog: any, sourceNode?: string, targetNode?: string) => void;
  onNodeClick?: (nodeDetails: NodeDetails) => void;
}

export const QueryLogGraph = forwardRef<GraphControlsRef, QueryLogGraphProps>(
  (
    {
      queryLogs,
      onQueryLogSelected,
      onNodeClick,
    },
    ref
  ) => {
    const [graphNodes, setGraphNodes] = useState<Map<string, GraphNode>>(new Map());
    const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
    const [queryMap, setQueryMap] = useState<Map<string, any>>();

    // Store controls from QueryLogGraphFlow (without refresh)
    const graphFlowControlsRef = useRef<{ zoomIn: () => void; zoomOut: () => void; fitView: () => void } | null>(null);

    // Handle controls ready from QueryLogGraphFlow
    const handleControlsReady = useCallback(
      (controls: { zoomIn: () => void; zoomOut: () => void; fitView: () => void }) => {
        graphFlowControlsRef.current = controls;
      },
      []
    );

    // Convert query logs to graph structure
    const toGraph = useCallback((logs: any[]) => {
      const nodes = new Map<string, GraphNode>();
      const edges: GraphEdge[] = [];
      const queryMap = new Map<string, any>();

      if (logs.length === 0) {
        setGraphNodes(nodes);
        setGraphEdges(edges);
        setQueryMap(queryMap);
        return;
      }

      // Add host and query map - create a copy to avoid mutating original data
      logs.forEach((log) => {
        const host = log.host || log.host_name;
        const hostId = "n" + MD5(host).toString();

        // Create a copy of log with host_id to avoid mutating original
        const logWithHostId = { ...log, host_id: hostId };

        // Check if we already have a node for this host
        if (!nodes.has(hostId)) {
          nodes.set(hostId, {
            id: hostId,
            label: shortenHostNameForDisplay(host),
            targets: [],
          });
        }

        queryMap.set(log.query_id, logWithHostId);
      });

      // Check the initial node
      const initialQueryLog = queryMap.get(logs[0]?.initial_query_id);
      if (initialQueryLog === undefined) {
        queryMap.set(logs[0]?.initial_query_id, {
          host_id: "Unknown",
          type: "Unknown",
        });

        nodes.set(logs[0]?.initial_query_id, {
          id: "unknown",
          label: "Unknown Initiator",
          targets: [],
        });
      } else {
        // Add a client node to the initiator node
        nodes.set("user", {
          id: "user",
          label: QueryLogUtils.getClientName(initialQueryLog),
          targets: [],
        });

        // Add an edge from the user to the initiator node
        edges.push({
          // Use the query id so that during the action process, we can easily access the query log by the id
          id: initialQueryLog.query_id,
          source: "user",
          target: initialQueryLog.host_id,
          label: `[${initialQueryLog.interface === 2 ? "HTTP" : "TCP"}] [${QueryLogUtils.getQueryTypeTag(initialQueryLog)}]\nRT=${initialQueryLog.query_duration_ms}ms, ResultRows=${initialQueryLog.result_rows}rows`,
          color: QueryLogUtils.getExceptionCode(initialQueryLog) > 0 ? "red" : undefined,
        });
      }

      // Use queryMap because it might have be reduced repeat events for the same query
      queryMap.forEach((log) => {
        if (log.initial_query_id === log.query_id) {
          return;
        }

        const initialQueryLog = queryMap.get(log.initial_query_id);
        const subQueryLog = log;

        edges.push({
          // Use the query id so that during the action process, we can easily access the query log by the id
          id: subQueryLog.query_id,
          source: initialQueryLog.host_id,
          target: subQueryLog.host_id,
          label: `[${QueryLogUtils.getQueryTypeTag(subQueryLog)}] ${subQueryLog.query_duration_ms}ms, ${subQueryLog.result_rows}rows`,
          color: QueryLogUtils.getExceptionCode(initialQueryLog) > 0 ? "red" : undefined,
        });
      });

      // Save for further use
      setQueryMap(queryMap);
      setGraphNodes(nodes);
      setGraphEdges(edges);
    }, []);

    // Convert query logs to graph when queryLogs change
    useEffect(() => {
      toGraph(queryLogs);
    }, [queryLogs, toGraph]);

    // Expose controls via imperative handle
    useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => {
          graphFlowControlsRef.current?.zoomIn();
        },
        zoomOut: () => {
          graphFlowControlsRef.current?.zoomOut();
        },
        fitView: () => {
          graphFlowControlsRef.current?.fitView();
        },
      }),
      []
    );

    // Create edge map for O(1) lookup - memoized for performance
    const edgeMap = useMemo(() => {
      const map = new Map<string, GraphEdge>();
      graphEdges.forEach((edge) => {
        map.set(edge.id, edge);
      });
      return map;
    }, [graphEdges]);

    const handleEdgeClick = useCallback(
      (edgeId: string) => {
        if (queryMap !== undefined) {
          const queryLog = queryMap.get(edgeId);
          if (!queryLog) {
            return;
          }

          // Find the edge that matches this query log - O(1) lookup
          const edge = edgeMap.get(edgeId);
          if (edge) {
            const sourceNode = graphNodes.get(edge.source);
            const targetNode = graphNodes.get(edge.target);
            const sourceLabel = sourceNode?.label || edge.source;
            const targetLabel = targetNode?.label || edge.target;
            onQueryLogSelected(queryLog, sourceLabel, targetLabel);
          } else {
            onQueryLogSelected(queryLog);
          }
        }
      },
      [queryMap, graphNodes, edgeMap, onQueryLogSelected]
    );

    const handleNodeClick = useCallback(
      (nodeId: string) => {
        if (!onNodeClick) return;

        const node = graphNodes.get(nodeId);
        if (!node) return;

        const incomingEdges: NodeDetails["incomingEdges"] = [];
        const outgoingEdges: NodeDetails["outgoingEdges"] = [];

        graphEdges.forEach((edge) => {
          if (edge.target === nodeId) {
            const sourceNode = graphNodes.get(edge.source);
            const queryLog = queryMap?.get(edge.id);
            if (queryLog) {
              incomingEdges.push({
                source: edge.source,
                sourceLabel: sourceNode?.label || edge.source,
                queryLog,
              });
            }
          }

          if (edge.source === nodeId) {
            const targetNode = graphNodes.get(edge.target);
            const queryLog = queryMap?.get(edge.id);
            if (queryLog) {
              outgoingEdges.push({
                target: edge.target,
                targetLabel: targetNode?.label || edge.target,
                queryLog,
              });
            }
          }
        });

        onNodeClick({
          id: nodeId,
          label: node.label,
          incomingEdges,
          outgoingEdges,
        });
      },
      [graphNodes, graphEdges, queryMap, onNodeClick]
    );

    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {(graphNodes.size > 0 || graphEdges.length > 0) && (
          <div className="flex-1 w-full h-full min-h-0 relative">
            <QueryLogGraphFlow
              nodes={graphNodes}
              edges={graphEdges}
              onEdgeClick={handleEdgeClick}
              onNodeClick={handleNodeClick}
              className="w-full h-full"
              onControlsReady={handleControlsReady}
            />
            {graphEdges.length > 0 && (
              <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm rounded-md shadow-sm z-10 text-xs text-muted-foreground">
                💡 Click on any edge to view query details
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);

QueryLogGraph.displayName = "GraphContent";

