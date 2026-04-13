import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import type { LandingItem, LandingSection } from "../components/landing/types";
import { apiRequest } from "../utils/api";

interface UseLandingDataReturn {
  sections: LandingSection[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  updateSection: (s: LandingSection) => Promise<void>;
  createSection: (s: Omit<LandingSection, "id">) => Promise<void>;
  deleteSection: (id: number) => Promise<void>;
  reorderSections: (orderedIds: number[]) => Promise<void>;
  createItem: (
    sectionId: number,
    item: Omit<LandingItem, "id">,
  ) => Promise<void>;
  updateItem: (item: LandingItem) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
}

export function useLandingData(): UseLandingDataReturn {
  const [sections, setSections] = useState<LandingSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSections = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest<LandingSection[]>("/config/landing");
      setSections(data ?? []);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load landing data";
      setError(msg);
      console.error("useLandingData fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  useEffect(() => {
    const handler = (e: Event) => {
      const action =
        (e as CustomEvent<{ action?: string }>).detail?.action ?? "";
      if (action.startsWith("landing_")) fetchSections();
    };
    window.addEventListener("config:live:event", handler);
    return () => window.removeEventListener("config:live:event", handler);
  }, [fetchSections]);

  const updateSection = useCallback(async (s: LandingSection) => {
    try {
      await apiRequest(`/config/landing/sections/${s.id}`, {
        method: "PUT",
        body: JSON.stringify(s),
      });
      setSections((prev) =>
        prev.map((sec) => (sec.id === s.id ? { ...sec, ...s } : sec)),
      );
      toast.success("Section updated");
    } catch {
      toast.error("Failed to update section");
    }
  }, []);

  const createSection = useCallback(async (s: Omit<LandingSection, "id">) => {
    try {
      const created = await apiRequest<LandingSection>(
        "/config/landing/sections",
        { method: "POST", body: JSON.stringify(s) },
      );
      setSections((prev) => {
        const shifted = prev.map((sec) =>
          sec.display_order >= created.display_order
            ? { ...sec, display_order: sec.display_order + 1 }
            : sec,
        );
        const merged = [...shifted, created];
        return merged.sort((a, b) => a.display_order - b.display_order);
      });
      toast.success("Section added");
    } catch {
      toast.error("Failed to create section");
    }
  }, []);

  const deleteSection = useCallback(async (id: number) => {
    try {
      await apiRequest(`/config/landing/sections/${id}`, {
        method: "DELETE",
      });
      setSections((prev) => prev.filter((sec) => sec.id !== id));
      toast.success("Section removed");
    } catch {
      toast.error("Failed to delete section");
    }
  }, []);

  const createItem = useCallback(
    async (sectionId: number, item: Omit<LandingItem, "id">) => {
      try {
        const created = await apiRequest<LandingItem>(
          `/config/landing/sections/${sectionId}/items`,
          { method: "POST", body: JSON.stringify(item) },
        );
        setSections((prev) =>
          prev.map((sec) =>
            sec.id === sectionId
              ? { ...sec, items: [...(sec.items ?? []), created] }
              : sec,
          ),
        );
        toast.success("Item added");
      } catch {
        toast.error("Failed to add item");
      }
    },
    [],
  );

  const updateItem = useCallback(async (item: LandingItem) => {
    try {
      await apiRequest(`/config/landing/items/${item.id}`, {
        method: "PUT",
        body: JSON.stringify(item),
      });
      setSections((prev) =>
        prev.map((sec) => ({
          ...sec,
          items: (sec.items ?? []).map((it) =>
            it.id === item.id ? { ...it, ...item } : it,
          ),
        })),
      );
      toast.success("Item updated");
    } catch {
      toast.error("Failed to update item");
    }
  }, []);

  const deleteItem = useCallback(async (id: number) => {
    try {
      await apiRequest(`/config/landing/items/${id}`, {
        method: "DELETE",
      });
      setSections((prev) =>
        prev.map((sec) => ({
          ...sec,
          items: (sec.items ?? []).filter((it) => it.id !== id),
        })),
      );
      toast.success("Item removed");
    } catch {
      toast.error("Failed to delete item");
    }
  }, []);

  const reorderSections = useCallback(async (orderedIds: number[]) => {
    try {
      await apiRequest("/config/landing/sections/reorder", {
        method: "PUT",
        body: JSON.stringify({ ids: orderedIds }),
      });
    } catch {
      toast.error("Failed to reorder sections");
    }
  }, []);

  return {
    sections,
    loading,
    error,
    refetch: fetchSections,
    updateSection,
    createSection,
    deleteSection,
    reorderSections,
    createItem,
    updateItem,
    deleteItem,
  };
}
