import { BaseKit } from "reactjs-tiptap-editor";
import { Bold } from "reactjs-tiptap-editor/bold";
import { Clear } from "reactjs-tiptap-editor/clear";
import { Color } from "reactjs-tiptap-editor/color";
import { FontFamily } from "reactjs-tiptap-editor/fontfamily";
import { FontSize } from "reactjs-tiptap-editor/fontsize";
import { FormatPainter } from "reactjs-tiptap-editor/formatpainter";
import { Heading } from "reactjs-tiptap-editor/heading";
import { Highlight } from "reactjs-tiptap-editor/highlight";
import { History } from "reactjs-tiptap-editor/history";
import { Italic } from "reactjs-tiptap-editor/italic";
import { LineHeight } from "reactjs-tiptap-editor/lineheight";
import { MoreMark } from "reactjs-tiptap-editor/moremark";
import { Strike } from "reactjs-tiptap-editor/strike";
import { TextAlign } from "reactjs-tiptap-editor/textalign";
import { TextDirection } from "reactjs-tiptap-editor/textdirection";
import { TextUnderline } from "reactjs-tiptap-editor/textunderline";
import { Emoji } from "reactjs-tiptap-editor/emoji";

export const coreExtensions = [
  BaseKit.configure({ characterCount: false }),
  History,
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
  TextAlign.configure({ types: ["heading", "paragraph"], spacer: true }),
  LineHeight,
  TextDirection,
];
