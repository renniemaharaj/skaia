package models

import (
	"time"
)

// User represents a user in the system.
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

// RegisterRequest represents a user registration request.
type RegisterRequest struct {
	Username    string `json:"username"`
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

// LoginRequest represents a user login request.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// RefreshRequest represents a token refresh request.
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// AuthResponse represents the response after login/register.
type AuthResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	User         *User  `json:"user"`
	ExpiresIn    int    `json:"expires_in"`
}

// StoreCategory represents a category in the store.
type StoreCategory struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	DisplayOrder int       `json:"display_order"`
	CreatedAt    time.Time `json:"created_at"`
}

// Product represents a product in the store. Prices are in cents.
type Product struct {
	ID             int64     `json:"id"`
	CategoryID     int64     `json:"category_id"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	Price          int64     `json:"price"`
	ImageURL       string    `json:"image_url"`
	Stock          int       `json:"stock"`
	OriginalPrice  *int64    `json:"original_price,omitempty"`
	StockUnlimited bool      `json:"stock_unlimited"`
	IsActive       bool      `json:"is_active"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// CartItem represents an item in a user's cart.
type CartItem struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	ProductID int64     `json:"product_id"`
	Quantity  int       `json:"quantity"`
	AddedAt   time.Time `json:"added_at"`
}

// Order represents a completed order. TotalPrice is in cents.
type Order struct {
	ID         int64     `json:"id"`
	UserID     int64     `json:"user_id"`
	TotalPrice int64     `json:"total_price"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// OrderItem represents an item in an order. Price is in cents.
type OrderItem struct {
	ID        int64     `json:"id"`
	OrderID   int64     `json:"order_id"`
	ProductID int64     `json:"product_id"`
	Quantity  int       `json:"quantity"`
	Price     int64     `json:"price"`
	CreatedAt time.Time `json:"created_at"`
}

// Permission represents a permission in the system.
type Permission struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Category    string    `json:"category"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
}

// Role represents a role in the system.
type Role struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
}

// ForumCategory represents a forum category.
type ForumCategory struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	DisplayOrder int       `json:"display_order"`
	CreatedAt    time.Time `json:"created_at"`
}

// ForumThread represents a forum thread/topic.
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

// Payment tracks the payment-provider lifecycle for an order. Amount is in cents.
type Payment struct {
	ID            int64     `json:"id"`
	OrderID       int64     `json:"order_id"`
	UserID        int64     `json:"user_id"`
	Provider      string    `json:"provider"`
	ProviderRef   string    `json:"provider_ref,omitempty"`
	Amount        int64     `json:"amount"`
	Currency      string    `json:"currency"`
	Status        string    `json:"status"`
	FailureReason string    `json:"failure_reason,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// CheckoutRequest carries the items a user wants to purchase.
type CheckoutRequest struct {
	Items           []CheckoutItem `json:"items"`
	PaymentMethodID string         `json:"payment_method_id,omitempty"`
	Currency        string         `json:"currency,omitempty"`
}

// CheckoutItem is a single line in a checkout request.
type CheckoutItem struct {
	ProductID int64 `json:"product_id"`
	Quantity  int   `json:"quantity"`
	Price     int64 `json:"price"`
}

// CheckoutResponse is the result of a checkout call.
type CheckoutResponse struct {
	Order        *Order   `json:"order"`
	Payment      *Payment `json:"payment"`
	ClientSecret string   `json:"client_secret,omitempty"`
	Status       string   `json:"status"`
	Message      string   `json:"message,omitempty"`
}

// SubscriptionPlan defines a recurring billing plan. PriceCents is per interval.
type SubscriptionPlan struct {
	ID            int64     `json:"id"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	PriceCents    int64     `json:"price_cents"`
	Currency      string    `json:"currency"`
	IntervalUnit  string    `json:"interval_unit"`
	IntervalCount int       `json:"interval_count"`
	TrialDays     int       `json:"trial_days"`
	StripePriceID string    `json:"stripe_price_id,omitempty"`
	IsActive      bool      `json:"is_active"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// Subscription tracks a user's active subscription to a plan.
type Subscription struct {
	ID                     int64      `json:"id"`
	UserID                 int64      `json:"user_id"`
	PlanID                 int64      `json:"plan_id"`
	Provider               string     `json:"provider"`
	ProviderSubscriptionID string     `json:"provider_subscription_id,omitempty"`
	ProviderCustomerID     string     `json:"provider_customer_id,omitempty"`
	Status                 string     `json:"status"`
	CurrentPeriodStart     time.Time  `json:"current_period_start"`
	CurrentPeriodEnd       time.Time  `json:"current_period_end"`
	CancelAtPeriodEnd      bool       `json:"cancel_at_period_end"`
	CancelledAt            *time.Time `json:"cancelled_at,omitempty"`
	CreatedAt              time.Time  `json:"created_at"`
	UpdatedAt              time.Time  `json:"updated_at"`
}

// InboxConversation represents a private conversation between two users.
type InboxConversation struct {
	ID        int64     `json:"id"`
	User1ID   int64     `json:"user1_id"`
	User2ID   int64     `json:"user2_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	// Enriched fields resolved at the service layer
	OtherUser            *User         `json:"other_user,omitempty"`
	LastMessage          *InboxMessage `json:"last_message,omitempty"`
	UnreadCount          int           `json:"unread_count,omitempty"`
	BlockedByCurrentUser bool          `json:"blocked_by_current_user,omitempty"`
	BlockedByOtherUser   bool          `json:"blocked_by_other_user,omitempty"`
}

// InboxMessage is a single message in a private conversation.
type InboxMessage struct {
	ID             int64     `json:"id"`
	ConversationID int64     `json:"conversation_id"`
	SenderID       int64     `json:"sender_id"`
	SenderName     string    `json:"sender_name,omitempty"`
	SenderAvatar   string    `json:"sender_avatar,omitempty"`
	Content        string    `json:"content"`
	MessageType    string    `json:"message_type"`
	AttachmentURL  string    `json:"attachment_url,omitempty"`
	AttachmentName string    `json:"attachment_name,omitempty"`
	AttachmentSize int64     `json:"attachment_size,omitempty"`
	AttachmentMime string    `json:"attachment_mime,omitempty"`
	IsRead         bool      `json:"is_read"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

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

// DataSource holds a named TypeScript code snippet that can be evaluated
// to produce a JSON array of items for derived page sections.
type DataSource struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Code        string    `json:"code"`
	CreatedBy   *int64    `json:"created_by,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// CustomSection is a reusable data-bound visualization (like a Superset chart).
// It pairs a DataSource with a section type (cards, stat_cards, table, etc.).
type CustomSection struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	DataSourceID int64     `json:"datasource_id"`
	SectionType  string    `json:"section_type"`
	Config       string    `json:"config"`
	CreatedBy    *int64    `json:"created_by,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// UserBlock represents a user blocking another user.
type UserBlock struct {
	ID        int64     `json:"id"`
	BlockerID int64     `json:"blocker_id"`
	BlockedID int64     `json:"blocked_id"`
	CreatedAt time.Time `json:"created_at"`
}
