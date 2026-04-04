import Editor from "@monaco-editor/react";
import { debounce } from "lodash";
import type { editor } from "monaco-editor";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useThemeContext } from "../../hooks/theme/useThemeContext";

const MonacoEditor = ({
  height,
  language,
  code,
  onChange,
  editable = true,
}: {
  height: number;
  language: string;
  code: string;
  onChange?: (value: string) => void;
  editable?: boolean;
}) => {
  const { theme } = useThemeContext();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [codeContent, setCodeContent] = useState(code);
  const ignoreChangeRef = useRef(false);

  const onEditorMount = (editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    editor.focus();
    setEditorValue(codeContent);
  };

  const setEditorValue = (code: string) => {
    if (editorRef.current && !ignoreChangeRef.current) {
      const currentModel = editorRef.current.getModel();
      const currentValue = currentModel?.getValue();
      if (!code) editorRef.current.setValue("");
      if (currentValue !== code) editorRef.current.setValue(code);
    }
  };

  const setEditorValueCallback = useCallback(setEditorValue, []);
  useEffect(() => {
    setEditorValueCallback(codeContent);
  }, [codeContent, setEditorValueCallback]);

  useEffect(() => {
    if (!editorRef.current) console.log("Editor not mounted yet");
    setCodeContent(code);
  }, [code]);

  const debounceClearIgnoreChange = useRef(
    debounce(() => {
      ignoreChangeRef.current = false;
    }, 500),
  );

  const debounceSendChanges = useRef(
    debounce((value: string) => {
      ignoreChangeRef.current = true;
      if (onChange) {
        onChange(value);
        debounceClearIgnoreChange.current();
      }
    }, 300),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      <Editor
        height={height}
        width="100%"
        language={language}
        theme={theme === "dark" ? "vs-dark" : "vs-light"}
        onMount={onEditorMount}
        options={{
          readOnly: !editable,
          padding: { top: 10, bottom: 10 }, // Adds internal padding
          minimap: { enabled: false }, // Hides minimap
          fontSize: 14, // Adjusts font size
          lineNumbersMinChars: 3, // Adjusts left gutter space
        }}
        onChange={(value) => {
          debounceSendChanges.current(value ?? "");
        }}
      />
    </div>
  );
};

export default memo(MonacoEditor);
