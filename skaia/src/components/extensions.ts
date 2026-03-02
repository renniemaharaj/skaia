import { BaseKit } from "reactjs-tiptap-editor";

import { Attachment } from "reactjs-tiptap-editor/attachment";
import { Blockquote } from "reactjs-tiptap-editor/blockquote";
import { Bold } from "reactjs-tiptap-editor/bold";
import { BulletList } from "reactjs-tiptap-editor/bulletlist";
import { Clear } from "reactjs-tiptap-editor/clear";
import { Code } from "reactjs-tiptap-editor/code";
import { CodeBlock } from "reactjs-tiptap-editor/codeblock";
import { Color } from "reactjs-tiptap-editor/color";
import { Emoji } from "reactjs-tiptap-editor/emoji";
import { FontFamily } from "reactjs-tiptap-editor/fontfamily";
import { FontSize } from "reactjs-tiptap-editor/fontsize";
import { FormatPainter } from "reactjs-tiptap-editor/formatpainter";
import { Heading } from "reactjs-tiptap-editor/heading";
import { Highlight } from "reactjs-tiptap-editor/highlight";
import { History } from "reactjs-tiptap-editor/history";
import { HorizontalRule } from "reactjs-tiptap-editor/horizontalrule";
import { Iframe } from "reactjs-tiptap-editor/iframe";
import { Image } from "reactjs-tiptap-editor/image";
import { Indent } from "reactjs-tiptap-editor/indent";
import { Italic } from "reactjs-tiptap-editor/italic";
import { LineHeight } from "reactjs-tiptap-editor/lineheight";
import { Link } from "reactjs-tiptap-editor/link";
import { Mention } from "reactjs-tiptap-editor/mention";
import { MoreMark } from "reactjs-tiptap-editor/moremark";
import { ColumnActionButton } from "reactjs-tiptap-editor/multicolumn";
import { OrderedList } from "reactjs-tiptap-editor/orderedlist";
import { SlashCommand } from "reactjs-tiptap-editor/slashcommand";
import { Strike } from "reactjs-tiptap-editor/strike";
import { Table } from "reactjs-tiptap-editor/table";
import { TaskList } from "reactjs-tiptap-editor/tasklist";
import { TextAlign } from "reactjs-tiptap-editor/textalign";
import { TextDirection } from "reactjs-tiptap-editor/textdirection";
import { TextUnderline } from "reactjs-tiptap-editor/textunderline";
import { Video } from "reactjs-tiptap-editor/video";

import { uploadEditorFile } from "../utils/upload";

const extensions = [
  BaseKit.configure({
    characterCount: false,
  }),
  History,
  // SearchAndReplace,
  // TableOfContents,
  FormatPainter.configure({ spacer: true }),
  Clear,
  FontFamily,
  Heading.configure({ spacer: true }),
  FontSize,
  Bold,
  Italic,
  TextUnderline,
  Strike,
  MoreMark,
  Emoji,
  Color.configure({ spacer: true }),
  Highlight,
  BulletList,
  OrderedList,
  TextAlign.configure({ types: ["heading", "paragraph"], spacer: true }),
  Indent,
  LineHeight,
  TaskList.configure({
    spacer: true,
    taskItem: {
      nested: true,
    },
  }),
  Link,
  Image.configure({
    upload: (file: File) => uploadEditorFile(file, "image"),
  }),
  Video.configure({
    upload: (file: File) => uploadEditorFile(file, "video"),
  }),
  // ImageGif.configure({
  //   GIPHY_API_KEY: process.env.NEXT_PUBLIC_GIPHY_API_KEY as string,
  // }),
  Blockquote,
  SlashCommand,
  HorizontalRule,
  Code.configure({ toolbar: false }),
  CodeBlock,
  ColumnActionButton,
  Table,
  Iframe,
  // ExportPdf.configure({ spacer: true }),
  // ImportWord.configure({
  //   upload: (files: File[]) =>
  //     Promise.resolve(
  //       files.map((file) => ({
  //         src: URL.createObjectURL(file),
  //         alt: file.name,
  //       })),
  //     ),
  // }),
  TextDirection,
  Mention,
  Attachment.configure({
    upload: (file: File) => uploadEditorFile(file, "file"),
  }),
];

export default extensions;
