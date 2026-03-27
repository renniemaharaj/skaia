import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";
import { hasPermissionAtom } from "../atoms/auth";
import { apiRequest } from "../utils/api";

export interface PageBuilderPage {
  id: number;
  slug: string;
  title: string;
  description: string;
  is_index: boolean;
  content: string; // JSON string of landing sections
  created_at: string;
  updated_at: string;
}

interface UsePageDataReturn {
  page: PageBuilderPage | null;
  loading: boolean;
  error: string;
  isEditable: boolean;
  refresh: (slug?: string) => Promise<void>;
  createPage: (
    page: Omit<PageBuilderPage, "id" | "created_at" | "updated_at">,
  ) => Promise<PageBuilderPage>;
  updatePage: (
    page: Omit<PageBuilderPage, "created_at" | "updated_at">,
  ) => Promise<PageBuilderPage>;
  deletePage: (id: number) => Promise<void>;
}

export function usePageData(): UsePageDataReturn {
  const hasPermission = useAtomValue(hasPermissionAtom);
  const isEditable = hasPermission("home.manage");

  const [page, setPage] = useState<PageBuilderPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (slug?: string) => {
    setLoading(true);
    setError("");
    try {
      const endpoint = slug ? `/config/pages/${slug}` : "/config/pages/index";
      const currentPage = await apiRequest<PageBuilderPage>(endpoint);
      setPage(currentPage);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load page";
      setPage(null);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const createPage = useCallback(
    async (p: Omit<PageBuilderPage, "id" | "created_at" | "updated_at">) => {
      const created = await apiRequest<PageBuilderPage>("/config/pages", {
        method: "POST",
        body: JSON.stringify(p),
      });
      return created;
    },
    [],
  );

  const updatePage = useCallback(
    async (p: Omit<PageBuilderPage, "created_at" | "updated_at">) => {
      const updated = await apiRequest<PageBuilderPage>(
        `/config/pages/${p.id}`,
        {
          method: "PUT",
          body: JSON.stringify(p),
        },
      );
      return updated;
    },
    [],
  );

  const deletePage = useCallback(async (id: number) => {
    await apiRequest(`/config/pages/${id}`, {
      method: "DELETE",
    });
  }, []);

  return {
    page,
    loading,
    error,
    isEditable,
    refresh,
    createPage,
    updatePage,
    deletePage,
  };
}
