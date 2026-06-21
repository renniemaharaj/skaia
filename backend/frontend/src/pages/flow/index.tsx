import React, { useEffect } from "react";
import Flow from "../../components/flow/Flow";
import SiteHead from "../../components/SiteHead";

export default function FlowPage() {
  useEffect(() => {
    const main = document.querySelector(".layout-main") as HTMLElement;
    if (main) {
      main.style.padding = "0";
    }
    return () => {
      if (main) {
        main.style.padding = "";
      }
    };
  }, []);

  return (
    <>
      <SiteHead seo={null} branding={null} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden" }}>
        <Flow />
      </div>
    </>
  );
}
