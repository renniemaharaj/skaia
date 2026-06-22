import type { Edge, Node } from "@xyflow/react";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export type NodeData = {
  [key: string]: string | number | boolean | object | undefined;
  label?: string;
  isInitial?: boolean;
};

export type FlowState = {
  name: string;
  editor: {
    designer: string;
    version: string;
    panelExtended: boolean;
    maxPanelSize: number;
    minPanelSize: number;
    displayMiniMap: boolean;
  };
  nodes: Node[];
  edges: Edge[];
};

export const defaultFlowState: FlowState = {
  name: "New Flow",
  editor: {
    designer: "sk-designer",
    version: "1.0",
    panelExtended: true,
    maxPanelSize: 400,
    minPanelSize: 400,
    displayMiniMap: true,
  },
  nodes: [],
  edges: [],
};

export const flowStateAtom = atomWithStorage<FlowState>("flowprofile_v2", defaultFlowState);
export const nodesAtom = atom(
  get => get(flowStateAtom).nodes,
  (get, set, update: Node[] | ((prev: Node[]) => Node[])) => {
    const prev = get(flowStateAtom);
    const nextNodes = typeof update === "function" ? update(prev.nodes) : update;
    set(flowStateAtom, { ...prev, nodes: nextNodes });
  }
);

export const edgesAtom = atom(
  get => get(flowStateAtom).edges,
  (get, set, update: Edge[] | ((prev: Edge[]) => Edge[])) => {
    const prev = get(flowStateAtom);
    const nextEdges = typeof update === "function" ? update(prev.edges) : update;
    set(flowStateAtom, { ...prev, edges: nextEdges });
  }
);
