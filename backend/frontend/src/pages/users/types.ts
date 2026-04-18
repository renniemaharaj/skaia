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
  email_verified?: boolean;
  totp_enabled?: boolean;
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
