package models

import (
	"time"
)

// User represents a user in the system
type User struct {
	ID              int64      `json:"id"`
	Username        string     `json:"username"`
	Email           string     `json:"email"`
	PasswordHash    string     `json:"-"`
	DisplayName     string     `json:"display_name"`
	AvatarURL       string     `json:"avatar_url"`
	BannerURL       string     `json:"banner_url"`
	PhotoURL        string     `json:"photo_url"`
	Bio             string     `json:"bio"`
	DiscordID       *string    `json:"discord_id"`
	IsSuspended     bool       `json:"is_suspended"`
	SuspendedAt     *time.Time `json:"suspended_at"`
	SuspendedReason *string    `json:"suspended_reason"`
	Roles           []string   `json:"roles"`
	Permissions     []string   `json:"permissions"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// RegisterRequest represents a user registration request
type RegisterRequest struct {
	Username    string `json:"username"`
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

// LoginRequest represents a user login request
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// RefreshRequest represents a token refresh request
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// AuthResponse represents the response after login/register
type AuthResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	User         *User  `json:"user"`
	ExpiresIn    int    `json:"expires_in"`
}

// StoreCategory represents a category in the store
type StoreCategory struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	DisplayOrder int       `json:"display_order"`
	CreatedAt    time.Time `json:"created_at"`
}

// Product represents a product in the store
type Product struct {
	ID          int64     `json:"id"`
	CategoryID  int64     `json:"category_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Price       float64   `json:"price"`
	ImageURL    string    `json:"image_url"`
	Stock       int       `json:"stock"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// CartItem represents an item in a user's cart
type CartItem struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	ProductID int64     `json:"product_id"`
	Quantity  int       `json:"quantity"`
	AddedAt   time.Time `json:"added_at"`
}

// Order represents a completed order
type Order struct {
	ID         int64     `json:"id"`
	UserID     int64     `json:"user_id"`
	TotalPrice float64   `json:"total_price"`
	Status     string    `json:"status"` // pending, completed, cancelled
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// OrderItem represents an item in an order
type OrderItem struct {
	ID        int64     `json:"id"`
	OrderID   int64     `json:"order_id"`
	ProductID int64     `json:"product_id"`
	Quantity  int       `json:"quantity"`
	Price     float64   `json:"price"`
	CreatedAt time.Time `json:"created_at"`
}

// Permission represents a permission in the system
type Permission struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Category    string    `json:"category"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
}

// ForumCategory represents a forum category
type ForumCategory struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	DisplayOrder int       `json:"display_order"`
	CreatedAt    time.Time `json:"created_at"`
}

// ForumThread represents a forum thread/topic
type ForumThread struct {
	ID                     int64     `json:"id"`
	CategoryID             int64     `json:"category_id"`
	UserID                 int64     `json:"user_id"`
	Title                  string    `json:"title"`
	Content                string    `json:"content"`
	ViewCount              int       `json:"view_count"`
	ReplyCount             int       `json:"reply_count"`
	IsPinned               bool      `json:"is_pinned"`
	IsLocked               bool      `json:"is_locked"`
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`
	UserName               string    `json:"user_name,omitempty"`
	UserRoles              []string  `json:"user_roles,omitempty"`
	UserAvatar             string    `json:"user_avatar,omitempty"`
	Likes                  int       `json:"likes,omitempty"`
	IsLiked                bool      `json:"is_liked,omitempty"`
	CanEdit                bool      `json:"can_edit,omitempty"`
	CanDelete              bool      `json:"can_delete,omitempty"`
	CanLikeComments        bool      `json:"can_like_comments,omitempty"`
	CanDeleteThreadComment bool      `json:"can_delete_thread_comment,omitempty"`
	CanLikeThreads         bool      `json:"can_like_threads,omitempty"`
}

// ForumPost represents a post in a forum thread
type ForumPost struct {
	ID              int64     `json:"id"`
	ThreadID        int64     `json:"thread_id"`
	UserID          int64     `json:"user_id"`
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
