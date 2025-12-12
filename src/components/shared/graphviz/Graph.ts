export interface GraphNode {
  id: string;

  label: string;

  /**
   * See: https://graphviz.org/doc/info/shapes.html
   */
  shape?: string;

  color?: string;

  // ids of target nodes
  targets: string[];
}

export interface GraphEdge {
  id: string;

  source: string;
  target: string;

  label?: string;

  color?: string;
}

