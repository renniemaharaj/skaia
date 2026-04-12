import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";
import { hasPermissionAtom, currentUserAtom } from "../atoms/auth";
import { apiRequest } from "../utils/api";

export interface PageUser {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
}

export interface PageBuilderPage {
  id: number;
  slug: string;
  title: string;
  description: string;
  is_index: boolean;
  content: string; // JSON string of landing sections
  owner_id?: number | null;
  owner?: PageUser | null;
  editors?: PageUser[];
  created_at: string;
  updated_at: string;
}

interface UsePageDataReturn {
  page: PageBuilderPage | null;
  loading: boolean;
  error: string;
  isEditable: boolean;
  isAdmin: boolean;
  isOwner: boolean;
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
  const currentUser = useAtomValue(currentUserAtom);
  const isAdmin = hasPermission("home.manage");

  const [page, setPage] = useState<PageBuilderPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isOwner = !!(
    page?.owner_id &&
    currentUser &&
    Number(page.owner_id) === Number(currentUser.id)
  );
  const isEditor = !!page?.editors?.some(
    (e) => currentUser && Number(e.id) === Number(currentUser.id),
  );
  const isEditable = isAdmin || isOwner || isEditor;

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
    isAdmin,
    isOwner,
    refresh,
    createPage,
    updatePage,
    deletePage,
  };
}
