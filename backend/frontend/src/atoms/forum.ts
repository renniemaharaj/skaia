import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { currentUserAtom } from "./auth";
import { guestSandboxAtom } from "./guestSandbox";

export interface ThreadComment {
  id: string;
  thread_id: string;
  user_id: string;
  author_id: string;
  author_name: string;
  author_roles?: string[];
  author_avatar?: string;
  content: string;
  likes: number;
  is_liked: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_like_comments: boolean;
  created_at: string;
  updated_at: string;
  is_edited?: boolean;
}

export interface ForumThread {
  id: string;
  category_id: string;
  user_id: string;
  title: string;
  content: string;
  view_count: number;
  reply_count: number;
  is_pinned: boolean;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_roles?: string[];
  user_avatar?: string;
  likes?: number;
  is_liked?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
  can_like_comments?: boolean;
  can_delete_thread_comment?: boolean;
  can_like_threads?: boolean;
}

export interface ForumCategory {
  id: string;
  name: string;
  description?: string;
  thread_count: number;
  created_at: string;
  updated_at: string;
  threads?: ForumThread[];
}

// Forum state with localStorage persistence
export const forumCategoriesAtom = atomWithStorage<ForumCategory[]>(
  "forum.categories",
  [],
);
export const forumThreadsAtom = atomWithStorage<ForumThread[]>(
  "forum.threads",
  [],
);
export const selectedThreadIdAtom = atom<string | null>(null);

// Current thread being viewed
export const currentThreadAtom = atom<ForumThread | null>(null);

// Comments for current thread - NOT persisted to localStorage because they're thread-specific
export const threadCommentsAtom = atom<ThreadComment[]>([]);

// ── Live thread feeds ────────────────────────────────────────────────────────
// These are updated in real-time by the WebSocket handler.
// The "active" atoms tell the WS handler which feed is currently visible
// so it can route broadcast thread_created / thread_deleted events correctly.

export const categoryFeedThreadsAtom = atom<ForumThread[]>([]);
export const activeCategoryFeedIdAtom = atom<string | null>(null);

export const userFeedThreadsAtom = atom<ForumThread[]>([]);
export const activeUserFeedIdAtom = atom<string | null>(null);

// ── Derived thread permissions ──────────────────────────────────────────────
// Reactively recomputes permissions from the live user atom so any
// permission/role change propagated over WS is instantly reflected.
export const threadPermissionsAtom = atom((get) => {
  const user = get(currentUserAtom);
  const thread = get(currentThreadAtom);
  const sandbox = get(guestSandboxAtom);
  if (!user || !thread) {
    return {
      canEdit: sandbox,
      canDelete: sandbox,
      canLikeComments: sandbox,
      canDeleteThreadComment: sandbox,
      canLikeThreads: sandbox,
    };
  }
  const isAdmin = (user.roles ?? []).includes("admin");
  const perms = user.permissions ?? [];
  const isOwner = String(user.id) === String(thread.user_id);

  return {
    canEdit:
      isOwner || isAdmin || perms.includes("forum.thread-edit") || sandbox,
    canDelete:
      isOwner || isAdmin || perms.includes("forum.thread-delete") || sandbox,
    canLikeComments: true,
    canDeleteThreadComment:
      isAdmin || perms.includes("forum.thread-comment-delete") || sandbox,
    canLikeThreads: true,
  };
});

// Derived per-comment permissions — enriches each comment with live user perms.
export const enrichedThreadCommentsAtom = atom((get) => {
  const user = get(currentUserAtom);
  const comments = get(threadCommentsAtom);
  const sandbox = get(guestSandboxAtom);
  if (!user) {
    return comments.map((c) => ({
      ...c,
      can_edit: sandbox,
      can_delete: sandbox,
      can_like_comments: sandbox,
    }));
  }
  const isAdmin = (user.roles ?? []).includes("admin");
  const perms = user.permissions ?? [];
  return comments.map((c) => {
    const isOwner = String(user.id) === String(c.user_id);
    return {
      ...c,
      can_edit:
        isOwner ||
        isAdmin ||
        perms.includes("forum.thread-comment-delete") ||
        sandbox,
      can_delete:
        isOwner ||
        isAdmin ||
        perms.includes("forum.thread-comment-delete") ||
        sandbox,
      can_like_comments: true,
    };
  });
});
