package store

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/skaia/backend/models"
)

// Service coordinates repository access with caching for the store domain.
type Service struct {
	categories     CategoryRepository
	products       ProductRepository
	cart           CartRepository
	orders         OrderRepository
	referenceCodes ReferenceCodeRepository
	payments       PaymentRepository
	plans          SubscriptionPlanRepository
	subscriptions  SubscriptionRepository
	reviews        ReviewRepository
	WalletRepo     WalletRepository
	cache          *ProductCache
	provider       PaymentProvider
	inboxSender    models.InboxSender
	users          UserStore
}

// NewService creates a Service.
func NewService(cats CategoryRepository, products ProductRepository, cart CartRepository, orders OrderRepository, referenceCodes ReferenceCodeRepository, payments PaymentRepository, plans SubscriptionPlanRepository, subs SubscriptionRepository, reviews ReviewRepository, wallet WalletRepository, cache *ProductCache, provider PaymentProvider, users UserStore, inboxSender models.InboxSender) *Service {
	return &Service{
		categories:     cats,
		products:       products,
		cart:           cart,
		orders:         orders,
		referenceCodes: referenceCodes,
		payments:       payments,
		plans:          plans,
		subscriptions:  subs,
		reviews:        reviews,
		WalletRepo:     wallet,
		cache:          cache,
		provider:       provider,
		inboxSender:    inboxSender,
		users:          users,
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

// SendOrderInboxMessage sends a system message to the user about their order status update.
func (s *Service) SendOrderInboxMessage(ownerID int64, order *models.Order, msgType string) {
	if s.inboxSender == nil {
		return
	}
	cardJSON, _ := json.Marshal(map[string]interface{}{
		"order_id":    order.ID,
		"status":      order.Status,
		"total_price": order.TotalPrice,
	})
	_ = s.inboxSender.SendSystemMessage(ownerID, string(cardJSON), msgType)
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

// Review methods

func (s *Service) GetProductReviews(ctx context.Context, productID int64) ([]*models.ProductReviewWithUser, error) {
	return s.reviews.GetProductReviews(ctx, productID)
}

func (s *Service) CreateProductReview(ctx context.Context, review *models.ProductReview) error {
	return s.reviews.CreateProductReview(ctx, review)
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

// GetPaymentForOrder returns the latest payment record for an order.
func (s *Service) GetPaymentForOrder(orderID int64) (*models.Payment, error) {
	return s.payments.GetByOrderID(orderID)
}

func (s *Service) GetUserOrders(userID int64, limit, offset int) ([]*models.Order, error) {
	return s.orders.GetByUser(userID, limit, offset)
}

func (s *Service) GetGuestOrder(id int64, email, phone string) (*models.Order, error) {
	return s.orders.GetGuestOrder(id, email, phone)
}

func (s *Service) ListAllOrders(limit, offset int) ([]*models.Order, error) {
	return s.orders.ListAll(limit, offset)
}

func (s *Service) DeleteOrder(id int64) error {
	return s.orders.Delete(id)
}

func (s *Service) UpdateOrderStatus(id int64, status string) (*models.Order, error) {
	before, _ := s.orders.GetByID(id)
	order, err := s.orders.UpdateStatus(id, status)
	if err != nil {
		return nil, err
	}
	if status == "completed" && before != nil && before.Status != "completed" {
		_ = s.AwardReferenceCodePayout(order)
	}
	return order, nil
}

func (s *Service) CreateReferenceCode(code *models.ReferenceCode) (*models.ReferenceCode, error) {
	if code.Code == "" {
		return nil, fmt.Errorf("reference code required")
	}
	if code.UserID <= 0 {
		return nil, fmt.Errorf("user_id required")
	}
	if code.IncentiveAmount <= 0 {
		return nil, fmt.Errorf("incentive amount must be positive")
	}
	return s.referenceCodes.Create(code)
}

func (s *Service) UpdateReferenceCode(code *models.ReferenceCode) (*models.ReferenceCode, error) {
	if code.ID <= 0 {
		return nil, fmt.Errorf("reference code id required")
	}
	if code.Code == "" {
		return nil, fmt.Errorf("reference code required")
	}
	if code.UserID <= 0 {
		return nil, fmt.Errorf("user_id required")
	}
	if code.IncentiveAmount <= 0 {
		return nil, fmt.Errorf("incentive amount must be positive")
	}
	return s.referenceCodes.Update(code)
}

func (s *Service) ListReferenceCodes(limit, offset int) ([]*models.ReferenceCode, error) {
	return s.referenceCodes.List(limit, offset)
}

func (s *Service) AwardReferenceCodePayout(order *models.Order) error {
	if order == nil || order.ReferralCode == "" {
		return nil
	}
	if _, err := s.referenceCodes.GetPayoutByOrderID(order.ID); err == nil {
		return nil
	}

	code, err := s.referenceCodes.GetByCode(order.ReferralCode)
	if err != nil {
		return nil
	}
	if !code.IsActive || code.IncentiveAmount <= 0 {
		return nil
	}
	if order.UserID != nil && *order.UserID == code.UserID {
		return nil
	}

	if _, err := s.referenceCodes.CreatePayoutWithWalletCredit(&models.ReferenceCodePayout{
		ReferenceCodeID: code.ID,
		OrderID:         order.ID,
		UserID:          code.UserID,
		Amount:          code.IncentiveAmount,
	}, fmt.Sprintf("Reference code %s reward for order #%d", code.Code, order.ID)); err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return nil
		}
		return err
	}
	return nil
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
	var deliveryDate *time.Time
	if req.DeliveryDate != "" {
		if t, err := time.Parse("2006-01-02", req.DeliveryDate); err == nil {
			deliveryDate = &t
		}
	}

	var parsedUserID *int64
	if !req.IsGuest {
		parsedUserID = &userID
	}

	if req.ReferralCode != "" {
		refCode, err := s.referenceCodes.GetByCode(req.ReferralCode)
		if err != nil || !refCode.IsActive {
			return nil, fmt.Errorf("invalid reference code")
		}
		if !req.IsGuest && refCode.UserID == userID {
			return nil, fmt.Errorf("cannot use your own reference code")
		}
		req.ReferralCode = refCode.Code
	}

	order, err := s.orders.Create(&models.Order{
		UserID:           parsedUserID,
		IsGuest:          req.IsGuest,
		GuestEmail:       req.GuestEmail,
		GuestPhone:       req.GuestPhone,
		DeliveryLocation: req.DeliveryLocation,
		DeliveryDate:     deliveryDate,
		DeliveryTime:     req.DeliveryTime,
		ExtraInfo:        req.ExtraInfo,
		BillingInfo:      req.BillingInfo,
		TotalPrice:       total,
		Status:           "pending",
		ReferralCode:     req.ReferralCode,
	}, orderItems)
	if err != nil {
		return nil, fmt.Errorf("create order: %w", err)
	}

	// charge via provider or handle cash on delivery
	var providerRef, payStatus, clientSecret string
	var failureReason string

	if req.PaymentMethodID == "delivery_cash" {
		// Cash on delivery: payment is not completed at checkout time.
		// Leave payment as pending so the order is not auto-marked "paid".
		payStatus = "pending"
		providerRef = "cash_" + fmt.Sprint(order.ID)
	} else if req.PaymentMethodID == "wallet" {
		if req.IsGuest {
			payStatus = "failed"
			failureReason = "Wallet cannot be used by guests"
		} else {
			balance, err := s.WalletRepo.GetBalance(userID)
			if err != nil {
				payStatus = "failed"
				failureReason = "Failed to retrieve wallet balance"
			} else if balance < total {
				payStatus = "failed"
				failureReason = "Insufficient wallet balance"
			} else {
				_, err = s.WalletRepo.CreateTransaction(&models.WalletTransaction{
					UserID:      userID,
					Amount:      total,
					Type:        "debit",
					Description: fmt.Sprintf("Order #%d", order.ID),
				})
				if err != nil {
					payStatus = "failed"
					failureReason = "Failed to deduct from wallet"
				} else {
					payStatus = "succeeded"
					providerRef = "wallet_" + fmt.Sprint(order.ID)
				}
			}
		}
	} else if strings.HasPrefix(req.PaymentMethodID, "card_") {
		var cardID int64
		fmt.Sscanf(req.PaymentMethodID, "card_%d", &cardID)
		cards, _ := s.WalletRepo.GetCards(userID)
		valid := false
		for _, c := range cards {
			if c.ID == cardID {
				valid = true
				break
			}
		}
		if !valid {
			payStatus = "failed"
			failureReason = "Invalid or missing card"
		} else {
			var chargeErr error
			providerRef, payStatus, clientSecret, chargeErr = s.provider.Charge(userID, total, req.Currency, req.PaymentMethodID)
			if chargeErr != nil {
				payStatus = "failed"
				failureReason = chargeErr.Error()
			}
		}
	} else {
		var chargeErr error
		providerRef, payStatus, clientSecret, chargeErr = s.provider.Charge(userID, total, req.Currency, req.PaymentMethodID)
		if chargeErr != nil {
			payStatus = "failed"
			failureReason = chargeErr.Error()
		}
	}

	// persist payment record
	var parsedUserID2 int64
	if !req.IsGuest {
		parsedUserID2 = userID
	}
	payment, err := s.payments.Create(&models.Payment{
		OrderID: order.ID,
		UserID:  parsedUserID2,
		Provider: func() string {
			if req.PaymentMethodID == "delivery_cash" {
				return "delivery_cash"
			} else {
				return providerOfEnv()
			}
		}(),
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
	// We use a `paid` intermediate status when payment succeeded. Orders are
	// only moved to `completed` when a shopkeeper marks them completed or when
	// a paid order contains special actions (these should be executed immediately).
	orderStatus := "pending"
	if payStatus == "succeeded" {
		orderStatus = "paid"
	} else if payStatus == "failed" {
		orderStatus = "failed"
	}
	updatedOrder, _ := s.orders.UpdateStatus(order.ID, orderStatus)
	if updatedOrder != nil {
		order = updatedOrder
	}

	// on successful immediate payment: decrement stock, clear cart. Do NOT
	// execute special-actions until the order is marked `completed`. However,
	// if an order contains special actions, we auto-complete it after payment
	// and then execute those actions.
	if payStatus == "succeeded" {
		var hasSpecial bool
		for _, oi := range orderItems {
			if p, err := s.products.GetByID(oi.ProductID); err == nil {
				if !p.StockUnlimited {
					p.Stock -= oi.Quantity
					if p.Stock < 0 {
						p.Stock = 0
					}
					s.products.Update(p) //nolint:errcheck
					s.cache.Invalidate(oi.ProductID)
				}
				if p.SpecialActions != "" && p.SpecialActions != "[]" {
					hasSpecial = true
				}
			}
		}

		_ = s.cart.ClearCart(userID)

		// If there are special actions, complete the order and execute them now.
		if hasSpecial && !req.IsGuest {
			if co, _ := s.UpdateOrderStatus(order.ID, "completed"); co != nil {
				order = co
			}
			// execute special actions now (mirror previous behavior)
			for _, oi := range orderItems {
				if p, err := s.products.GetByID(oi.ProductID); err == nil {
					if p.SpecialActions != "" && p.SpecialActions != "[]" {
						var actions []struct {
							Type  string `json:"type"`
							Value string `json:"value"`
						}
						if err := json.Unmarshal([]byte(p.SpecialActions), &actions); err == nil {
							for _, act := range actions {
								if act.Type == "role" {
									_ = s.users.AddRoleByName(userID, act.Value)
								} else if act.Type == "credit" {
									amt, _ := strconv.ParseInt(act.Value, 10, 64)
									if amt > 0 {
										_, _ = s.WalletRepo.CreateTransaction(&models.WalletTransaction{
											UserID:      userID,
											Amount:      amt * int64(oi.Quantity),
											Type:        "credit",
											Description: fmt.Sprintf("Received from order #%d", order.ID),
										})
									}
								}
							}
						}
					}
				}
			}
		}
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
