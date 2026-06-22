import { useSetAtom } from "jotai";
import { useState } from "react";
import { flowStateAtom } from "../../../atoms/flow";
import { useUploadFiles } from "../hooks/useUploadFiles";
import { SchemaVisualizer } from "../visualizer/schema/SchemaVisualizer";

export default function FileUploader({
  acceptExtensions,
  trigger,
}: {
  acceptExtensions: string[];
  trigger: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState("schema");
  const setFlowState = useSetAtom(flowStateAtom);

  const { files, errors, handleFileChange, resetFiles } = useUploadFiles({
    acceptedExtensions: acceptExtensions,
    maxFileSizeInMB: 100,
  });

  const concatenateFiles = async () => {
    const fileContents: string[] = [];
    for (const file of files) {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });
      fileContents.push(text);
    }
    return fileContents.join("\n");
  };

  const handleScrape = () => {
    if (files.length > 0) {
      concatenateFiles().then(result => {
        const { nodes, edges } = SchemaVisualizer({ schema: result });
        setFlowState(prev => ({
          ...prev,
          nodes,
          edges,
        }));
        setIsOpen(false);
      });
    }
  };

  return (
    <>
      <div onClick={() => setIsOpen(true)} className="cursor-pointer">
        {trigger}
      </div>
      {isOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "var(--overlay-dark)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-primary)",
              padding: "24px",
              borderRadius: "var(--radius-xl)",
              maxWidth: "450px",
              width: "100%",
              border: "1px solid var(--border-color)",
              boxShadow: "var(--shadow-xl)",
            }}
          >
            <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", margin: "0 0 8px 0" }}>Import</h2>
            <p style={{ margin: "0 0 24px 0", opacity: 0.8 }}>
              {`Import project or scrape for models. Accepts ${acceptExtensions.join(", ")} files.`}
            </p>

            <select
              value={uploadMode}
              onChange={e => setUploadMode(e.target.value)}
              style={{
                width: "100%",
                padding: "10px",
                marginBottom: "16px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-color)",
                background: "var(--bg-color)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            >
              <option
                value="schema"
                style={{ background: "var(--bg-color)", color: "var(--text-primary)" }}
              >
                Schema Visualization
              </option>
            </select>

            <input
              type="file"
              multiple
              onChange={handleFileChange}
              style={{ marginBottom: "16px", width: "100%" }}
            />

            {errors.length > 0 && (
              <div style={{ color: "#ef4444", marginBottom: "16px", fontSize: "12px" }}>
                <strong>Errors:</strong>
                <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
                  {errors.map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {files.length > 0 && (
              <div style={{ marginBottom: "16px", fontSize: "0.85rem" }}>
                <strong>{`Accepted ${files.length} files:`}</strong>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                  {files.map((file, idx) => (
                    <span
                      key={idx}
                      style={{
                        background: "var(--primary-color)",
                        color: "var(--bg-color)",
                        padding: "4px 10px",
                        borderRadius: "var(--radius-full)",
                        fontWeight: 500,
                      }}
                    >
                      {file.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <button
              className="btn btn-ghost"
              onClick={resetFiles}
              disabled={files.length === 0 && errors.length === 0}
              style={{ marginBottom: "16px" }}
            >
              Reset Files
            </button>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
                marginTop: "16px",
              }}
            >
              <button className="btn btn-secondary" onClick={() => setIsOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleScrape}
                disabled={files.length === 0}
              >
                Scrape
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
