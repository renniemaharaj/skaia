package models

import "time"

// ForumCategory represents a forum category.
type ForumCategory struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	DisplayOrder int       `json:"display_order"`
	IsLocked     bool      `json:"is_locked"`
	CreatedAt    time.Time `json:"created_at"`
}

// ForumThread represents a forum thread/topic.
type ForumThread struct {
	ID                     int64        `json:"id"`
	CategoryID             int64        `json:"category_id"`
	UserID                 int64        `json:"user_id"`
	Title                  string       `json:"title"`
	Content                string       `json:"content"`
	ViewCount              int          `json:"view_count"`
	ReplyCount             int          `json:"reply_count"`
	IsPinned               bool         `json:"is_pinned"`
	IsLocked               bool         `json:"is_locked"`
	IsShared               bool         `json:"is_shared"`
	OriginalThreadID       *int64       `json:"original_thread_id,omitempty"`
	CreatedAt              time.Time    `json:"created_at"`
	UpdatedAt              time.Time    `json:"updated_at"`
	UserName               string       `json:"user_name,omitempty"`
	UserRoles              []string     `json:"user_roles,omitempty"`
	UserAvatar             string       `json:"user_avatar,omitempty"`
	Likes                  int          `json:"likes,omitempty"`
	IsLiked                bool         `json:"is_liked,omitempty"`
	CanEdit                bool         `json:"can_edit,omitempty"`
	CanDelete              bool         `json:"can_delete,omitempty"`
	CanLikeComments        bool         `json:"can_like_comments,omitempty"`
	CanDeleteThreadComment bool         `json:"can_delete_thread_comment,omitempty"`
	CanLikeThreads         bool         `json:"can_like_threads,omitempty"`
	CanLock                bool         `json:"can_lock,omitempty"`
	OriginalThread         *ForumThread `json:"original_thread,omitempty"`
}

// ThreadComment represents a comment in a forum thread.
type ThreadComment struct {
	ID              int64     `json:"id"`
	ThreadID        int64     `json:"thread_id"`
	AuthorID        int64     `json:"author_id"`
	Content         string    `json:"content"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
	AuthorName      string    `json:"author_name,omitempty"`
	AuthorRoles     []string  `json:"author_roles,omitempty"`
	AuthorAvatar    string    `json:"author_avatar,omitempty"`
	Likes           int       `json:"likes,omitempty"`
	IsLiked         bool      `json:"is_liked,omitempty"`
	CanEdit         bool      `json:"can_edit,omitempty"`
	CanDelete       bool      `json:"can_delete,omitempty"`
	CanLikeComments bool      `json:"can_like_comments,omitempty"`
}
