import { useState } from "react";
import useDownloadJSON from "../../../hooks/useDownloadJSON";
import { useSetAtom } from "jotai";
import { flowStateAtom, defaultFlowState } from "../../../../../atoms/flow";
import FileUploader from "../../FileUploader";
import PromptDialog from "../editor/PromptDialog";
import { FileText } from "lucide-react";

export default function FileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const setFlowState = useSetAtom(flowStateAtom);
  const downloadJSON = useDownloadJSON({ depth: "full" });

  const resetFlow = () => {
    setFlowState(defaultFlowState);
    setIsOpen(false);
  };

  return (
    <div style={{ position: "relative" }}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--text-secondary)", transition: "all 0.2s",
          padding: "8px", borderRadius: "var(--radius-md)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--primary-color)"; e.currentTarget.style.background = "var(--bg-tertiary)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "none"; }}
        title="File Menu"
      >
        <FileText size={20} />
      </button>

      {isOpen && (
        <div style={{
          position: "absolute", left: "40px", top: 0,
          background: "var(--color-bg-elevated)", border: "1px solid var(--border-color)",
          borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", minWidth: "160px", zIndex: 10,
          overflow: "hidden", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)"
        }}>
          <button 
            style={{ display: "block", width: "100%", padding: "8px 12px", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", fontSize: "0.85rem", color: "var(--text-primary)", borderBottom: "1px solid var(--border-color)", transition: "background 0.2s" }} 
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-tertiary)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            onClick={() => { downloadJSON(); setIsOpen(false); }}>
            Export Project
          </button>
          
          <FileUploader acceptExtensions={["ts", "go", "prisma"]} trigger={
            <div 
              style={{ width: "100%", padding: "8px 12px", textAlign: "left", cursor: "pointer", fontSize: "0.85rem", color: "var(--text-primary)", borderBottom: "1px solid var(--border-color)", transition: "background 0.2s" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-tertiary)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              Import Schema
            </div>
          } />

          <PromptDialog
            trigger={
              <div 
                style={{ width: "100%", padding: "8px 12px", textAlign: "left", cursor: "pointer", fontSize: "0.85rem", color: "var(--error-color)", transition: "background 0.2s" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--error-bg)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                Reset Canvas
              </div>
            }
            title="Reset Canvas"
            description="Are you sure? Doing this will reset any saved progress."
            onConfirm={resetFlow}
            confirmText="Reset"
            type="Warning"
          />
        </div>
      )}
    </div>
  );
}
