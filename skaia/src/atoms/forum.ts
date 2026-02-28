import { atom } from 'jotai';

export interface ForumThread {
  id: string;
  title: string;
  description?: string;
  categoryId: string;
  createdBy: string;
  viewCount: number;
  postCount: number;
  isPinned: boolean;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ForumPost {
  id: string;
  threadId: string;
  authorId: string;
  authorName: string;
  content: string;
  likes: number;
  isLiked: boolean;
  canEdit: boolean;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
  isEdited: boolean;
}

export interface ForumCategory {
  id: string;
  name: string;
  description?: string;
  threadCount: number;
  createdAt: string;
  updatedAt: string;
}

export const forumCategoriesAtom = atom<ForumCategory[]>([]);
export const forumThreadsAtom = atom<ForumThread[]>([]);
export const forumPostsAtom = atom<ForumPost[]>([]);
export const selectedThreadIdAtom = atom<string | null>(null);
export const isLoadingForumAtom = atom(false);

export const selectedThreadPostsAtom = atom((get) => {
  const threadId = get(selectedThreadIdAtom);
  const posts = get(forumPostsAtom);
  if (!threadId) return [];
  return posts.filter((p) => p.threadId === threadId);
});

// Helper atom to check if user can perform actions on a post
export const canUserEditPostAtom = atom(
  (get) => (postId: string) => {
    const posts = get(forumPostsAtom);
    const post = posts.find((p) => p.id === postId);
    return post?.canEdit || false;
  }
);

export const canUserDeletePostAtom = atom(
  (get) => (postId: string) => {
    const posts = get(forumPostsAtom);
    const post = posts.find((p) => p.id === postId);
    return post?.canDelete || false;
  }
);
