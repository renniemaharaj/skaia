import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

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
