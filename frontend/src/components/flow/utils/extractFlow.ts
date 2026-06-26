import type { Edge, Node } from "@xyflow/react";
import { memoize } from "lodash";
import type { FlowState } from "../../../atoms/flow";
import type { LogicalFlow, LogicalNode, TrimmedFlow } from "./types";

export const getFullState = (flowState: FlowState) => {
  return flowState;
};

export const getTrimmedState = (flowState: FlowState): TrimmedFlow => {
  return {
    name: flowState.name,
    nodes: flowState.nodes.map(node => ({
      id: node.id,
      data: node.data,
      type: node.type,
      position: node.position,
    })) as Node[],
    edges: flowState.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    })) as Edge[],
  };
};

const getLogicalFlow = (trimmedFlow: TrimmedFlow): LogicalFlow => {
  const { name, nodes, edges } = trimmedFlow;

  const getChildren = (nodeId: string): LogicalNode[] => {
    return edges
      .filter(edge => edge.source === nodeId)
      .map(edge => {
        const targetNode = nodes.find(node => node.id === edge.target);
        if (!targetNode) return null;

        return {
          id: targetNode.id,
          type: targetNode.type || "unknown",
          label: targetNode.data?.label as string | undefined,
          expression: targetNode.data?.expression as string | undefined,
          next: getChildren(targetNode.id),
        };
      })
      .filter(child => child !== null) as LogicalNode[];
  };

  const startNode = nodes.find(node => node.type === "entry");
  if (!startNode) {
    return { name, flow: {} };
  }

  const logicalStart: LogicalNode = {
    id: startNode.id,
    type: startNode.type || "entry",
    label: startNode.data?.label as string | undefined,
    next: getChildren(startNode.id),
  };

  return {
    name,
    flow: {
      start: logicalStart,
    },
  };
};

export const memoizedGetLogicalFlow = memoize(getLogicalFlow, trimmedState =>
  JSON.stringify(trimmedState)
);
