// Imports the components used to render different types of nodes in the flow editor.
import ProcessNode from "./components/nodes/ProcessNode";
import EntryNode from "./components/nodes/EntryNode";
import ExpectNode from "./components/nodes/ExpectNode";
import ExpressionNode from "./components/nodes/ExpressionNode";

// Imports the components used to render different shapes of nodes in the flow editor.
import {
  CircleNode,
  SquareNode,
  RoundedSquareNode,
  DiamondNode,
  PentagonNode,
  HexagonNode,
  CylinderNode,
  TriangleNode,
  CrossNode,
  ParallelogramNode,
} from "./components/nodes/Shapes";

// Imports the OptionGroup type from the Select component.
import { OptionGroup } from "../Select";

/**
 * Configuration for node groups available in the flow editor.
 *
 * @typedef {Object} OptionGroup
 * @property {string} displayText - The name of the node group as displayed in the UI.
 * @property {Object[]} options - List of options available within this group.
 * @property {string} options[].displayText - Display name of the node type.
 * @property {string} options[].value - Unique identifier for the node type.
 */

/**
 * List of node groups used for organizing nodes in the flow editor UI.
 * Each group contains display text and options for nodes related to a specific category.
 *
 * @type {OptionGroup[]}
 */
export const nodeGroups: OptionGroup[] = [
  // {
  //   displayText: "Visualization",
  //   options: [{ displayText: "Model", value: "model" }],
  // },
  {
    displayText: "Computing",
    options: [
      { displayText: "Process", value: "process" },
      { displayText: "Entry", value: "entry" },
      { displayText: "Expect", value: "expect" },
      { displayText: "Expression", value: "expression" },
    ],
  },
  {
    displayText: "Shapes",
    options: [
      { displayText: "Circle", value: "circle" },
      { displayText: "Square", value: "square" },
      { displayText: "Rounded Square", value: "roundedSquare" },
      { displayText: "Diamond", value: "diamond" },
      { displayText: "Pentagon", value: "pentagon" },
      { displayText: "Hexagon", value: "hexagon" },
      { displayText: "Cylinder", value: "cylinder" },
      { displayText: "Triangle", value: "triangle" },
      { displayText: "Cross", value: "cross" },
      { displayText: "Parallelogram", value: "parallelogram" },
    ],
  },
];

/**
 * Maps node type identifiers to their respective component.
 *
 * This object enables dynamic rendering of nodes in the flow editor
 * based on the node type selected by the user. This is used by react flow library.
 *
 * @typedef {Object} NodeData
 * @property {React.ComponentType} entry - Component for Entry Node.
 * @property {React.ComponentType} process - Component for Process Node.
 * @property {React.ComponentType} expression - Component for Expression Node.
 * @property {React.ComponentType} expect - Component for Expect Node.
 * @property {React.ComponentType} circle - Component for Circle Node.
 * @property {React.ComponentType} square - Component for Square Node.
 * @property {React.ComponentType} roundedSquare - Component for Rounded Square Node.
 * @property {React.ComponentType} diamond - Component for Diamond Node.
 * @property {React.ComponentType} pentagon - Component for Pentagon Node.
 * @property {React.ComponentType} hexagon - Component for Hexagon Node.
 * @property {React.ComponentType} cylinder - Component for Cylinder Node.
 * @property {React.ComponentType} triangle - Component for Triangle Node.
 * @property {React.ComponentType} cross - Component for Cross Node.
 * @property {React.ComponentType} parallelogram - Component for Parallelogram Node.
 *
 * @type {NodeData}
 */
export const nodeData = {
  entry: EntryNode,
  process: ProcessNode,
  expression: ExpressionNode,
  expect: ExpectNode,
  circle: CircleNode,
  square: SquareNode,
  roundedSquare: RoundedSquareNode,
  diamond: DiamondNode,
  pentagon: PentagonNode,
  hexagon: HexagonNode,
  cylinder: CylinderNode,
  triangle: TriangleNode,
  cross: CrossNode,
  parallelogram: ParallelogramNode,
  //Add custom nodes below, make sure to import and update node groups for selection
};
