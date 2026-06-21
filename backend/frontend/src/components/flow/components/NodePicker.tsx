import { useState } from "react";
import { nodeGroups } from "../config";
import { useSetAtom, useAtomValue } from "jotai";
import { flowStateAtom } from "../../../atoms/flow";
import Select from "../../input/Select";

const NodePicker = ({
  trigger,
  pickerOpened,
  onPickerOpenChange,
}: {
  trigger: React.ReactNode;
  pickerOpened: boolean;
  onPickerOpenChange: (state: boolean) => void;
}) => {
  const setFlowState = useSetAtom(flowStateAtom);
  const flowState = useAtomValue(flowStateAtom);

  const [nodeSelectionValue, setNodeSelectionValue] = useState<string>(
    nodeGroups[0].options[0].value
  );

  const handleCreate = () => {
    const lastPosition = flowState.nodes[flowState.nodes.length - 1]?.position || { x: 0, y: 0 };
    const offset = 200;

    const getUniqueId = () => {
      const usedIds = new Set(flowState.nodes.map((n) => n.id));
      let newId = `node-${flowState.nodes.length + 1}`;
      while (usedIds.has(newId)) {
        newId = `node-${parseInt(newId.split("-")[1] || "0") + 1}`;
      }
      return newId;
    };

    setFlowState((prev) => ({
      ...prev,
      nodes: [
        ...prev.nodes,
        {
          id: getUniqueId(),
          position: { x: lastPosition.x + offset, y: lastPosition.y + offset },
          type: nodeSelectionValue,
          data: { label: "" },
        },
      ],
    }));

    onPickerOpenChange(false);
  };

  return (
    <>
      <div className="cursor-pointer" onClick={() => onPickerOpenChange(!pickerOpened)}>
        {trigger}
      </div>
      {pickerOpened && (
        <div style={{
          position: "absolute", left: "60px", top: "80px", zIndex: 10,
          background: "var(--color-bg-elevated)", border: "1px solid var(--border-color)",
          padding: "16px", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xl)",
          width: "250px", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)"
        }}>
          <h3 style={{ margin: "0 0 8px 0", fontWeight: "bold" }}>Node Creator</h3>
          <p style={{ margin: "0 0 16px 0", fontSize: "12px", opacity: 0.8 }}>Select a node type to add.</p>
          
          <Select 
            value={nodeSelectionValue}
            onChange={(e: any) => setNodeSelectionValue(e.target.value)}
            style={{ width: "100%", marginBottom: "16px" }}
          >
            {nodeGroups.map((group) => (
              <optgroup key={group.displayText} label={group.displayText}>
                {group.options.map((opt: any) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button className="btn btn-ghost" onClick={() => onPickerOpenChange(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate}>Create</button>
          </div>
        </div>
      )}
    </>
  );
};

export default NodePicker;
