package models

import "time"

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
