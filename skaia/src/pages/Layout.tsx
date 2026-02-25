import { type ReactNode } from "react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { useState, useEffect, useRef } from "react";
import "./Layout.css";

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      return savedTheme === "dark";
    }
    return false;
  });
  const wsRef = useRef<WebSocket | null>(null);

  // Set theme on mount
  useEffect(() => {
    const theme = isDarkMode ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
  }, [isDarkMode]);

  // Initialize WebSocket connection
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("Connected to WebSocket");
      };

      wsRef.current.onmessage = (event) => {
        console.log("WebSocket message:", event.data);
      };

      wsRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      wsRef.current.onclose = () => {
        console.log("Disconnected from WebSocket");
      };
    } catch (error) {
      console.error("WebSocket connection error:", error);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <div className="layout">
      <Header
        cartCount={0}
        isDarkMode={isDarkMode}
        onDarkModeToggle={setIsDarkMode}
      />
      <main className="layout-main">{children}</main>
      <Footer />
    </div>
  );
};
