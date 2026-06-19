import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./components/ui/Mentions.css";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";

// If the React app boots, cancel the fallback timer from the Nginx 503 shell
if ((window as any).fallbackTimer) {
  clearTimeout((window as any).fallbackTimer);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>
);
