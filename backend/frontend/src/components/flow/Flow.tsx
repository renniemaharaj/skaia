import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls as ReactFlowControls,
  BackgroundVariant,
  ReactFlowProvider,
  MiniMap,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import type {
  Connection,
  NodeChange,
  EdgeChange,
  Node,
  Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import CustomControls from "./components/Controls";
import { Header } from "./components/Header";
import "./styles.css";
import "./Flow.css";

import { useAtom } from "jotai";
import { flowStateAtom } from "../../atoms/flow";
import { nodeData } from "./config";
import { useThemeContext } from "../../hooks/theme/useThemeContext";
import { debounce } from "lodash";
import Panel from "./components/Panel";

export default function Flow() {
  const { theme } = useThemeContext();
  const [flowState, setFlowState] = useAtom(flowStateAtom);

  const [nodes, setNodes] = useState(flowState.nodes);
  const [edges, setEdges] = useState(flowState.edges);
  const [selectedLocal, setSelectedLocal] = useState<Node[]>([]);
  const [progressSaved, setProgressSaved] = useState(false);

  const debounceSetProgressSaved = useRef(
    debounce(() => setProgressSaved(true), 3000)
  ).current;

  const debouncedSync = useRef(
    debounce((updatedNodes: Node[], updatedEdges: Edge[], profile: any) => {
      setFlowState((prev) => ({ ...prev, nodes: updatedNodes, edges: updatedEdges }));
      debounceSetProgressSaved();
    }, 100)
  ).current;

  useEffect(() => {
    setNodes([...flowState.nodes]);
    setEdges([...flowState.edges]);
  }, [flowState.nodes, flowState.edges]);

  const syncNow = useCallback(() => {
    setFlowState((prev) => ({ ...prev, nodes, edges }));
    setProgressSaved(true);
  }, [nodes, edges, setFlowState]);

  const updateSelectedLocal = useCallback(
    (updatedNodes: Node[]) => {
      setSelectedLocal(updatedNodes.filter((node) => selectedLocal.find((sn) => sn.id === node.id)));
    },
    [selectedLocal]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((prev) => {
        const updated = applyNodeChanges(changes, JSON.parse(JSON.stringify(prev)));
        debouncedSync(updated, edges, flowState);
        updateSelectedLocal(updated);
        setProgressSaved(false);
        return updated;
      });
    },
    [edges, debouncedSync, flowState, updateSelectedLocal]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((prev) => {
        const updated = applyEdgeChanges(changes, JSON.parse(JSON.stringify(prev)));
        debouncedSync(nodes, updated, flowState);
        setProgressSaved(false);
        return updated;
      });
    },
    [nodes, debouncedSync, flowState]
  );

  const onSelectionChange = useCallback(({ nodes: selNodes }: { nodes: Node[] }) => {
    setSelectedLocal(selNodes);
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((prev) => {
        const updated = [...prev, { ...params, id: `${params.source}-${params.target}`, animated: true }];
        debouncedSync(nodes, updated, flowState);
        return updated;
      });
    },
    [nodes, debouncedSync, flowState]
  );

  return (
    <ReactFlowProvider>
      <div className="sk-flow-wrapper">
        <Header progressSaved={progressSaved} syncNow={syncNow} />
        <main className="sk-flow-main">
          <div className="sk-flow-panel-container" style={{ width: flowState.editor.panelExtended ? flowState.editor.maxPanelSize : 48, overflow: 'hidden' }}>
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
              <Background variant={BackgroundVariant.Lines} gap={24} color="color-mix(in srgb, var(--text-primary) 5%, transparent)" />
            </ReactFlow>
          </div>
        </main>
      </div>
    </ReactFlowProvider>
  );
}
