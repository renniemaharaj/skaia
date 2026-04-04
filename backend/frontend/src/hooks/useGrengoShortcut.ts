import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAtomValue } from "jotai";
import { isAuthenticatedAtom, currentUserAtom } from "../atoms/auth";

/**
 * Ctrl+G (or Cmd+G on macOS) opens a passcode dialog.
 * On success the backend creates a temporary session and we navigate to /tmp/<uuid>.
 * Only available to authenticated admins.
 */
export function useGrengoShortcut() {
  const navigate = useNavigate();
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const user = useAtomValue(currentUserAtom);
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const p1Ref = useRef("");
  const p2Ref = useRef("");

  const isAdmin = isAuthenticated && user?.roles?.includes("admin");

  // Listen for Ctrl+G / Cmd+G globally.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (isAdmin) {
          setShowDialog(true);
          setError("");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isAdmin]);

  const createSession = async (p1: string, p2: string) => {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("auth.accessToken");
      const res = await fetch("/api/grengo/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ p1, p2 }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data: { session_id: string; expires_at: string } = await res.json();
      setShowDialog(false);
      navigate(`/tmp/${data.session_id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setLoading(false);
    }
  };

  const closeDialog = () => {
    setShowDialog(false);
    setError("");
  };

  return {
    showDialog,
    loading,
    error,
    createSession,
    closeDialog,
    p1Ref,
    p2Ref,
  };
}
