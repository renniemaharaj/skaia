package store

import (
	"fmt"
	"os"
	"time"

	"github.com/skaia/backend/models"
)

// Service coordinates repository access with caching for the store domain.
type Service struct {
	categories    CategoryRepository
	products      ProductRepository
	cart          CartRepository
	orders        OrderRepository
	payments      PaymentRepository
	plans         SubscriptionPlanRepository
	subscriptions SubscriptionRepository
	cache         *ProductCache
	provider      PaymentProvider
}

// NewService creates a Service.
func NewService(cats CategoryRepository, products ProductRepository, cart CartRepository, orders OrderRepository, payments PaymentRepository, plans SubscriptionPlanRepository, subs SubscriptionRepository, cache *ProductCache, provider PaymentProvider) *Service {
	return &Service{
		categories:    cats,
		products:      products,
		cart:          cart,
		orders:        orders,
		payments:      payments,
		plans:         plans,
		subscriptions: subs,
		cache:         cache,
		provider:      provider,
	}
}

// Category methods

func (s *Service) GetCategory(id int64) (*models.StoreCategory, error) {
	return s.categories.GetByID(id)
}

func (s *Service) ListCategories() ([]*models.StoreCategory, error) {
	return s.categories.List()
}

func (s *Service) CreateCategory(cat *models.StoreCategory) (*models.StoreCategory, error) {
	return s.categories.Create(cat)
}

func (s *Service) UpdateCategory(cat *models.StoreCategory) (*models.StoreCategory, error) {
	return s.categories.Update(cat)
}

func (s *Service) DeleteCategory(id int64) error {
	return s.categories.Delete(id)
}

// Product methods

func (s *Service) GetProduct(id int64) (*models.Product, error) {
	if p, ok := s.cache.GetByID(id); ok {
		return p, nil
	}
	p, err := s.products.GetByID(id)
	if err != nil {
		return nil, err
	}
	s.cache.SetByID(id, p)
	return p, nil
}

func (s *Service) ListProducts(limit, offset int) ([]*models.Product, error) {
	return s.products.List(limit, offset)
}

func (s *Service) ListProductsByCategory(categoryID int64, limit, offset int) ([]*models.Product, error) {
	return s.products.GetByCategory(categoryID, limit, offset)
}

func (s *Service) CreateProduct(p *models.Product) (*models.Product, error) {
	return s.products.Create(p)
}

func (s *Service) UpdateProduct(p *models.Product) (*models.Product, error) {
	updated, err := s.products.Update(p)
	if err == nil {
		s.cache.Invalidate(p.ID)
	}
	return updated, err
}

func (s *Service) DeleteProduct(id int64) error {
	err := s.products.Delete(id)
	if err == nil {
		s.cache.Invalidate(id)
	}
	return err
}

// Cart methods

func (s *Service) GetUserCart(userID int64) ([]*models.CartItem, error) {
	return s.cart.GetUserCart(userID)
}

func (s *Service) AddToCart(userID, productID int64, quantity int) (*models.CartItem, error) {
	return s.cart.AddToCart(userID, productID, quantity)
}

func (s *Service) UpdateCartItem(userID, productID int64, quantity int) (*models.CartItem, error) {
	return s.cart.UpdateItem(userID, productID, quantity)
}

func (s *Service) RemoveFromCart(userID, productID int64) error {
	return s.cart.RemoveFromCart(userID, productID)
}

func (s *Service) ClearCart(userID int64) error {
	return s.cart.ClearCart(userID)
}

// Order methods

func (s *Service) CreateOrder(order *models.Order, items []*models.OrderItem) (*models.Order, error) {
	return s.orders.Create(order, items)
}

func (s *Service) GetOrder(id int64) (*models.Order, error) {
	return s.orders.GetByID(id)
}

func (s *Service) GetUserOrders(userID int64, limit, offset int) ([]*models.Order, error) {
	return s.orders.GetByUser(userID, limit, offset)
}

func (s *Service) UpdateOrderStatus(id int64, status string) (*models.Order, error) {
	return s.orders.UpdateStatus(id, status)
}

// Checkout processes a purchase end-to-end:
// 1. Resolve server-side prices
// 2. Validate stock availability
// 3. Create the order record
// 4. Charge via PaymentProvider
// 5. Persist payment and update order status
// 6. Decrement stock and clear cart on success
func (s *Service) Checkout(userID int64, req *models.CheckoutRequest) (*models.CheckoutResponse, error) {
	if len(req.Items) == 0 {
		return nil, fmt.Errorf("no items in checkout request")
	}

	// resolve authoritative prices and validate stock
	var orderItems []*models.OrderItem
	var total int64
	for _, item := range req.Items {
		p, err := s.GetProduct(item.ProductID)
		if err != nil {
			return nil, fmt.Errorf("product %d not found", item.ProductID)
		}
		if !p.IsActive {
			return nil, fmt.Errorf("product %q is not available", p.Name)
		}
		qty := item.Quantity
		if qty <= 0 {
			return nil, fmt.Errorf("quantity must be > 0 for product %d", item.ProductID)
		}
		if !p.StockUnlimited && p.Stock < qty {
			return nil, fmt.Errorf("insufficient stock for product %q", p.Name)
		}
		total += p.Price * int64(qty)
		orderItems = append(orderItems, &models.OrderItem{
			ProductID: p.ID,
			Quantity:  qty,
			Price:     p.Price,
		})
	}

	// create order in pending state
	order, err := s.orders.Create(&models.Order{
		UserID:     userID,
		TotalPrice: total,
		Status:     "pending",
	}, orderItems)
	if err != nil {
		return nil, fmt.Errorf("create order: %w", err)
	}

	// charge via provider
	providerRef, payStatus, clientSecret, chargeErr := s.provider.Charge(userID, total, req.Currency, req.PaymentMethodID)
	if chargeErr != nil {
		payStatus = "failed"
	}

	failureReason := ""
	if chargeErr != nil {
		failureReason = chargeErr.Error()
	}

	// persist payment record
	payment, err := s.payments.Create(&models.Payment{
		OrderID:       order.ID,
		UserID:        userID,
		Provider:      providerOfEnv(),
		ProviderRef:   providerRef,
		Amount:        total,
		Currency:      req.Currency,
		Status:        payStatus,
		FailureReason: failureReason,
	})
	if err != nil {
		return nil, fmt.Errorf("persist payment: %w", err)
	}

	// update order status to match payment outcome
	orderStatus := "completed"
	if payStatus != "succeeded" {
		orderStatus = "failed"
	}
	updatedOrder, _ := s.orders.UpdateStatus(order.ID, orderStatus)
	if updatedOrder != nil {
		order = updatedOrder
	}

	// on success: decrement stock and clear cart
	if payStatus == "succeeded" {
		for _, oi := range orderItems {
			if p, err := s.products.GetByID(oi.ProductID); err == nil && !p.StockUnlimited {
				p.Stock -= oi.Quantity
				if p.Stock < 0 {
					p.Stock = 0
				}
				s.products.Update(p) //nolint:errcheck
				s.cache.Invalidate(oi.ProductID)
			}
		}
		_ = s.cart.ClearCart(userID)
	}

	resp := &models.CheckoutResponse{
		Order:        order,
		Payment:      payment,
		ClientSecret: clientSecret,
		Status:       payStatus,
	}
	if payStatus == "succeeded" {
		resp.Message = "Payment successful"
	} else {
		resp.Message = "Payment failed"
		if failureReason != "" {
			resp.Message = failureReason
		}
	}
	return resp, nil
}

// providerOfEnv returns the configured provider name.
func providerOfEnv() string {
	if p := os.Getenv("PAYMENT_PROVIDER"); p != "" {
		return p
	}
	return "demo"
}

// Subscription plan methods

func (s *Service) ListPlans() ([]*models.SubscriptionPlan, error) {
	return s.plans.List()
}

func (s *Service) GetPlan(id int64) (*models.SubscriptionPlan, error) {
	return s.plans.GetByID(id)
}

func (s *Service) CreatePlan(plan *models.SubscriptionPlan) (*models.SubscriptionPlan, error) {
	return s.plans.Create(plan)
}

func (s *Service) UpdatePlan(plan *models.SubscriptionPlan) (*models.SubscriptionPlan, error) {
	return s.plans.Update(plan)
}

func (s *Service) DeletePlan(id int64) error {
	return s.plans.Delete(id)
}

// Subscription methods

func (s *Service) Subscribe(userID, planID int64, email string) (*models.Subscription, error) {
	plan, err := s.plans.GetByID(planID)
	if err != nil {
		return nil, fmt.Errorf("plan not found: %w", err)
	}
	if !plan.IsActive {
		return nil, fmt.Errorf("plan %q is not active", plan.Name)
	}

	// check for existing active subscription
	existing, err := s.subscriptions.GetByUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("check existing subscription: %w", err)
	}
	if existing != nil {
		return nil, fmt.Errorf("user already has an active subscription (id=%d)", existing.ID)
	}

	result, err := s.provider.CreateSubscription(userID, plan, email)
	if err != nil {
		return nil, fmt.Errorf("create subscription: %w", err)
	}

	sub := &models.Subscription{
		UserID:                 userID,
		PlanID:                 planID,
		Provider:               providerOfEnv(),
		ProviderSubscriptionID: result.ProviderSubscriptionID,
		ProviderCustomerID:     result.ProviderCustomerID,
		Status:                 result.Status,
		CurrentPeriodStart:     result.CurrentPeriodStart,
		CurrentPeriodEnd:       result.CurrentPeriodEnd,
	}
	return s.subscriptions.Create(sub)
}

func (s *Service) CancelSubscription(userID, subID int64, atPeriodEnd bool) (*models.Subscription, error) {
	sub, err := s.subscriptions.GetByID(subID)
	if err != nil {
		return nil, err
	}
	if sub.UserID != userID {
		return nil, fmt.Errorf("subscription does not belong to user")
	}

	if err := s.provider.CancelSubscription(sub.ProviderSubscriptionID, atPeriodEnd); err != nil {
		return nil, fmt.Errorf("cancel subscription: %w", err)
	}

	now := time.Now()
	sub.CancelledAt = &now
	sub.CancelAtPeriodEnd = atPeriodEnd
	if !atPeriodEnd {
		sub.Status = "canceled"
	}
	return s.subscriptions.Update(sub)
}

func (s *Service) GetUserSubscription(userID int64) (*models.Subscription, error) {
	return s.subscriptions.GetByUserID(userID)
}

func (s *Service) ListUserSubscriptions(userID int64) ([]*models.Subscription, error) {
	return s.subscriptions.ListByUser(userID)
}

func (s *Service) GetPaymentStatus(providerRef string) (string, error) {
	return s.provider.GetPaymentStatus(providerRef)
}
