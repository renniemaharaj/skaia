import { Outlet } from "react-router-dom";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { useState, useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { wsBaseUrlAtom } from "../atoms/config";
import { usePresence } from "../hooks/usePresence";
export const RootLayout: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      return savedTheme === "dark";
    }
    return false;
  });
  const wsRef = useRef<WebSocket | null>(null);

  usePresence();

  // Set theme on mount
  useEffect(() => {
    const theme = isDarkMode ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
  }, [isDarkMode]);

  const wsUrl = useAtomValue(wsBaseUrlAtom);

  // Initialize WebSocket connection
  useEffect(() => {
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
    <div className="root-layout">
      <Header
        cartCount={0}
        isDarkMode={isDarkMode}
        onDarkModeToggle={setIsDarkMode}
      />
      <main className="main-content">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};
