import type { Edge, Node } from "@xyflow/react";
// import "reactflow/dist/style.css";
import { getInfoFromSchema } from "./utils/SchemaVisualizer.utils";

export const SchemaVisualizer = ({ schema }: { schema?: string }) => {
  if (!schema) return { nodes: [], edges: [] };
  // Extract models and connections from the schema
  const { models, connections } = getInfoFromSchema(schema);

  // Determine the number of rows/columns required to fit all models in a grid
  let numGrid = 1;
  while (numGrid ** 2 < models.length) {
    numGrid++;
  }

  // Map models to nodes with calculated grid positions
  const nodes: Node[] = models.map((model, index) => {
    // Calculate row and column for the current model
    const row = Math.floor(index / numGrid);
    const column = index % numGrid;

    // Calculate position based on row and column with adjusted spacing
    const x = column * 400;
    const y = row * 400;

    return {
      id: `node-${model.name}`,
      position: { x, y },
      data: model,
      type: "model",
    };
  });

  const edges: Edge[] = connections.map(connection => {
    const sourceId = `${connection.source}-${connection.name}`;
    return {
      id: sourceId,
      source: `node-${connection.source}`,
      target: `node-${connection.target}`,
      sourceHandle: sourceId,
      // targetHandle: connection.target,
      animated: true,
    };
  });

  return { nodes, edges };
};
