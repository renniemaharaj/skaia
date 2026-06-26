import type { Edge, Node } from "@xyflow/react";

export interface TrimmedFlow {
  name: string;
  nodes: Node[];
  edges: Edge[];
}

export interface LogicalNode {
  id: string;
  type: string;
  label?: string;
  expression?: string;
  next?: LogicalNode[];
}

export interface LogicalFlow {
  name: string;
  flow: {
    start?: LogicalNode;
  };
}
