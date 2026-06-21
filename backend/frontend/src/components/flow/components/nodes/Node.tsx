import type { ReactNode } from "react";
import { Handle as ReactHandle, Position } from "@xyflow/react";
import type { HandleType } from "@xyflow/react";
import { SquareFunctionIcon } from "lucide-react";

export type Handle = {
  type: HandleType;
  position: Position;
};

export function Node({
  handles,
  className,
  layout,
  icon,
  title,
  id,
  acceptExpression,
}: {
  handles: Handle[];
  className?: string;
  layout?: "horizontal" | "vertical";
  icon?: ReactNode;
  title?: string;
  id?: string;
  acceptExpression?: boolean;
}) {
  const nodeStyle = {
    padding: "12px",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-lg)",
    display: "flex",
    flexDirection: layout === "horizontal" ? "row" as const : "column" as const,
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--border-color)",
    color: "var(--text-primary)",
    minWidth: "150px"
  };

  return (
    <div key={"node" + id} style={nodeStyle} className={`hrtm-react-node-wrapper ${className || ""}`}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-start" }}>
        {icon}
        {acceptExpression && !icon && <SquareFunctionIcon size={16} />}
        <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{title}</span>
      </div>

      {handles.map((handle: Handle, index) => (
        <ReactHandle
          key={index}
          type={handle.type}
          position={handle.position}
          style={{ background: "var(--primary-color)", width: "12px", height: "12px", border: "2px solid var(--bg-color)" }}
        />
      ))}
    </div>
  );
}
