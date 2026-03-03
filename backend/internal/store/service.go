package store

import (
	"fmt"
	"os"

	"github.com/skaia/backend/models"
)

// Service coordinates repository access with caching for the store domain.
type Service struct {
	categories CategoryRepository
	products   ProductRepository
	cart       CartRepository
	orders     OrderRepository
	payments   PaymentRepository
	cache      *ProductCache
	provider   PaymentProvider
}

// NewService creates a Service.
func NewService(cats CategoryRepository, products ProductRepository, cart CartRepository, orders OrderRepository, payments PaymentRepository, cache *ProductCache, provider PaymentProvider) *Service {
	return &Service{
		categories: cats,
		products:   products,
		cart:       cart,
		orders:     orders,
		payments:   payments,
		cache:      cache,
		provider:   provider,
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
//  1. Resolve server-side prices (never trust client prices)
//  2. Create the order record
//  3. Delegate to the PaymentProvider
//  4. Persist the payment record and update order status
//  5. Clear the user's cart on success
func (s *Service) Checkout(userID int64, req *models.CheckoutRequest) (*models.CheckoutResponse, error) {
	if len(req.Items) == 0 {
		return nil, fmt.Errorf("no items in checkout request")
	}

	// Resolve authoritative prices from the DB
	var orderItems []*models.OrderItem
	var total float64
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
			qty = 1
		}
		total += p.Price * float64(qty)
		orderItems = append(orderItems, &models.OrderItem{
			ProductID: p.ID,
			Quantity:  qty,
			Price:     p.Price,
		})
	}

	// Create order in "pending" state
	order, err := s.orders.Create(&models.Order{
		UserID:     userID,
		TotalPrice: total,
		Status:     "pending",
	}, orderItems)
	if err != nil {
		return nil, fmt.Errorf("create order: %w", err)
	}

	// Charge via provider
	providerRef, payStatus, clientSecret, chargeErr := s.provider.Charge(userID, total, req.Currency, req.PaymentMethodID)
	if chargeErr != nil {
		payStatus = "failed"
	}

	failureReason := ""
	if chargeErr != nil {
		failureReason = chargeErr.Error()
	}

	// Persist payment record
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
		// Non-fatal: log but still return the result
		_ = err
	}

	// Update order status to match payment outcome
	orderStatus := "completed"
	if payStatus != "succeeded" {
		orderStatus = "failed"
	}
	updatedOrder, _ := s.orders.UpdateStatus(order.ID, orderStatus)
	if updatedOrder != nil {
		order = updatedOrder
	}

	// Clear cart only on success
	if payStatus == "succeeded" {
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
