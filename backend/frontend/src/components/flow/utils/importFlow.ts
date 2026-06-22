import type { FlowState } from "../../../atoms/flow";

export default function openAndPullDifferences(
  onComplete: (flowState: FlowState) => void,
  currentFlowState: FlowState
) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.multiple = true;

  input.addEventListener("change", async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const files = target.files;
    if (!files) return;

    const failures: Record<string, string> = {};
    let mergedFlowState = { ...currentFlowState };

    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const json = JSON.parse(text);

        if (!isValidFlowState(json)) {
          failures[file.name] = "Invalid flow state structure";
          continue;
        }

        mergedFlowState = mergeFlowStates(mergedFlowState, json);
      } catch (error: unknown) {
        failures[file.name] = error instanceof Error ? error.message : "Unknown JSON parsing error";
      }
    }

    if (Object.keys(failures).length > 0) {
      console.error("File processing failures:", failures);
    }

    onComplete(mergeFlowStates(currentFlowState, mergedFlowState));
  });

  input.click();
}

function isValidFlowState(json: any): json is FlowState {
  return Array.isArray(json.nodes) && Array.isArray(json.edges) && typeof json.editor === "object";
}

function mergeFlowStates(base: FlowState, incoming: FlowState): FlowState {
  const mergedNodes = mergeUniqueById(base.nodes, incoming.nodes);
  const mergedEdges = mergeUniqueById(base.edges, incoming.edges);
  const mergedEditor = { ...base.editor, ...incoming.editor };

  return {
    ...base,
    nodes: mergedNodes as any[],
    edges: mergedEdges as any[],
    editor: mergedEditor,
  };
}

function mergeUniqueById<T extends { id: string }>(base: T[], incoming: T[]): T[] {
  const map = new Map<string, T>();
  base.forEach(item => map.set(item.id, item));
  incoming.forEach(item => map.set(item.id, { ...map.get(item.id), ...item }));
  return Array.from(map.values());
}
