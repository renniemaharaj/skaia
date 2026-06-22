import { Attachment } from "reactjs-tiptap-editor/attachment";
import { Iframe } from "reactjs-tiptap-editor/iframe";
import { Image } from "reactjs-tiptap-editor/image";
import { Link } from "reactjs-tiptap-editor/link";
import { Video } from "reactjs-tiptap-editor/video";
import { uploadEditorFile } from "../../../utils/upload";

export const mediaExtensions = [
  Link,
  Image.configure({
    upload: (file: File) => uploadEditorFile(file, "image"),
  }),
  Video.configure({
    upload: (file: File) => uploadEditorFile(file, "video"),
  }),
  Iframe,
  Attachment.configure({
    upload: (file: File) => uploadEditorFile(file, "file"),
  }),
];
