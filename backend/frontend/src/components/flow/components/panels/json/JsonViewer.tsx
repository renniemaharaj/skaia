import { useCallback, useEffect, useState } from "react";
import type { FlowState } from "../../../../../atoms/flow";
import { getFullState, getTrimmedState, memoizedGetLogicalFlow } from "../../../utils/extractFlow";

export default function JsonViewer({ flowState }: { flowState: FlowState }) {
  const [activeTab, setActiveTab] = useState("full");
  const [tabs, setTabs] = useState<{ id: string; label: string; content: string }[]>([]);

  const generateTabs = useCallback(() => {
    const full = JSON.stringify(getFullState(flowState), null, 2);
    const logical = JSON.stringify(memoizedGetLogicalFlow(getTrimmedState(flowState)), null, 2);

    return [
      { id: "full", label: "Full JSON", content: full },
      { id: "logical", label: "Logical JSON", content: logical },
    ];
  }, [flowState]);

  useEffect(() => {
    setTabs(generateTabs());
  }, [generateTabs]);

  const activeContent = tabs.find(t => t.id === activeTab)?.content || "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: "0.75rem",
          borderBottom: "1px solid var(--border-color)",
          background: "var(--bg-color)",
        }}
      >
        <div className="ui-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`ui-tab ${activeTab === tab.id ? "ui-tab--active" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div
        style={{ flex: 1, padding: "0.75rem", overflow: "hidden", background: "var(--bg-color)" }}
      >
        <pre
          style={{
            margin: 0,
            padding: "1rem",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-md)",
            overflow: "auto",
            height: "100%",
            fontSize: "0.85rem",
            fontFamily: "var(--font-mono)",
            color: "var(--text-primary)",
          }}
        >
          {activeContent}
        </pre>
      </div>
    </div>
  );
}
