export interface ProfileUser {
  id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  banner_url?: string;
  photo_url?: string;
  bio?: string;
  is_suspended: boolean;
  suspended_reason?: string;
  permissions: string[];
  roles: string[];
  created_at: string;
}

export interface Permission {
  id: string;
  name: string;
  category: string;
  description: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  power_level: number;
}

export interface ForumThread {
  id: string;
  title: string;
  content: string;
  category_id: string;
  user_id?: string;
  view_count: number;
  reply_count: number;
  likes: number;
  is_pinned: boolean;
  is_locked: boolean;
  created_at: string;
  user_name: string;
  user_avatar?: string;
}

export const THREADS_PER_PAGE = 15;
