import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  Eye,
  ThumbsUp,
  ChevronDown,
  MoreHorizontal,
  ShieldAlert,
} from "lucide-react";
import { useAtomValue } from "jotai";
import { PageBuilderContext, type SaveStatus } from "./PageBuilderContext";
import { SaveStatusBar } from "./SaveStatusBar";
import type { LandingSection, LandingItem, SectionEditor } from "./types";
import { usePageData } from "../../hooks/usePageData";
import { useGuestSandboxMode } from "../../hooks/useGuestSandboxMode";
import type { PageBuilderPage } from "../../hooks/usePageData";
import { isAuthenticatedAtom, currentUserAtom } from "../../atoms/auth";
import { LandingSkeleton } from "./LandingSkeleton";
import { BlockRenderer } from "./BlockRenderer";
import PageOwnershipPanel from "../../components/page/PageOwnershipPanel";
import PageComments from "../../components/page/PageComments";
import { apiRequest } from "../../utils/api";
import { toast } from "sonner";
import "./PageBuilder.css";
import "../../components/ui/FeatureCard.css";

const sortSections = (secs: LandingSection[]) =>
  [...secs].sort((a, b) => a.display_order - b.display_order);

/**
 * JSON.stringify with sorted keys so that key-order differences introduced by
 * PostgreSQL JSONB normalisation don't cause false negatives.
 */
function stableStringify(obj: unknown): string {
  return JSON.stringify(obj, (_, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (value as Record<string, unknown>)[key];
          return acc;
        }, {});
    }
    return value;
  });
}

/**
 * Preserve object references for sections whose content hasn't changed.
 * React skips re-rendering memoised children when their props keep the same
 * reference, so returning the *old* object for unchanged sections means only
 * the actually-modified section triggers a re-render.
 */
function mergeSections(
  current: LandingSection[],
  incoming: LandingSection[],
): LandingSection[] {
  if (current.length === 0) return incoming;
  const currentMap = new Map(current.map((s) => [s.id, s]));
  let changed = current.length !== incoming.length;
  const merged = incoming.map((inc) => {
    const existing = currentMap.get(inc.id);
    if (
      existing &&
      stableStringify({ ...existing, items: existing.items ?? [] }) ===
        stableStringify({ ...inc, items: inc.items ?? [] })
    ) {
      return existing; // same data → keep old reference
    }
    changed = true;
    return inc;
  });
  return changed ? merged : current;
}

interface PageBuilderProps {
  /** Optional slug to load. Falls back to the URL :slug param, then index. */
  slug?: string;
}

export default function PageBuilder(props: PageBuilderProps = {}) {
  const params = useParams<{ slug?: string }>();
  const slug = props.slug ?? params.slug;
  const navigate = useNavigate();
  const [editingCount, setEditingCount] = useState(0);

  const {
    page,
    loading,
    error,
    errorStatus,
    retryAfter,
    refresh,
    isEditable,
    isAdmin,
    isOwner,
    updatePage,
    createPage,
    deletePage,
    pendingIncoming,
  } = usePageData(editingCount > 0);

  const [guestSandboxEnabled, setGuestSandboxEnabled] = useGuestSandboxMode();
  const [sections, setSections] = useState<LandingSection[]>([]);
  const [sectionsSourced, setSectionsSourced] = useState(false);
  const [showOwnership, setShowOwnership] = useState(false);
  const guestSandboxMode = isEditable || guestSandboxEnabled;
  const canEdit = guestSandboxMode;
  const canDelete =
    !!page?.can_delete || (page?.id != null && (isAdmin || isOwner));
  const canChangeVisibility = page?.id != null && (isAdmin || isOwner);
  // Toolbar visible to admins and owners only — editors can edit inline but don't see the bar
  const showToolbar = isAdmin || isOwner || (!slug && !isEditable);
  const showOwnershipBtn = showToolbar && page?.id && slug;
  const canShowSandboxToggle = !isEditable;
  const sandboxToggleIsStandalone =
    canShowSandboxToggle && !showOwnershipBtn && !(isAdmin && !slug);

  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const currentUser = useAtomValue(currentUserAtom);

  /** Build a SectionEditor stamp from the current user. */
  const currentEditorStamp = currentUser
    ? (): SectionEditor => ({
        user_id: currentUser.id,
        username: currentUser.username,
        display_name: currentUser.display_name,
        avatar_url: currentUser.avatar_url || undefined,
        edited_at: new Date().toISOString(),
      })
    : undefined;

  // Landing page selector state
  const [allPages, setAllPages] = useState<PageBuilderPage[]>([]);
  const [landingDropdownOpen, setLandingDropdownOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const [pageIsLiked, setPageIsLiked] = useState(false);
  const [pageLikes, setPageLikes] = useState(0);
  const [armInProgress, setArmInProgress] = useState(false);
  const RATE_LIMIT_KEY = "pb_rate_limit_until";

  const [holdingSeconds, setHoldingSeconds] = useState<number | undefined>(
    () => {
      try {
        const stored = sessionStorage.getItem(RATE_LIMIT_KEY);
        if (stored) {
          const until = parseInt(stored, 10);
          const remaining = Math.ceil((until - Date.now()) / 1000);
          if (remaining > 0) return remaining;
          sessionStorage.removeItem(RATE_LIMIT_KEY);
        }
      } catch {
        // sessionStorage unavailable
      }
      return undefined;
    },
  );

  useEffect(() => {
    if (!moreOpen) return;
    const onDocumentClick = (event: globalThis.MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    window.addEventListener("mousedown", onDocumentClick);
    return () => window.removeEventListener("mousedown", onDocumentClick);
  }, [moreOpen]);

  const currentUserPowerLevel =
    typeof (currentUser as any)?.power_level === "number"
      ? (currentUser as any).power_level
      : undefined;
  const canArmSite =
    !slug &&
    isAdmin &&
    (currentUserPowerLevel === undefined ? true : currentUserPowerLevel > 50);

  const handleArmSite = useCallback(async () => {
    setArmInProgress(true);
    try {
      await apiRequest("/api/site/arm", { method: "POST" });
      toast.success("Site armed — maintenance mode enabled.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to arm the site";
      toast.error(message);
    } finally {
      setArmInProgress(false);
    }
  }, []);

  useEffect(() => {
    if (errorStatus === 429) {
      if (retryAfter !== undefined) {
        setHoldingSeconds((current) => {
          const next =
            current === undefined ? retryAfter : Math.max(current, retryAfter);
          try {
            const until = Date.now() + next * 1000;
            sessionStorage.setItem(RATE_LIMIT_KEY, String(until));
          } catch {
            /* ignore */
          }
          return next;
        });
      }
      return;
    }

    // errorStatus is NOT 429 (e.g. undefined during reload, or a success).
    // Only clear holdingSeconds if the sessionStorage penalty has also expired.
    // This prevents a reload from wiping the timer before the API responds.
    try {
      const stored = sessionStorage.getItem(RATE_LIMIT_KEY);
      if (stored) {
        const until = parseInt(stored, 10);
        const remaining = Math.ceil((until - Date.now()) / 1000);
        if (remaining > 0) {
          // Penalty still active — keep the holding screen.
          return;
        }
      }
    } catch {
      /* ignore */
    }

    setHoldingSeconds(undefined);
    try {
      sessionStorage.removeItem(RATE_LIMIT_KEY);
    } catch {
      /* ignore */
    }
  }, [errorStatus, retryAfter]);

  useEffect(() => {
    if (holdingSeconds === undefined) return;

    const interval = setInterval(() => {
      setHoldingSeconds((seconds) => {
        if (seconds === undefined || seconds <= 1) {
          clearInterval(interval);
          try {
            sessionStorage.removeItem(RATE_LIMIT_KEY);
          } catch {
            /* ignore */
          }
          return undefined;
        }
        return seconds - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [holdingSeconds]);

  const displayHoldSeconds = holdingSeconds ?? retryAfter;

  const landingPageLabel = page
    ? page.is_index
      ? "Default (index)"
      : page.title || page.slug
    : "Landing Page";

  // Sync engagement state from page
  useEffect(() => {
    if (page) {
      setPageIsLiked(page.is_liked ?? false);
      setPageLikes(page.likes ?? 0);
    }
  }, [page]);

  // Record page view
  useEffect(() => {
    if (page?.slug) {
      apiRequest(`/config/pages/${page.slug}/view`, { method: "POST" }).catch(
        () => {},
      );
    }
  }, [page?.slug]);

  // Load all pages for landing selector
  useEffect(() => {
    if (isAdmin && showToolbar) {
      apiRequest<PageBuilderPage[]>("/config/pages/list")
        .then((data) => setAllPages(data ?? []))
        .catch(() => {});
    }
  }, [isAdmin, showToolbar]);

  const handleSetLandingPage = async (selectedSlug: string) => {
    try {
      await apiRequest("/config/pages/landing-page", {
        method: "PUT",
        body: JSON.stringify({ slug: selectedSlug }),
      });
      toast.success(
        selectedSlug
          ? `Landing page set to "${selectedSlug}"`
          : "Landing page reset to default",
      );
      setLandingDropdownOpen(false);
      // Reload the index route so the new landing page is shown immediately.
      if (!slug) {
        await refresh();
      }
    } catch {
      toast.error("Failed to set landing page");
    }
  };

  const handleLikePage = async () => {
    if (!page?.id || !isAuthenticated) return;
    const wasLiked = pageIsLiked;
    setPageIsLiked(!wasLiked);
    setPageLikes((prev) => prev + (wasLiked ? -1 : 1));
    try {
      await apiRequest(`/config/pages/${page.id}/like`, {
        method: wasLiked ? "DELETE" : "POST",
      });
    } catch {
      setPageIsLiked(wasLiked);
      setPageLikes((prev) => prev + (wasLiked ? 1 : -1));
    }
  };

  const handleDeletePage = useCallback(async () => {
    if (!page?.id) return;
    if (!window.confirm("Delete this page? This cannot be undone.")) return;
    try {
      await deletePage(page.id);
      toast.success("Page deleted");
      navigate("/pages");
    } catch {
      toast.error("Failed to delete page");
    }
  }, [deletePage, navigate, page?.id]);

  // Track whether the page needs to be created (404 + editable or sandbox enabled).
  const isNewPage = !!(slug && error && guestSandboxMode);
  const pageRef = useRef<PageBuilderPage | null>(page);
  pageRef.current = page;

  /**
   * Ensure the page entity exists in the backend, creating it on the fly if
   * we're on a 404 slug the user has permission to build.
   */
  const ensurePage = useCallback(
    async (content: LandingSection[]): Promise<PageBuilderPage | null> => {
      if (pageRef.current) return pageRef.current;
      const created = await createPage({
        slug: slug || "landing",
        title: slug || "Landing",
        description: "",
        is_index: !slug,
        content: JSON.stringify(content),
        view_count: 0,
        likes: 0,
        is_liked: false,
        comment_count: 0,
      });
      await refresh(slug);
      return created;
    },
    [slug, createPage, refresh],
  );

  useEffect(() => {
    // Clear sections when the slug changes so we don't briefly render the
    // previous page's content while the new page is loading.
    setSections([]);
    setSectionsSourced(false);
  }, [slug]);

  useEffect(() => {
    // Don't overwrite sections while there are unsaved pending changes —
    // a live websocket event from another user would otherwise clobber
    // the editor's in-progress work.
    if (pendingSectionsRef.current !== null) return;
    // Likewise, don't update while the user has an editor open even if they
    // haven't made changes yet — the incoming content would reset the editor.
    if (editingCountRef.current > 0) return;

    if (!page && error) {
      // Page not found (404) — show empty sections.
      setSections([]);
      setSectionsSourced(true);
      return;
    }

    if (page?.content) {
      try {
        const parsed = JSON.parse(page.content);
        if (Array.isArray(parsed)) {
          setSections((prev) => mergeSections(prev, sortSections(parsed)));
          setSectionsSourced(true);
          return;
        }
      } catch {
        // invalid JSON
      }
    }

    // No content yet (page exists but empty, or still loading).
    if (!loading) {
      setSections([]);
      setSectionsSourced(true);
    }
  }, [page, page?.content, error, loading]);

  useEffect(() => {
    refresh(slug);
  }, [refresh, slug]);

  useEffect(() => {
    const handler = (e: Event) => {
      const action =
        (e as CustomEvent<{ action?: string }>).detail?.action ?? "";
      // Suppress live page reloads while the user is actively editing — they
      // would reset the editor and discard in-progress work.
      if (
        action === "landing_page_updated" &&
        !slug &&
        editingCountRef.current === 0
      ) {
        refresh();
      }
    };
    window.addEventListener("config:live:event", handler);
    return () => window.removeEventListener("config:live:event", handler);
  }, [refresh, slug]);

  // Stable refs so useCallback wrappers never go stale.
  const sectionsRef = useRef<LandingSection[]>(sections);
  sectionsRef.current = sections;

  // ── Adaptive BBR save pipeline ─────────────────────────────────────────
  // Changes are batched with an adaptive delay (800 ms base, grows by 200 ms
  // per rapid successive change up to 3500 ms).  When any component signals
  // edit mode (rich text, code editor, color picker) the timer is held and
  // restarted 800 ms after the last editor is released.

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const editingCountRef = useRef(0);
  const pendingSectionsRef = useRef<LandingSection[] | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeCountRef = useRef(0);
  const lastChangeTimeRef = useRef(0);

  const savePageContent = useCallback(
    async (updatedSections: LandingSection[]) => {
      if (!pageRef.current || pageRef.current.id == null) {
        await ensurePage(updatedSections);
        return;
      }
      const saved = await updatePage({
        ...pageRef.current,
        content: JSON.stringify(updatedSections),
      });
      if (saved) pageRef.current = saved;
    },
    [ensurePage, updatePage],
  );

  // Stable ref so timer callbacks always call the latest version.
  const savePageContentRef = useRef(savePageContent);
  useEffect(() => {
    savePageContentRef.current = savePageContent;
  }, [savePageContent]);

  const runSave = useCallback(async () => {
    const sections = pendingSectionsRef.current;
    if (!sections) return;
    pendingSectionsRef.current = null;
    setSaveStatus("saving");
    try {
      await savePageContentRef.current(sections);
      setSaveStatus("saved");
      setTimeout(
        () => setSaveStatus((s) => (s === "saved" ? "idle" : s)),
        2000,
      );
    } catch {
      setSaveStatus("error");
      setTimeout(
        () => setSaveStatus((s) => (s === "error" ? "idle" : s)),
        3000,
      );
    }
  }, []);

  const enterEdit = useCallback(() => {
    editingCountRef.current++;
    setEditingCount((c) => c + 1);
    // Cancel any pending timer — hold saves until editing stops.
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const leaveEdit = useCallback(() => {
    editingCountRef.current = Math.max(0, editingCountRef.current - 1);
    setEditingCount((c) => Math.max(0, c - 1));
    // Once the last editor is released, flush pending save after brief pause.
    if (editingCountRef.current === 0 && pendingSectionsRef.current) {
      saveTimerRef.current = setTimeout(() => void runSave(), 800);
    }
  }, [runSave]);

  /** Schedule a debounced save with adaptive backoff for rapid-fire changes. */
  const scheduleSave = useCallback(
    (sections: LandingSection[]) => {
      pendingSectionsRef.current = sections;
      setSaveStatus("pending");
      if (editingCountRef.current > 0) return; // hold while editing

      const now = Date.now();
      const rapid = now - lastChangeTimeRef.current < 1200;
      lastChangeTimeRef.current = now;
      changeCountRef.current = rapid
        ? Math.min(changeCountRef.current + 1, 10)
        : 0;
      const delay = Math.min(800 + changeCountRef.current * 200, 3500);

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        changeCountRef.current = 0;
        void runSave();
      }, delay);
    },
    [runSave],
  );

  /** Immediate save for discrete structural actions (create / delete / move). */
  const immediateSave = useCallback(async (sections: LandingSection[]) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    pendingSectionsRef.current = null;
    setSaveStatus("saving");
    try {
      await savePageContentRef.current(sections);
      setSaveStatus("saved");
      setTimeout(
        () => setSaveStatus((s) => (s === "saved" ? "idle" : s)),
        2000,
      );
    } catch {
      setSaveStatus("error");
      setTimeout(
        () => setSaveStatus((s) => (s === "error" ? "idle" : s)),
        3000,
      );
    }
  }, []);

  // Flush any pending save when the component unmounts.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (pendingSectionsRef.current) {
        void savePageContentRef.current(pendingSectionsRef.current);
      }
    };
  }, []);

  const editorStampRef = useRef(currentEditorStamp);
  editorStampRef.current = currentEditorStamp;

  const updateSectionWrapper = useCallback(
    (s: LandingSection) => {
      const stamp = editorStampRef.current?.();
      const stamped = stamp ? { ...s, last_edited_by: stamp } : s;
      const updated = sectionsRef.current.map((sec) =>
        sec.id === stamped.id ? stamped : sec,
      );
      const ordered = sortSections(updated);
      setSections(ordered);
      scheduleSave(ordered);
    },
    [scheduleSave],
  );

  const createSectionWrapper = useCallback(
    (s: Omit<LandingSection, "id">) => {
      const sorted = sortSections(sectionsRef.current);
      const newSection: LandingSection = { ...s, id: Date.now() };

      const insertionIndex = Math.max(
        0,
        Math.min(
          sorted.length,
          typeof s.display_order === "number"
            ? s.display_order - 1
            : sorted.length,
        ),
      );

      const updated = [...sorted];
      updated.splice(insertionIndex, 0, newSection);

      const normalized = updated.map((section, idx) => ({
        ...section,
        display_order: idx + 1,
      }));

      setSections(normalized);
      void immediateSave(normalized);
    },
    [immediateSave],
  );

  const deleteSectionWrapper = useCallback(
    (id: number) => {
      const updated = sectionsRef.current.filter(
        (section) => section.id !== id,
      );
      const ordered = sortSections(updated);
      setSections(ordered);
      void immediateSave(ordered);
    },
    [immediateSave],
  );

  const createItemWrapper = useCallback(
    (sectionId: number, item: Omit<LandingItem, "id">) => {
      const updated = sectionsRef.current.map((section) => {
        if (section.id !== sectionId) {
          return section;
        }
        const items = section.items ?? [];
        return {
          ...section,
          items: [...items, { ...item, id: Date.now() }],
        };
      });
      const ordered = sortSections(updated);
      setSections(ordered);
      void immediateSave(ordered);
    },
    [immediateSave],
  );

  const updateItemWrapper = useCallback(
    (item: LandingItem) => {
      const stamp = editorStampRef.current?.();
      const updated = sectionsRef.current.map((section) => {
        if (!section.items) return section;
        const hasItem = section.items.some((it) => it.id === item.id);
        if (!hasItem) return section;
        return {
          ...section,
          ...(stamp ? { last_edited_by: stamp } : {}),
          items: section.items.map((it) => (it.id === item.id ? item : it)),
        };
      });
      const ordered = sortSections(updated);
      setSections(ordered);
      scheduleSave(ordered);
    },
    [scheduleSave],
  );

  const deleteItemWrapper = useCallback(
    (id: number) => {
      const updated = sectionsRef.current.map((section) => {
        if (!section.items) return section;
        return {
          ...section,
          items: section.items.filter((item) => item.id !== id),
        };
      });
      const ordered = sortSections(updated);
      setSections(ordered);
      void immediateSave(ordered);
    },
    [immediateSave],
  );

  const moveSectionWrapper = useCallback(
    async (sourceSectionId: number, targetSectionId: number) => {
      const sorted = sortSections(sectionsRef.current);
      const sourceIdx = sorted.findIndex((sec) => sec.id === sourceSectionId);
      const targetIdx = sorted.findIndex((sec) => sec.id === targetSectionId);
      if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx)
        return;

      const next = [...sorted];
      const [moving] = next.splice(sourceIdx, 1);
      next.splice(targetIdx, 0, moving);

      const normalized = next.map((section, idx) => ({
        ...section,
        display_order: idx + 1,
      }));

      setSections(normalized);
      await immediateSave(normalized);
    },
    [immediateSave],
  );

  if (loading || !sectionsSourced) {
    return (
      <div className="pb-container">
        <LandingSkeleton />
      </div>
    );
  }

  if (errorStatus === 429) {
    return (
      <div className="pb-container">
        <div
          style={{
            textAlign: "center",
            padding: "4rem 1rem",
            maxWidth: 560,
            margin: "0 auto",
          }}
        >
          <ShieldAlert size={48} style={{ marginBottom: 20 }} />
          <h2>Rate limit exceeded</h2>
          <p style={{ opacity: 0.75, marginTop: 12 }}>
            The page builder is currently receiving too many requests. You must
            wait before trying again.
          </p>
          {displayHoldSeconds ? (
            <p style={{ opacity: 0.7, marginTop: 8 }}>
              Estimated wait time: {displayHoldSeconds} second
              {displayHoldSeconds === 1 ? "" : "s"}.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (error && !canEdit) {
    return (
      <div className="pb-container">
        <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
          <p style={{ color: "var(--color-danger, #e74c3c)" }}>
            {slug ? `Page not found: ${error}` : "No landing page configured."}
          </p>
        </div>
      </div>
    );
  }

  const contextValue = {
    editingCount,
    enterEdit,
    leaveEdit,
    saveStatus,
    pendingIncoming,
  };

  if (isNewPage) {
    return (
      <PageBuilderContext.Provider value={contextValue}>
        <div className="pb-container">
          <div style={{ textAlign: "center", padding: "3rem 1rem 1rem" }}>
            <p style={{ opacity: 0.6 }}>
              This page doesn&apos;t exist yet. Start building to create it.
            </p>
          </div>
          <BlockRenderer
            sections={[]}
            canEdit
            onUpdateSection={updateSectionWrapper}
            onDeleteSection={deleteSectionWrapper}
            onCreateSection={createSectionWrapper}
            onCreateItem={createItemWrapper}
            onUpdateItem={updateItemWrapper}
            onDeleteItem={deleteItemWrapper}
            onMoveSection={moveSectionWrapper}
          />
          <SaveStatusBar />
        </div>
      </PageBuilderContext.Provider>
    );
  }

  return (
    <PageBuilderContext.Provider value={contextValue}>
      <div className="pb-container">
        {showToolbar && (
          <div className="page-admin-bar page-admin-bar--menu">
            {canChangeVisibility && page && (
              <div className="page-admin-visibility">
                <select
                  id="page-visibility"
                  className="page-admin-select"
                  value={page.visibility || "public"}
                  onChange={async (e) => {
                    const nextVisibility = e.target.value;
                    try {
                      await updatePage({
                        ...page,
                        visibility: nextVisibility,
                      });
                      await refresh(slug);
                    } catch (err) {
                      console.error("Failed to update page visibility", err);
                    }
                  }}
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                </select>
              </div>
            )}

            {isAdmin && !slug && (
              <div className="page-admin-dropdown-wrap">
                <button
                  type="button"
                  className={`page-admin-btn${landingDropdownOpen ? " active" : ""}`}
                  onClick={() => setLandingDropdownOpen((v) => !v)}
                  title="Set landing page"
                >
                  {landingPageLabel}
                  <ChevronDown size={14} />
                </button>
                {landingDropdownOpen && (
                  <div className="page-admin-dropdown">
                    <button
                      className="page-admin-dropdown-item"
                      onClick={() => handleSetLandingPage("")}
                    >
                      Default (index)
                    </button>
                    {allPages.map((p) => (
                      <button
                        key={p.id}
                        className="page-admin-dropdown-item"
                        onClick={() => handleSetLandingPage(p.slug)}
                      >
                        {p.title || p.slug}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {canDelete && page?.id && (
              <button
                type="button"
                className="page-admin-btn page-admin-btn--danger"
                onClick={handleDeletePage}
                title="Delete this page"
              >
                Delete
              </button>
            )}

            {canArmSite && (
              <button
                type="button"
                className="page-admin-btn page-admin-btn--danger"
                onClick={handleArmSite}
                disabled={armInProgress}
                title="Arm the site"
              >
                {armInProgress ? "Arming…" : "Arm site"}
              </button>
            )}

            {sandboxToggleIsStandalone && (
              <button
                type="button"
                className="page-admin-btn"
                onClick={() => setGuestSandboxEnabled((current) => !current)}
              >
                {guestSandboxEnabled ? "Disable sandbox" : "Enable sandbox"}
              </button>
            )}

            {(showOwnershipBtn ||
              (isAdmin && !slug) ||
              (!sandboxToggleIsStandalone && canShowSandboxToggle)) && (
              <div className="page-admin-more-wrap" ref={moreRef}>
                <button
                  type="button"
                  className={`icon-btn icon-btn--sm page-admin-more-btn${moreOpen ? " active" : ""}`}
                  onClick={() => setMoreOpen((v) => !v)}
                  title="More actions"
                >
                  <MoreHorizontal size={18} />
                </button>
                {moreOpen && (
                  <div className="page-admin-more-dropdown">
                    {showOwnershipBtn && (
                      <button
                        type="button"
                        className="page-admin-more-item"
                        onClick={() => {
                          setShowOwnership((v) => !v);
                          setMoreOpen(false);
                        }}
                      >
                        Manage page ownership
                      </button>
                    )}
                    {isAdmin && !slug && (
                      <>
                        <Link
                          to="/admin/meta"
                          className="page-admin-more-item"
                          onClick={() => setMoreOpen(false)}
                        >
                          Site Meta
                        </Link>
                        <Link
                          to="/admin/roles"
                          className="page-admin-more-item"
                          onClick={() => setMoreOpen(false)}
                        >
                          Roles
                        </Link>
                      </>
                    )}
                    {!isEditable && !sandboxToggleIsStandalone && (
                      <button
                        type="button"
                        className="page-admin-more-item"
                        onClick={() => {
                          setGuestSandboxEnabled(
                            (current: boolean) => !(current as boolean),
                          );
                          setMoreOpen(false);
                        }}
                      >
                        {guestSandboxEnabled
                          ? "Disable sandbox"
                          : "Enable sandbox"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {showOwnership && showOwnershipBtn && (
          <div className="page-admin-bar page-admin-bar--panel">
            <PageOwnershipPanel
              pageId={page.id}
              owner={page.owner ?? null}
              editors={page.editors ?? []}
              onUpdate={() => refresh(slug)}
            />
          </div>
        )}

        {/* Engagement stats bar */}
        {page?.id && (
          <div className="page-engagement-bar">
            <span className="page-engagement-stat">
              <Eye size={14} /> {page.view_count ?? 0} views
            </span>
            <button
              className={`page-engagement-like${pageIsLiked ? " liked" : ""}`}
              onClick={handleLikePage}
              disabled={!isAuthenticated}
              title={isAuthenticated ? "Like this page" : "Sign in to like"}
            >
              <ThumbsUp size={14} />
              {pageLikes > 0 && <span>{pageLikes}</span>}
            </button>
            <span className="page-engagement-stat">
              {page.comment_count ?? 0} comments
            </span>
          </div>
        )}

        <BlockRenderer
          sections={sections}
          canEdit={canEdit}
          onUpdateSection={updateSectionWrapper}
          onDeleteSection={deleteSectionWrapper}
          onCreateSection={createSectionWrapper}
          onCreateItem={createItemWrapper}
          onUpdateItem={updateItemWrapper}
          onDeleteItem={deleteItemWrapper}
          onMoveSection={moveSectionWrapper}
        />

        {/* Comments section */}
        {page?.id && page?.slug && (
          <PageComments pageId={page.id} pageSlug={page.slug} />
        )}
        <SaveStatusBar />
      </div>
    </PageBuilderContext.Provider>
  );
}
