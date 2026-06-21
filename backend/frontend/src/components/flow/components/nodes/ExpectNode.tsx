import { Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { Node } from "./Node";
import type { Handle } from "./Node";
import { memo } from "react";
import type { CustomNodeProps } from "./types";

const handles: Handle[] = [
  { type: "source", position: Position.Right },
  { type: "target", position: Position.Left },
];

const ExpectNode = memo(({ data, id }: NodeProps & CustomNodeProps) => {
  return (
    <Node
      id={id}
      handles={handles}
      layout="vertical"
      title={data.label || "Expect"}
      // expressionPrefix="Expectation"
      acceptExpression
    />
  );
});
export default ExpectNode;
