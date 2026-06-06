import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { layoutModeAtom } from "../../atoms/layoutMode";

export default function VisualizerPage() {
  const setLayoutMode = useSetAtom(layoutModeAtom);

  useEffect(() => {
    setLayoutMode("application");
  }, [setLayoutMode]);

  return (
    <style>{`
      .layout-main, .app, #root {
        background: transparent !important;
        background-color: transparent !important;
        box-shadow: none !important;
      }
      .layout-main {
        display: none !important;
      }
    `}</style>
  );
}
