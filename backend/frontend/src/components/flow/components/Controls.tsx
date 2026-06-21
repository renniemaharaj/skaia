import React, { useState } from "react";
import { Maximize, PlusSquare } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import Select from "../../input/Select";
import { nodeGroups } from "../config";

export default function Controls() {
  const { fitView, addNodes, screenToFlowPosition } = useReactFlow();
  const [addingNode, setAddingNode] = useState(false);

  const handleAddNode = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nodeType = e.target.value;
    if (!nodeType) {
      setAddingNode(false);
      return;
    }

    const newNode = {
      id: `node_${Date.now()}`,
      type: nodeType,
      position: screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }),
      data: { label: `New ${nodeType}` },
    };

    addNodes(newNode);
    setAddingNode(false);
  };

  return (
    <div style={{
      display: "flex", gap: "8px", alignItems: "center", padding: "6px",
      background: "var(--color-bg-elevated)", borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-color)",
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)"
    }}>
      <button 
        onClick={() => fitView()} 
        style={{
          padding: "6px", background: "none", border: "none", cursor: "pointer",
          color: "var(--text-secondary)", transition: "all 0.2s", borderRadius: "var(--radius-md)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--primary-color)"; e.currentTarget.style.background = "var(--bg-tertiary)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "none"; }}
        title="Fit View"
      >
        <Maximize size={16} />
      </button>

      <button 
        onClick={() => setAddingNode(!addingNode)} 
        style={{
          padding: "6px", background: addingNode ? "var(--bg-tertiary)" : "none", border: "none", cursor: "pointer",
          color: addingNode ? "var(--primary-color)" : "var(--text-secondary)", transition: "all 0.2s", borderRadius: "var(--radius-md)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--primary-color)"; e.currentTarget.style.background = "var(--bg-tertiary)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = addingNode ? "var(--primary-color)" : "var(--text-secondary)"; e.currentTarget.style.background = addingNode ? "var(--bg-tertiary)" : "none"; }}
        title="Add Node"
      >
        <PlusSquare size={16} />
      </button>

      {addingNode && (
        <div style={{ width: "150px" }}>
          <Select
            size="sm"
            onChange={handleAddNode}
            autoFocus
          >
            <option value="">Select type...</option>
            {nodeGroups.map((group: any) => (
              <optgroup key={group.displayText} label={group.displayText}>
                {group.options.map((opt: any) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.displayText}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
