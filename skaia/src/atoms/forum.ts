import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export interface ForumPost {
  id: string;
  thread_id: string;
  author_id: string;
  author_name: string;
  content: string;
  likes: number;
  is_liked: boolean;
  can_edit: boolean;
  can_delete: boolean;
  created_at: string;
  updated_at: string;
  is_edited: boolean;
}

export interface ForumThread {
  id: string;
  title: string;
  description?: string;
  category_id: string;
  created_by: string;
  view_count: number;
  post_count: number;
  is_pinned: boolean;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface ForumCategory {
  id: string;
  name: string;
  description?: string;
  thread_count: number;
  created_at: string;
  updated_at: string;
}

// Forum state with localStorage persistence
export const forumCategoriesAtom = atomWithStorage<ForumCategory[]>('forum.categories', []);
export const forumThreadsAtom = atomWithStorage<ForumThread[]>('forum.threads', []);
export const forumPostsAtom = atomWithStorage<ForumPost[]>('forum.posts', []);
export const selectedThreadIdAtom = atom<string | null>(null);

// Derived atoms for UI helpers
export const selectedThreadPostsAtom = atom((get) => {
  const threadId = get(selectedThreadIdAtom);
  const posts = get(forumPostsAtom);
  if (!threadId) return [];
  return posts.filter((p) => p.thread_id === threadId).sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
});

export const canUserEditPostAtom = atom(
  (get) => (postId: string) => {
    const posts = get(forumPostsAtom);
    const post = posts.find((p) => p.id === postId);
    return post?.can_edit || false;
  }
);

export const canUserDeletePostAtom = atom(
  (get) => (postId: string) => {
    const posts = get(forumPostsAtom);
    const post = posts.find((p) => p.id === postId);
    return post?.can_delete || false;
  }
);

export const isPostLikedByUserAtom = atom(
  (get) => (postId: string) => {
    const posts = get(forumPostsAtom);
    const post = posts.find((p) => p.id === postId);
    return post?.is_liked || false;
  }
);

