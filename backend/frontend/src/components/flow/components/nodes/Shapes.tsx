import { Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { Node } from "./Node";
import type { Handle } from "./Node";
import { memo } from "react";
import type { CustomNodeProps } from "./types";

const handles: Handle[] = [
  { type: "source", position: Position.Right },
  { type: "target", position: Position.Left },
];

// Circle Node
export const CircleNode = memo(({ data }: NodeProps & CustomNodeProps) => (
  <Node
    handles={handles}
    layout="horizontal"
    icon={
      <div style={{ width: "24px", height: "24px", background: "transparent", border: "2px solid var(--text-primary)", borderRadius: "50%", flexShrink: 0 }} />
    }
    title={data.label || "Circle"}
  />
));

// Square Node
export const SquareNode = memo(({ data }: NodeProps & CustomNodeProps) => (
  <Node
    handles={handles}
    layout="horizontal"
    icon={
      <div style={{ width: "24px", height: "24px", background: "transparent", border: "2px solid var(--text-primary)", borderRadius: "4px", flexShrink: 0 }} />
    }
    title={data.label || "Square"}
  />
));

// Rounded Square Node
export const RoundedSquareNode = memo(
  ({ data }: NodeProps & CustomNodeProps) => (
    <Node
      handles={handles}
      layout="horizontal"
      icon={
        <div style={{ width: "24px", height: "24px", background: "transparent", border: "2px solid var(--text-primary)", borderRadius: "8px", flexShrink: 0 }} />
      }
      title={data.label || "Rounded Square"}
    />
  ),
);

// Diamond Node
export const DiamondNode = memo(({ data }: NodeProps & CustomNodeProps) => (
  <Node
    handles={handles}
    layout="horizontal"
    icon={
      <div style={{ width: "24px", height: "24px", background: "transparent", border: "2px solid var(--text-primary)", transform: "rotate(45deg)", flexShrink: 0 }} />
    }
    title={data.label || "Diamond"}
  />
));

// Pentagon Node
export const PentagonNode = memo(({ data }: NodeProps & CustomNodeProps) => (
  <Node
    handles={handles}
    layout="horizontal"
    icon={
      <div
        style={{
          width: "24px", height: "24px", background: "var(--text-primary)", flexShrink: 0,
          clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)",
        }}
      />
    }
    title={data.label || "Pentagon"}
  />
));

// Hexagon Node
export const HexagonNode = memo(({ data }: NodeProps & CustomNodeProps) => (
  <Node
    handles={handles}
    layout="horizontal"
    icon={
      <div 
        style={{ width: "24px", height: "24px", background: "var(--text-primary)", flexShrink: 0, clipPath: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)" }} 
      />
    }
    title={data.label || "Hexagon"}
  />
));

// Cylinder Node
export const CylinderNode = memo(({ data }: NodeProps & CustomNodeProps) => (
  <Node
    handles={handles}
    layout="horizontal"
    icon={
      <div style={{ width: "24px", height: "24px", background: "transparent", border: "2px solid var(--text-primary)", position: "relative", overflow: "hidden", borderRadius: "4px", flexShrink: 0 }}>
        <div style={{ width: "100%", height: "4px", background: "var(--text-primary)", position: "absolute", top: 0, left: 0 }} />
        <div style={{ width: "100%", height: "4px", background: "var(--text-primary)", position: "absolute", bottom: 0, left: 0 }} />
      </div>
    }
    title={data.label || "Cylinder"}
  />
));

// Triangle Node
export const TriangleNode = memo(({ data }: NodeProps & CustomNodeProps) => (
  <Node
    handles={handles}
    layout="horizontal"
    icon={
      <div style={{ width: "24px", height: "24px", background: "var(--text-primary)", flexShrink: 0, clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }} />
    }
    title={data.label || "Triangle"}
  />
));

// Cross Node
export const CrossNode = memo(({ data }: NodeProps & CustomNodeProps) => (
  <Node
    handles={handles}
    layout="horizontal"
    icon={
      <div style={{ width: "24px", height: "24px", background: "var(--text-primary)", flexShrink: 0, clipPath: "polygon(33.33% 0%, 66.66% 0%, 66.66% 33.33%, 100% 33.33%, 100% 66.66%, 66.66% 66.66%, 66.66% 100%, 33.33% 100%, 33.33% 66.66%, 0% 66.66%, 0% 33.33%, 33.33% 33.33%)" }} />
    }
    title={data.label || "Cross"}
  />
));

// Parallelogram Node
export const ParallelogramNode = memo(
  ({ data }: NodeProps & CustomNodeProps) => (
    <Node
      handles={handles}
      layout="horizontal"
      icon={
        <div style={{ width: "24px", height: "24px", background: "transparent", border: "2px solid var(--text-primary)", transform: "skewX(-15deg)", borderRadius: "2px", flexShrink: 0 }} />
      }
      title={data.label || "Parallelogram"}
    />
  ),
);
