import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  Controls as ReactFlowControls,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import type { Connection, Edge, EdgeChange, Node, NodeChange } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";

import CustomControls from "./components/Controls";
import { Header } from "./components/Header";
import "./styles.css";
import "./Flow.css";

import { useAtom } from "jotai";
import { debounce } from "lodash";
import { flowStateAtom } from "../../atoms/flow";
import { useThemeContext } from "../../hooks/theme/useThemeContext";
import Panel from "./components/Panel";
import { nodeData } from "./config";

export default function Flow() {
  const { theme } = useThemeContext();
  const [flowState, setFlowState] = useAtom(flowStateAtom);

  const [nodes, setNodes] = useState(flowState.nodes);
  const [edges, setEdges] = useState(flowState.edges);
  const [selectedLocal, setSelectedLocal] = useState<Node[]>([]);
  const debouncedSync = useRef(
    debounce((updatedNodes: Node[], updatedEdges: Edge[]) => {
      setFlowState(prev => ({ ...prev, nodes: updatedNodes, edges: updatedEdges }));
    }, 100)
  ).current;

  useEffect(() => {
    setNodes([...flowState.nodes]);
    setEdges([...flowState.edges]);
  }, [flowState.nodes, flowState.edges]);

  const updateSelectedLocal = useCallback(
    (updatedNodes: Node[]) => {
      setSelectedLocal(updatedNodes.filter(node => selectedLocal.find(sn => sn.id === node.id)));
    },
    [selectedLocal]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes(prev => {
        const updated = applyNodeChanges(changes, JSON.parse(JSON.stringify(prev)));
        debouncedSync(updated, edges);
        updateSelectedLocal(updated);
        return updated;
      });
    },
    [edges, debouncedSync, updateSelectedLocal]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges(prev => {
        const updated = applyEdgeChanges(changes, JSON.parse(JSON.stringify(prev)));
        debouncedSync(nodes, updated);
        return updated;
      });
    },
    [nodes, debouncedSync]
  );

  const onSelectionChange = useCallback(({ nodes: selNodes }: { nodes: Node[] }) => {
    setSelectedLocal(selNodes);
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges(prev => {
        const updated = [
          ...prev,
          { ...params, id: `${params.source}-${params.target}`, animated: true },
        ];
        debouncedSync(nodes, updated);
        return updated;
      });
    },
    [nodes, debouncedSync]
  );

  return (
    <ReactFlowProvider>
      <div className="sk-flow-wrapper">
        <Header />
        <main className="sk-flow-main">
          <div
            className="sk-flow-panel-container"
            style={{
              width: flowState.editor.panelExtended ? flowState.editor.maxPanelSize : 48,
              overflow: "hidden",
            }}
          >
            <Panel nodes={nodes} selectedNodes={selectedLocal} />
          </div>
          <div className="sk-flow-canvas">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              colorMode={theme as "light" | "dark"}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
              fitView
              fitViewOptions={{ maxZoom: 0.8, padding: 0.1 }}
              proOptions={{ hideAttribution: true }}
              nodeTypes={nodeData}
            >
              <ReactFlowControls>
                <CustomControls />
              </ReactFlowControls>
              {flowState.editor.displayMiniMap && <MiniMap />}
              <Background
                variant={BackgroundVariant.Lines}
                gap={24}
                color="color-mix(in srgb, var(--text-primary) 5%, transparent)"
              />
            </ReactFlow>
          </div>
        </main>
      </div>
    </ReactFlowProvider>
  );
}
