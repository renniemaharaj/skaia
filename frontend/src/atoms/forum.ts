import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { registerResource } from "../utils/wsRegistry";
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
  is_shared: boolean;
  original_thread_id?: string;
  original_thread?: ForumThread;
  can_lock?: boolean;
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_roles?: string[];
  user_avatar?: string;
  user_background_video_url?: string;
  user_background_image_url?: string;
  user_background_position?: string;
  last_edited_by?: number;
  last_edited_by_avatar?: string;
  last_edited_by_name?: string;
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
  description: string;
  display_order: number;
  is_locked: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  thread_count?: number;
  threads?: ForumThread[];
}

// Forum state with localStorage persistence
export const forumCategoriesAtom = atomWithStorage<ForumCategory[]>("forum.categories", []);
export const forumThreadsAtom = atomWithStorage<ForumThread[]>("forum.threads", []);
export const selectedThreadIdAtom = atom<string | null>(null);

export const draftNewThreadAtom = atomWithStorage<{
  title: string;
  content: string;
  categoryId: string;
} | null>("forum.draft.new", null);
export const draftEditThreadAtom = atomWithStorage<{
  title: string;
  content: string;
  categoryId: string;
  threadId: string;
} | null>("forum.draft.edit", null);

// Current thread being viewed
export const currentThreadAtom = atom<ForumThread | null>(null);

// Comments for current thread - NOT persisted to localStorage because they're thread-specific
export const threadCommentsAtom = atom<ThreadComment[]>([]);

// Live thread feeds
// These are updated in real-time by the WebSocket handler.
// The "active" atoms tell the WS handler which feed is currently visible
// so it can route broadcast thread_created / thread_deleted events correctly.

export const categoryFeedThreadsAtom = atom<ForumThread[]>([]);
export const activeCategoryFeedIdAtom = atom<string | null>(null);

export const userFeedThreadsAtom = atom<ForumThread[]>([]);
export const activeUserFeedIdAtom = atom<string | null>(null);

export const allFeedThreadsAtom = atom<ForumThread[]>([]);
export const activeAllFeedIdAtom = atom<string | null>(null);

// Derived thread permissions
// Reactively recomputes permissions from the live user atom so any
// permission/role change propagated over WS is instantly reflected.
export const threadPermissionsAtom = atom(get => {
  const user = get(currentUserAtom);
  const thread = get(currentThreadAtom);
  const sandbox = get(guestSandboxAtom);
  if (!user || !thread) {
    return {
      canEdit: sandbox,
      canDelete: sandbox,
      canLock: sandbox,
      canLikeComments: sandbox,
      canDeleteThreadComment: sandbox,
      canLikeThreads: sandbox,
    };
  }
  const isAdmin = (user.roles ?? []).includes("admin");
  const perms = user.permissions ?? [];
  const isOwner = String(user.id) === String(thread.user_id);

  return {
    canEdit: isOwner || isAdmin || perms.includes("forum.thread-edit") || sandbox,
    canDelete: isOwner || isAdmin || perms.includes("forum.thread-delete") || sandbox,
    canLock: isOwner || isAdmin || perms.includes("forum.thread-edit") || sandbox,
    canLikeComments: true,
    canDeleteThreadComment: isAdmin || perms.includes("forum.thread-comment-delete") || sandbox,
    canLikeThreads: true,
  };
});

// Derived per-comment permissions - enriches each comment with live user perms.
export const enrichedThreadCommentsAtom = atom(get => {
  const user = get(currentUserAtom);
  const comments = get(threadCommentsAtom);
  const sandbox = get(guestSandboxAtom);
  if (!user) {
    return comments.map(c => ({
      ...c,
      can_edit: sandbox,
      can_delete: sandbox,
      can_like_comments: sandbox,
    }));
  }
  const isAdmin = (user.roles ?? []).includes("admin");
  const perms = user.permissions ?? [];
  return comments.map(c => {
    const isOwner = String(user.id) === String(c.user_id);
    return {
      ...c,
      can_edit: isOwner || isAdmin || perms.includes("forum.thread-comment-delete") || sandbox,
      can_delete: isOwner || isAdmin || perms.includes("forum.thread-comment-delete") || sandbox,
      can_like_comments: true,
    };
  });
});

type IdPayload = { id?: string | number };

const payloadId = (data: unknown) => {
  if (data && typeof data === "object" && "id" in data) {
    return (data as IdPayload).id;
  }
  return data;
};

const updateThread = (thread: ForumThread, data: Partial<ForumThread>) => ({
  ...thread,
  title: data.title || thread.title,
  content: data.content || thread.content,
  updated_at: data.updated_at || thread.updated_at,
  view_count: data.view_count ?? thread.view_count,
  reply_count: data.reply_count ?? thread.reply_count,
});

registerResource("forum:update:thread_created", currentThreadAtom, (prev, data: ForumThread) =>
  prev && String(prev.id) === String(data.id) ? updateThread(prev, data) : prev
);
registerResource(
  "forum:update:thread_updated",
  currentThreadAtom,
  (prev, data: Partial<ForumThread>) =>
    prev && String(prev.id) === String(data.id) ? updateThread(prev, data) : prev
);
registerResource("forum:update:thread_deleted", currentThreadAtom, (prev, data: unknown) =>
  prev && String(prev.id) === String(payloadId(data)) ? null : prev
);
registerResource("forum:update:thread_liked", currentThreadAtom, (prev, data: any, store) => {
  if (!prev || String(prev.id) !== String(data.thread_id)) return prev;
  const actingUserId = String(data.user_id);
  const currentUser = store.get(currentUserAtom);
  return {
    ...prev,
    likes: data.likes ?? (prev.likes || 0) + 1,
    is_liked: actingUserId === String(currentUser?.id) ? true : prev.is_liked,
  };
});
registerResource("forum:update:thread_unliked", currentThreadAtom, (prev, data: any, store) => {
  if (!prev || String(prev.id) !== String(data.thread_id)) return prev;
  const actingUserId = String(data.user_id);
  const currentUser = store.get(currentUserAtom);
  return {
    ...prev,
    likes: Math.max(0, data.likes ?? (prev.likes || 1) - 1),
    is_liked: actingUserId === String(currentUser?.id) ? false : prev.is_liked,
  };
});

registerResource("forum:update:comment_created", threadCommentsAtom, (prev, data: any, store) => {
  const newComment = data?.new_comment;
  if (!newComment || prev.some(p => String(p.id) === String(newComment.id))) return prev;

  const user = store.get(currentUserAtom);
  const userId = user?.id;
  const perms = user?.permissions;
  const isOwner = userId != null && String(newComment.user_id) === String(userId);
  return [
    ...prev,
    {
      ...newComment,
      can_delete: isOwner || (perms?.includes("forum.thread-comment-delete") ?? false),
      can_edit: isOwner || (perms?.includes("forum.thread-comment-delete") ?? false),
      can_like_comments: true,
    },
  ];
});
registerResource("forum:update:comment_deleted", threadCommentsAtom, (prev, data: any) =>
  prev.filter(p => String(p.id) !== String(data.comment_id))
);
registerResource("forum:update:comment_updated", threadCommentsAtom, (prev, data: any) =>
  prev.map(p =>
    String(p.id) === String(data.comment_id)
      ? {
          ...p,
          content: data.content || p.content,
          updated_at: data.updated_at || p.updated_at,
        }
      : p
  )
);
registerResource("forum:update:comment_liked", threadCommentsAtom, (prev, data: any, store) => {
  const actingUserId = String(data.user_id);
  const currentUser = store.get(currentUserAtom);
  return prev.map(p =>
    String(p.id) === String(data.comment_id)
      ? {
          ...p,
          likes: data.likes ?? p.likes + 1,
          is_liked: actingUserId === String(currentUser?.id) ? true : p.is_liked,
        }
      : p
  );
});
registerResource("forum:update:comment_unliked", threadCommentsAtom, (prev, data: any, store) => {
  const actingUserId = String(data.user_id);
  const currentUser = store.get(currentUserAtom);
  return prev.map(p =>
    String(p.id) === String(data.comment_id)
      ? {
          ...p,
          likes: Math.max(0, data.likes ?? p.likes - 1),
          is_liked: actingUserId === String(currentUser?.id) ? false : p.is_liked,
        }
      : p
  );
});

const addToFeed = (prev: ForumThread[], thread: ForumThread) =>
  prev.some(t => String(t.id) === String(thread.id)) ? prev : [...prev, thread];
const updateInFeed = (prev: ForumThread[], data: Partial<ForumThread>) =>
  prev.map(t => (String(t.id) === String(data.id) ? { ...t, ...data } : t));
const removeFromFeed = (prev: ForumThread[], id: unknown) =>
  prev.filter(t => String(t.id) !== String(id));

registerResource(
  "forum:update:thread_created",
  categoryFeedThreadsAtom,
  (prev, data: ForumThread, store) => {
    const activeCategoryFeedId = store.get(activeCategoryFeedIdAtom);
    return activeCategoryFeedId && String(data.category_id) === activeCategoryFeedId
      ? addToFeed(prev, data)
      : prev;
  }
);
registerResource(
  "forum:update:thread_created",
  userFeedThreadsAtom,
  (prev, data: ForumThread, store) => {
    const activeUserFeedId = store.get(activeUserFeedIdAtom);
    return activeUserFeedId && String(data.user_id) === activeUserFeedId
      ? addToFeed(prev, data)
      : prev;
  }
);
registerResource(
  "forum:update:thread_created",
  allFeedThreadsAtom,
  (prev, data: ForumThread, store) =>
    store.get(activeAllFeedIdAtom) ? addToFeed(prev, data) : prev
);
registerResource("forum:update:thread_updated", categoryFeedThreadsAtom, updateInFeed);
registerResource("forum:update:thread_updated", userFeedThreadsAtom, updateInFeed);
registerResource("forum:update:thread_updated", allFeedThreadsAtom, updateInFeed);
registerResource("forum:update:thread_deleted", categoryFeedThreadsAtom, (prev, data: unknown) =>
  removeFromFeed(prev, payloadId(data))
);
registerResource("forum:update:thread_deleted", userFeedThreadsAtom, (prev, data: unknown) =>
  removeFromFeed(prev, payloadId(data))
);
registerResource("forum:update:thread_deleted", allFeedThreadsAtom, (prev, data: unknown) =>
  removeFromFeed(prev, payloadId(data))
);

registerResource("forum:update:category_created", forumCategoriesAtom, (prev, data: any) => {
  if (!data?.id || prev.some(c => String(c.id) === String(data.id))) return prev;
  const newCategory: ForumCategory = {
    id: data.id,
    name: data.name,
    description: data.description,
    is_locked: data.is_locked || false,
    is_pinned: data.is_pinned || false,
    display_order: data.display_order || 0,
    thread_count: data.thread_count || 0,
    created_at: data.created_at,
    updated_at: data.updated_at,
    threads: [],
  };
  return [...prev, newCategory];
});
registerResource("forum:update:category_deleted", forumCategoriesAtom, (prev, data: unknown) =>
  prev.filter(c => String(c.id) !== String(payloadId(data)))
);
registerResource(
  "forum:update:category_updated",
  forumCategoriesAtom,
  (prev, data: Partial<ForumCategory>) =>
    prev.map(c =>
      String(c.id) === String(data.id)
        ? {
            ...c,
            name: data.name || c.name,
            description: data.description || c.description,
            is_locked: data.is_locked ?? c.is_locked,
            thread_count: data.thread_count ?? c.thread_count,
            updated_at: data.updated_at || c.updated_at,
            threads: c.threads,
          }
        : c
    )
);
registerResource("forum:update:category_threads_updated", forumCategoriesAtom, (prev, data: any) =>
  prev.map(c =>
    String(c.id) === String(data.id)
      ? {
          ...c,
          threads: data.threads ?? c.threads,
          updated_at: new Date().toISOString(),
        }
      : c
  )
);
registerResource("forum:update:thread_created", forumCategoriesAtom, (prev, data: ForumThread) => {
  if (!data?.category_id) return prev;
  const catId = String(data.category_id);
  return prev.map(c => {
    if (String(c.id) !== catId) return c;
    const alreadyExists = (c.threads || []).some(t => String(t.id) === String(data.id));
    if (alreadyExists) return c;
    return {
      ...c,
      threads: [data, ...(c.threads || [])].slice(0, 2),
      thread_count: (c.thread_count || 0) + 1,
    };
  });
});
registerResource("forum:update:thread_deleted", forumCategoriesAtom, (prev, data: unknown) =>
  prev.map(c => {
    const filtered = (c.threads || []).filter(t => String(t.id) !== String(payloadId(data)));
    if (filtered.length === (c.threads || []).length) return c;
    return {
      ...c,
      threads: filtered,
      thread_count: Math.max(0, (c.thread_count || 0) - 1),
    };
  })
);
