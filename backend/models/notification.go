package models

import "time"

// Notification type constants.
const (
	NotifCommentOnThread = "comment_on_thread"
	NotifThreadLiked     = "thread_liked"
	NotifThreadDeleted   = "thread_deleted"
	NotifThreadEdited    = "thread_edited"
	NotifCommentDeleted  = "comment_deleted"
	NotifCommentLiked    = "comment_liked"
	NotifProfileViewed   = "profile_viewed"
	NotifSuspended       = "suspended"
	NotifUnsuspended     = "unsuspended"
	NotifBanned          = "banned"
	NotifDirectMessage   = "direct_message"
)

// Notification is a user-facing notification.
type Notification struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Type      string    `json:"type"`
	Message   string    `json:"message"`
	Route     string    `json:"route,omitempty"`
	IsRead    bool      `json:"is_read"`
	CreatedAt time.Time `json:"created_at"`
}
