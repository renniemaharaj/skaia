package store

import (
	"github.com/skaia/backend/models"
)

// CategoryRepository defines CRUD for store categories.
type CategoryRepository interface {
	GetByID(id int64) (*models.StoreCategory, error)
	GetByName(name string) (*models.StoreCategory, error)
	Create(cat *models.StoreCategory) (*models.StoreCategory, error)
	Update(cat *models.StoreCategory) (*models.StoreCategory, error)
	Delete(id int64) error
	List() ([]*models.StoreCategory, error)
}

// ProductRepository defines CRUD for products.
type ProductRepository interface {
	GetByID(id int64) (*models.Product, error)
	GetByCategory(categoryID int64, limit, offset int) ([]*models.Product, error)
	Create(p *models.Product) (*models.Product, error)
	Update(p *models.Product) (*models.Product, error)
	Delete(id int64) error
	List(limit, offset int) ([]*models.Product, error)
}

// CartRepository manages a user's shopping cart.
type CartRepository interface {
	GetItem(userID, productID int64) (*models.CartItem, error)
	GetUserCart(userID int64) ([]*models.CartItem, error)
	AddToCart(userID, productID int64, quantity int) (*models.CartItem, error)
	UpdateItem(userID, productID int64, quantity int) (*models.CartItem, error)
	RemoveFromCart(userID, productID int64) error
	ClearCart(userID int64) error
}

// OrderRepository manages orders.
type OrderRepository interface {
	Create(order *models.Order, items []*models.OrderItem) (*models.Order, error)
	GetByID(id int64) (*models.Order, error)
	GetByUser(userID int64, limit, offset int) ([]*models.Order, error)
	UpdateStatus(id int64, status string) (*models.Order, error)
}

// PaymentRepository persists payment records.
type PaymentRepository interface {
	Create(p *models.Payment) (*models.Payment, error)
	GetByOrderID(orderID int64) (*models.Payment, error)
	UpdateStatus(id int64, status, failureReason string) (*models.Payment, error)
}

// SubscriptionPlanRepository manages subscription plans.
type SubscriptionPlanRepository interface {
	Create(plan *models.SubscriptionPlan) (*models.SubscriptionPlan, error)
	GetByID(id int64) (*models.SubscriptionPlan, error)
	Update(plan *models.SubscriptionPlan) (*models.SubscriptionPlan, error)
	Delete(id int64) error
	List() ([]*models.SubscriptionPlan, error)
}

// SubscriptionRepository manages user subscriptions.
type SubscriptionRepository interface {
	Create(s *models.Subscription) (*models.Subscription, error)
	GetByID(id int64) (*models.Subscription, error)
	GetByUserID(userID int64) (*models.Subscription, error)
	GetByProviderID(providerSubID string) (*models.Subscription, error)
	Update(s *models.Subscription) (*models.Subscription, error)
	ListByUser(userID int64) ([]*models.Subscription, error)
}

// PaymentProvider is the abstraction over real/simulated payment gateways.
type PaymentProvider interface {
	Charge(userID, amountCents int64, currency, paymentMethodID string) (providerRef, status, clientSecret string, err error)
	GetPaymentStatus(providerRef string) (string, error)
	CreateSubscription(userID int64, plan *models.SubscriptionPlan, email string) (*SubscriptionResult, error)
	CancelSubscription(providerSubID string, atPeriodEnd bool) error
	GetSubscriptionStatus(providerSubID string) (string, error)
	CreateCheckoutSession(plan *models.SubscriptionPlan, customerEmail, successURL, cancelURL string) (string, error)
}
