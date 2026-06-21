import type { Node } from "@xyflow/react";
import { useSetAtom } from "jotai";
import { flowStateAtom } from "../../../../../atoms/flow";
import PromptDialog from "./PromptDialog";
import { Formik, Form } from "formik";
import FormikInput from "../../../../formik/FormikInput";
import FormikSelect from "../../../../formik/FormikSelect";
import { nodeGroups } from "../../../config";

export default function NodeEditor({
  selectedNodes,
  contentViewBlocked,
}: {
  selectedNodes: Node[];
  contentViewBlocked: boolean;
}) {
  const setFlowState = useSetAtom(flowStateAtom);

  const selectedNode = selectedNodes[0];
  const multipleNodesSelected = selectedNodes.length > 1;

  const handleNodeDelete = (id: string) => {
    setFlowState((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== id),
      edges: prev.edges.filter((e) => e.source !== id && e.target !== id),
    }));
  };

  const updateNode = (id: string, property: string, value: any) => {
    setFlowState((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        if (n.id === id) {
          if (property === "data") {
            return { ...n, data: { ...n.data, ...value } };
          }
          return { ...n, [property]: value };
        }
        return n;
      }),
    }));
  };

  const typeOptions = nodeGroups.flatMap((group) => group.options.map(opt => ({ label: opt.displayText, value: opt.value })));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "12px" }}>
      {selectedNodes.length === 1 && selectedNode && (
        <>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
            <span style={{ padding: "2px 6px", background: "color-mix(in srgb, var(--primary-color) 15%, transparent)", color: "var(--primary-color)", borderRadius: "var(--radius-sm)", fontSize: "0.75rem", fontWeight: 600 }}>
              ID: {selectedNode.id}
            </span>
            <span style={{ padding: "2px 6px", background: "color-mix(in srgb, var(--primary-color) 15%, transparent)", color: "var(--primary-color)", borderRadius: "var(--radius-sm)", fontSize: "0.75rem", fontWeight: 600 }}>
              X: {selectedNode.position.x.toFixed(1)}
            </span>
            <span style={{ padding: "2px 6px", background: "color-mix(in srgb, var(--primary-color) 15%, transparent)", color: "var(--primary-color)", borderRadius: "var(--radius-sm)", fontSize: "0.75rem", fontWeight: 600 }}>
              Y: {selectedNode.position.y.toFixed(1)}
            </span>
          </div>

          <Formik
            initialValues={{
              type: selectedNode.type || "",
              label: (selectedNode.data?.label as string) || "",
              width: selectedNode.width || 0,
              height: selectedNode.height || 0,
            }}
            enableReinitialize
            onSubmit={(values) => {}}
          >
            {({ values, handleChange }) => (
              <Form style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <FormikSelect
                  name="type"
                  label="Node Type"
                  options={typeOptions}
                  onChange={(e) => {
                    handleChange(e);
                    updateNode(selectedNode.id, "type", e.target.value);
                  }}
                />

                <FormikInput
                  name="label"
                  label="Label"
                  type="text"
                  placeholder="Node label"
                  onChange={(e) => {
                    handleChange(e);
                    updateNode(selectedNode.id, "data", { label: e.target.value });
                  }}
                />

                <FormikInput
                  name="width"
                  label="Width (readonly)"
                  type="number"
                  disabled
                />

                <FormikInput
                  name="height"
                  label="Height (readonly)"
                  type="number"
                  disabled
                />
              </Form>
            )}
          </Formik>

          <hr style={{ borderColor: "var(--border-color)", borderTop: "none", margin: "16px 0" }} />

          <PromptDialog
            trigger={
              <button className="btn btn-danger btn-block">
                Remove Node
              </button>
            }
            title="Remove Node"
            description={`Are you sure you want to delete node ${selectedNode.id}?`}
            onConfirm={() => handleNodeDelete(selectedNode.id)}
            confirmText="Remove Node"
            type="Warning"
          />
        </>
      )}

      {multipleNodesSelected && (
        <PromptDialog
          trigger={
            <button className="btn btn-danger btn-block">
              Remove Selected Nodes
            </button>
          }
          title="Remove Nodes"
          description={`Are you sure you want to delete ${selectedNodes.length} nodes?`}
          onConfirm={() => selectedNodes.forEach((node) => handleNodeDelete(node.id))}
          confirmText="Remove Nodes"
          type="Warning"
        />
      )}
    </div>
  );
}
