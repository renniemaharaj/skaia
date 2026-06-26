import { Blockquote } from "reactjs-tiptap-editor/blockquote";
import { BulletList } from "reactjs-tiptap-editor/bulletlist";
import { Code } from "reactjs-tiptap-editor/code";
import { CodeBlock } from "reactjs-tiptap-editor/codeblock";
import { HorizontalRule } from "reactjs-tiptap-editor/horizontalrule";
import { Indent } from "reactjs-tiptap-editor/indent";
import { ColumnActionButton } from "reactjs-tiptap-editor/multicolumn";
import { OrderedList } from "reactjs-tiptap-editor/orderedlist";
import { Table } from "reactjs-tiptap-editor/table";
import { TaskList } from "reactjs-tiptap-editor/tasklist";

export const blockExtensions = [
  BulletList,
  OrderedList,
  Indent,
  TaskList.configure({
    spacer: true,
    taskItem: {
      nested: true,
    },
  }),
  Blockquote,
  HorizontalRule,
  Code.configure({ toolbar: false }),
  CodeBlock,
  ColumnActionButton,
  Table,
];
