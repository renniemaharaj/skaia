import { Position } from "@xyflow/react";

export interface CustomNodeProps {
  data: {
    isInitial?: boolean;
    label: string;
    expression?: string;
  };
  id: string;
  position?: { x: string; y: string };
  type?: string;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
  className?: string;
  sourcePosition?: Position;
  targetPosition?: Position;
  zIndex?: number;
  parentNode?: string; // If it's a child node
  extent?: "parent" | "viewport" | number[]; // For bounds limiting
  draggable?: boolean; // Overrides global setting
  selectable?: boolean;
  animated?: boolean;
}
