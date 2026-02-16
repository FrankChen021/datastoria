import type { Color } from "@/lib/color-generator";

export interface TimelineNode<TQueryLog = Record<string, unknown>> {
  id: string;
  queryId?: string;
  data: TQueryLog;
  _display: string;
  _description?: string;
  _search: string;
  _matchedIndex: number;
  _matchedLength: number;
  _color: Color;
  children: TimelineNode<TQueryLog>[];
  childCount: number;
  depth: number;
  startTime: number;
  costTime: number;
}

export interface TimelineStats {
  totalNodes: number;
  minTimestamp: number;
  maxTimestamp: number;
}

export interface ExpandableTreeView {
  expandAll: () => void;
  collapseAll: () => void;
  expandToDepth: (level: number) => void;
  canExpand: () => boolean;
}
