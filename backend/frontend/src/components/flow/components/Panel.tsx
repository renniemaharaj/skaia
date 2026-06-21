import { useState } from "react";
import type { Node } from "@xyflow/react";
import { useAtomValue, useSetAtom } from "jotai";
import { flowStateAtom } from "../../../atoms/flow";
import { LayoutDashboard, Plus, Settings } from "lucide-react";
import NodeEditor from "./panels/editor/NodeEditor";
import JsonViewer from "./panels/json/JsonViewer";
import NodePicker from "./NodePicker";
import FileMenu from "./panels/sidebar/FileMenu";
import UserBox from "./UserBox";

export default function Panel({
  nodes,
  selectedNodes,
}: {
  nodes: Node[];
  selectedNodes: Node[];
}) {
  const [activeTab, setActiveTab] = useState<"editor" | "scripts">("editor");
  const [pickerOpened, setPickerOpened] = useState(false);
  const flowProfile = useAtomValue(flowStateAtom);
  const setFlowState = useSetAtom(flowStateAtom);

  const togglePanel = () => {
    setFlowState((prev) => ({
      ...prev,
      editor: { ...prev.editor, panelExtended: !prev.editor.panelExtended },
    }));
  };

  return (
    <div style={{ display: "flex", height: "100%", width: "100%", background: "var(--bg-color)" }}>
      <div style={{
        width: "56px",
        flexShrink: 0,
        borderRight: "1px solid var(--border-color)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "16px 8px",
        gap: "16px",
        background: "var(--bg-secondary)"
      }}>
        <button title="Dashboard" onClick={togglePanel} style={{
          background: "none", border: "none", cursor: "pointer",
          color: flowProfile.editor.panelExtended ? "var(--primary-color)" : "var(--text-secondary)",
          transition: "all 0.2s",
          padding: "8px", borderRadius: "var(--radius-md)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--primary-color)"; e.currentTarget.style.background = "var(--bg-tertiary)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = flowProfile.editor.panelExtended ? "var(--primary-color)" : "var(--text-secondary)"; e.currentTarget.style.background = "none"; }}
        >
          <LayoutDashboard size={20} />
        </button>
        
        <NodePicker
          pickerOpened={pickerOpened}
          onPickerOpenChange={setPickerOpened}
          trigger={
            <button title="Node Creator" style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-secondary)", transition: "all 0.2s",
              padding: "8px", borderRadius: "var(--radius-md)",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--primary-color)"; e.currentTarget.style.background = "var(--bg-tertiary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "none"; }}
            >
              <Plus size={20} />
            </button>
          }
        />

        <FileMenu />
      </div>

      {/* Expanded Content Area */}
      {flowProfile.editor.panelExtended && (
        <div style={{ flex: 1, overflowY: "auto", width: "100%", minWidth: "250px", borderRight: "1px solid var(--border-color)", background: "var(--bg-color)" }} className="sk-flow-sidebar">
          <div className="sk-flow-tabs">
            <div
              className={`sk-flow-tab ${activeTab === "editor" ? "sk-flow-tab--active" : ""}`}
              onClick={() => setActiveTab("editor")}
            >
              Editor
            </div>
            <div
              className={`sk-flow-tab ${activeTab === "scripts" ? "sk-flow-tab--active" : ""}`}
              onClick={() => setActiveTab("scripts")}
            >
              Scripts
            </div>
            <div className="sk-flow-tab ml-auto font-bold cursor-pointer hover:opacity-80" onClick={togglePanel}>
              ✕
            </div>
          </div>

          <div className="sk-flow-panel-content">
            {activeTab === "editor" && (
              <div>
                {nodes.length === 0 ? (
                  <p className="opacity-50 text-sm">No nodes in the flow.</p>
                ) : selectedNodes.length === 0 ? (
                  <p className="opacity-50 text-sm">Select a node to edit its properties.</p>
                ) : (
                  <NodeEditor selectedNodes={selectedNodes} contentViewBlocked={false} />
                )}
              </div>
            )}
            {activeTab === "scripts" && (
              <div style={{ height: "100%", paddingBottom: "32px" }}>
                <JsonViewer flowState={flowProfile} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
