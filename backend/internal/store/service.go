package store

import (
	"context"
	"encoding/json"
	"errors"
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

func (s *Service) DeleteCategory(id, actorID int64) error {
	return s.categories.Delete(id, actorID)
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
		"item_count":  len(order.Items),
		"route":       fmt.Sprintf("/store/orders/%d", order.ID),
	})
	_ = s.inboxSender.SendSystemMessage(ownerID, string(cardJSON), msgType)
}

// Product methods
func (s *Service) GetProduct(id int64) (*models.Product, error) {
	if s.cache != nil {
		if p, ok := s.cache.GetByID(id); ok {
			return p, nil
		}
	}
	p, err := s.products.GetByID(id)
	if err != nil {
		return nil, err
	}
	if s.cache != nil {
		s.cache.SetByID(id, p)
	}
	return p, nil
}

func (s *Service) ListProducts(limit, offset int) ([]*models.Product, error) {
	return s.products.List(limit, offset)
}

func (s *Service) ListProductsByCategory(categoryID int64, limit, offset int) ([]*models.Product, error) {
	return s.products.GetByCategory(categoryID, limit, offset)
}

func (s *Service) ListSimilarProducts(productID int64, limit int) ([]*models.Product, error) {
	if limit <= 0 {
		limit = 4
	}
	p, err := s.GetProduct(productID)
	if err != nil {
		return nil, err
	}
	products, err := s.products.GetByCategory(p.CategoryID, limit+1, 0)
	if err != nil {
		return nil, err
	}
	similar := make([]*models.Product, 0, limit)
	for _, candidate := range products {
		if candidate.ID == productID {
			continue
		}
		similar = append(similar, candidate)
		if len(similar) == limit {
			break
		}
	}
	return similar, nil
}

func (s *Service) CreateProduct(p *models.Product) (*models.Product, error) {
	created, err := s.products.Create(p)
	if err == nil && created != nil && s.cache != nil {
		s.cache.Invalidate(created.ID)
	}
	return created, err
}

func (s *Service) UpdateProduct(p *models.Product) (*models.Product, error) {
	updated, err := s.products.Update(p)
	if err == nil && s.cache != nil {
		s.cache.Invalidate(p.ID)
	}
	return updated, err
}

func (s *Service) DeleteProduct(id, actorID int64) error {
	err := s.products.Delete(id, actorID)
	if err == nil && s.cache != nil {
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

func (s *Service) GetPaymentByProviderRef(provider, providerRef string) (*models.Payment, error) {
	return s.payments.GetByProviderRef(provider, providerRef)
}

func (s *Service) GetUserOrders(userID int64, limit, offset int) ([]*models.Order, error) {
	return s.orders.GetByUser(userID, limit, offset)
}

func (s *Service) GetProductOwnerOrders(ownerID int64, limit, offset int) ([]*models.Order, error) {
	return s.orders.GetByProductOwner(ownerID, limit, offset)
}

func (s *Service) OrderContainsProductOwnedBy(orderID, ownerID int64) (bool, error) {
	return s.orders.ContainsProductOwnedBy(orderID, ownerID)
}

func (s *Service) GetGuestOrder(id int64, email, phone string) (*models.Order, error) {
	return s.orders.GetGuestOrder(id, email, phone)
}

func (s *Service) ListAllOrders(limit, offset int) ([]*models.Order, error) {
	return s.orders.ListAll(limit, offset)
}

func (s *Service) DeleteOrder(id, actorID int64) error {
	return s.orders.Delete(id, actorID)
}

func (s *Service) UpdateOrderStatus(id int64, status string) (*models.Order, error) {
	before, _ := s.orders.GetByID(id)
	var order *models.Order
	var err error
	if status == "completed" {
		if err := s.ProcessOrderFulfilments(id, fmt.Sprintf("order-status-%d", id)); err != nil {
			return nil, err
		}
		order, err = s.orders.CompleteWithReferencePayout(id)
	} else if status == "accepted" {
		order, err = s.orders.AcceptWithStockCheck(id)
	} else {
		order, err = s.orders.UpdateStatus(id, status)
	}
	if err != nil {
		return nil, err
	}
	if status == "accepted" && before != nil && before.Status != "accepted" && before.Status != "paid" && before.Status != "completed" {
		if s.cache != nil {
			for _, item := range order.Items {
				s.cache.Invalidate(item.ProductID)
			}
		}
	}
	return order, nil
}

func (s *Service) UpdateOrderVendorStatus(id, ownerID int64, status, note string) (*models.Order, error) {
	order, err := s.orders.UpdateVendorStatus(id, ownerID, status, note)
	if err != nil {
		return nil, err
	}
	if order.Status == "fulfilment_pending" {
		if err := s.ProcessOrderFulfilments(id, fmt.Sprintf("vendor-status-%d-%d", id, ownerID)); err != nil {
			return nil, err
		}
		order, err = s.orders.CompleteWithReferencePayout(id)
		if err != nil {
			return nil, err
		}
	} else if order.Status == "completed" {
		order, err = s.orders.CompleteWithReferencePayout(id)
		if err != nil {
			return nil, err
		}
	}
	if s.cache != nil {
		for _, item := range order.Items {
			if item.OwnerID != nil && *item.OwnerID == ownerID {
				s.cache.Invalidate(item.ProductID)
			}
		}
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

func (s *Service) DeleteReferenceCode(id, actorID int64) error {
	if id <= 0 {
		return fmt.Errorf("reference code id required")
	}
	return s.referenceCodes.Delete(id, actorID)
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
// 6. Clear persisted cart for signed-in checkouts
// 7. Decrement stock on successful immediate payment
func (s *Service) Checkout(userID int64, req *models.CheckoutRequest) (*models.CheckoutResponse, error) {
	if req == nil || userID <= 0 || req.IsGuest {
		return nil, fmt.Errorf("checkout requires an authenticated user")
	}
	if len(req.Items) == 0 {
		return nil, fmt.Errorf("no items in checkout request")
	}
	if strings.TrimSpace(req.IdempotencyKey) == "" || len(req.IdempotencyKey) > 500 {
		return nil, fmt.Errorf("a bounded Idempotency-Key header is required")
	}
	payload, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("encode checkout identity: %w", err)
	}
	op, created, err := s.orders.BeginCheckout(userID, req.IdempotencyKey, hashOperationValue(string(payload)))
	if err != nil {
		return nil, err
	}

	// Resolve authoritative prices only for the first attempt. Replays use the
	// already-bound order so later catalog changes cannot alter the operation.
	var orderItems []*models.OrderItem
	var total int64
	var order *models.Order
	if op.OrderID != nil {
		order, err = s.orders.GetByID(*op.OrderID)
		if err != nil {
			return nil, fmt.Errorf("resume checkout order: %w", err)
		}
		total = order.TotalPrice
	} else {
		for _, item := range req.Items {
			p, productErr := s.GetProduct(item.ProductID)
			if productErr != nil {
				return nil, fmt.Errorf("product %d not found", item.ProductID)
			}
			if !p.IsActive {
				return nil, fmt.Errorf("product %q is not available", p.Name)
			}
			if item.Quantity <= 0 {
				return nil, fmt.Errorf("quantity must be > 0 for product %d", item.ProductID)
			}
			if p.Price < 0 || (p.Price > 0 && int64(item.Quantity) > (1<<63-1)/p.Price) || total > (1<<63-1)-p.Price*int64(item.Quantity) {
				return nil, fmt.Errorf("invalid checkout total for product %d", item.ProductID)
			}
			if !p.StockUnlimited && p.Stock < item.Quantity {
				return nil, fmt.Errorf("insufficient stock for product %q", p.Name)
			}
			total += p.Price * int64(item.Quantity)
			orderItems = append(orderItems, &models.OrderItem{ProductID: p.ID, Quantity: item.Quantity, Price: p.Price})
		}

		var deliveryDate *time.Time
		if req.DeliveryDate != "" {
			parsed, parseErr := time.Parse("2006-01-02", req.DeliveryDate)
			if parseErr != nil {
				return nil, fmt.Errorf("invalid delivery date")
			}
			deliveryDate = &parsed
		}
		if req.ReferralCode != "" {
			if s.referenceCodes == nil {
				return nil, fmt.Errorf("reference codes are unavailable")
			}
			refCode, refErr := s.referenceCodes.GetByCode(req.ReferralCode)
			if refErr != nil || !refCode.IsActive {
				return nil, fmt.Errorf("invalid reference code")
			}
			if refCode.UserID == userID {
				return nil, fmt.Errorf("cannot use your own reference code")
			}
			req.ReferralCode = refCode.Code
		}
		order, err = s.orders.CreateForCheckout(op.ID, &models.Order{
			UserID: &userID, GuestPhone: req.GuestPhone, DeliveryLocation: req.DeliveryLocation,
			DeliveryDate: deliveryDate, DeliveryTime: req.DeliveryTime, ExtraInfo: req.ExtraInfo,
			BillingInfo: req.BillingInfo, TotalPrice: total, Status: "pending", ReferralCode: req.ReferralCode,
		}, orderItems)
		if err != nil {
			return nil, fmt.Errorf("create checkout order: %w", err)
		}
		total = order.TotalPrice
	}

	var providerRef, payStatus, clientSecret string
	var failureReason string
	payment, paymentErr := s.payments.GetByOrderID(order.ID)
	if errors.Is(paymentErr, ErrPaymentNotFound) && req.PaymentMethodID != "delivery_cash" {
		if strings.HasPrefix(req.PaymentMethodID, "card_") {
			if s.WalletRepo == nil {
				return nil, errors.New("stored cards are unavailable")
			}
			var cardID int64
			if _, scanErr := fmt.Sscanf(req.PaymentMethodID, "card_%d", &cardID); scanErr != nil || cardID <= 0 {
				return nil, errors.New("invalid stored card")
			}
			cards, cardsErr := s.WalletRepo.GetCards(userID)
			if cardsErr != nil {
				return nil, errors.New("stored cards are unavailable")
			}
			valid := false
			for _, card := range cards {
				if card.ID == cardID {
					valid = true
					break
				}
			}
			if !valid {
				return nil, errors.New("invalid stored card")
			}
		}
		reserved, reserveErr := s.orders.AcceptWithStockCheck(order.ID)
		if reserveErr != nil {
			return nil, reserveErr
		}
		order = reserved
	}
	if paymentErr == nil {
		providerRef, payStatus, failureReason = payment.ProviderRef, payment.Status, payment.FailureReason
	} else {
		if !errors.Is(paymentErr, ErrPaymentNotFound) {
			return nil, fmt.Errorf("load checkout payment: %w", paymentErr)
		}
		if req.PaymentMethodID == "delivery_cash" {
			payStatus = "pending"
			providerRef = "cash_" + fmt.Sprint(order.ID)
		} else if req.PaymentMethodID == "wallet" {
			if s.WalletRepo == nil {
				return nil, errors.New("wallet payments are unavailable")
			}
			if _, _, debitErr := s.WalletRepo.DebitIfSufficientOnce(userID, total, fmt.Sprintf("Order #%d", order.ID), "store.checkout", req.IdempotencyKey); debitErr != nil {
				payStatus = "failed"
				failureReason = debitErr.Error()
			} else {
				payStatus = "succeeded"
				providerRef = "wallet_" + fmt.Sprint(order.ID)
			}
		} else {
			if s.provider == nil {
				return nil, errors.New("payment provider is unavailable")
			}
			providerRef, payStatus, clientSecret, paymentErr = s.provider.Charge(userID, total, req.Currency, req.PaymentMethodID, req.IdempotencyKey)
			if paymentErr != nil {
				return nil, fmt.Errorf("payment provider did not confirm an outcome: %w", paymentErr)
			}
		}
		provider := providerOfEnv()
		if req.PaymentMethodID == "delivery_cash" {
			provider = "delivery_cash"
		} else if req.PaymentMethodID == "wallet" {
			provider = "wallet"
		}
		payment, _, err = s.payments.CreateOnce(&models.Payment{
			OrderID: order.ID, UserID: userID, Provider: provider, ProviderRef: providerRef,
			Amount: total, Currency: req.Currency, Status: payStatus, FailureReason: failureReason,
		})
		if err != nil {
			return nil, fmt.Errorf("persist payment: %w", err)
		}
	}

	if payStatus == "failed" {
		updated, statusErr := s.orders.UpdateStatus(order.ID, "failed")
		if statusErr != nil {
			return nil, statusErr
		}
		order = updated
	}

	if payStatus == "succeeded" {
		accepted, acceptErr := s.orders.AcceptWithStockCheck(order.ID)
		if acceptErr != nil {
			if req.PaymentMethodID == "wallet" {
				_, _, refundErr := s.WalletRepo.CreateTransactionOnce(&models.WalletTransaction{
					UserID:      userID,
					Amount:      total,
					Type:        "credit",
					Description: fmt.Sprintf("Refund for order #%d", order.ID),
				}, "store.stock_refund", fmt.Sprintf("order:%d", order.ID))
				if refundErr != nil {
					return nil, fmt.Errorf("reserve stock: %v; refund wallet: %w", acceptErr, refundErr)
				}
			}
			_, _ = s.payments.UpdateStatus(payment.ID, "failed", acceptErr.Error())
			_, _ = s.orders.UpdateStatus(order.ID, "failed")
			return nil, acceptErr
		}
		order = accepted
		for _, item := range order.Items {
			if s.cache != nil {
				s.cache.Invalidate(item.ProductID)
			}
		}
		hasFulfilments, err := s.orders.OrderHasFulfilments(order.ID)
		if err != nil {
			return nil, err
		}
		if hasFulfilments {
			if err := s.ProcessOrderFulfilments(order.ID, fmt.Sprintf("checkout-%d", op.ID)); err != nil {
				return nil, err
			}
			order, err = s.orders.CompleteWithReferencePayout(order.ID)
		} else {
			order, err = s.orders.UpdateStatus(order.ID, "paid")
		}
		if err != nil {
			return nil, err
		}
	}
	if s.cart != nil {
		if err := s.cart.ClearCart(userID); err != nil {
			return nil, fmt.Errorf("clear checked-out cart: %w", err)
		}
	}
	if err := s.orders.CompleteCheckout(op.ID); err != nil {
		return nil, err
	}

	resp := &models.CheckoutResponse{
		Order:        order,
		Payment:      payment,
		ClientSecret: clientSecret,
		Status:       payStatus,
		Replayed:     !created,
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

// ProcessOrderFulfilments drains the currently available durable effects for an
// order. Every external/local effect is replay-safe before the lease is marked
// successful, so worker death can only cause a harmless retry.
func (s *Service) ProcessOrderFulfilments(orderID int64, owner string) error {
	idleChecks := 0
	for {
		jobs, err := s.orders.ClaimFulfilments(orderID, owner, 30*time.Second, 25)
		if err != nil {
			return err
		}
		if len(jobs) == 0 {
			succeeded, statusErr := s.orders.OrderFulfilmentsSucceeded(orderID)
			if statusErr != nil {
				return statusErr
			}
			if succeeded {
				return nil
			}
			if idleChecks >= 10 {
				return errors.New("order fulfilments are pending retry")
			}
			idleChecks++
			time.Sleep(20 * time.Millisecond)
			continue
		}
		idleChecks = 0
		for _, job := range jobs {
			deliveryErr := s.deliverOrderFulfilment(job)
			if deliveryErr != nil {
				retry := time.Second << min(job.Attempts-1, 6)
				if markErr := s.orders.MarkFulfilmentFailed(job.ID, owner, deliveryErr.Error(), retry); markErr != nil {
					return errors.Join(deliveryErr, markErr)
				}
				return deliveryErr
			}
			if err := s.orders.MarkFulfilmentSucceeded(job.ID, owner); err != nil {
				return err
			}
		}
	}
}

// RetryOrderFulfilments is the fail-closed operator recovery path for jobs that
// exhausted their automatic attempt budget. The repository reset and every
// delivered effect remain idempotent, so an operator retry cannot double-grant.
func (s *Service) RetryOrderFulfilments(orderID, actorID int64) (*models.Order, error) {
	if s == nil || s.users == nil || actorID <= 0 {
		return nil, errors.New("fulfilment recovery is forbidden")
	}
	allowed, err := s.users.HasPermission(actorID, "store.manageOrders")
	if err != nil || !allowed {
		return nil, errors.New("fulfilment recovery is forbidden")
	}
	reset, err := s.orders.RetryExhaustedFulfilments(orderID)
	if err != nil {
		return nil, err
	}
	if reset == 0 {
		return nil, errors.New("order has no exhausted fulfilments")
	}
	if err := s.ProcessOrderFulfilments(orderID, fmt.Sprintf("operator-%d-order-%d", actorID, orderID)); err != nil {
		return nil, err
	}
	order, err := s.orders.GetByID(orderID)
	if err != nil {
		return nil, err
	}
	if order.Status == "fulfilment_pending" {
		return s.orders.CompleteWithReferencePayout(orderID)
	}
	return order, nil
}

func (s *Service) deliverOrderFulfilment(job *models.OrderFulfilment) error {
	if job == nil || job.UserID <= 0 || job.Quantity <= 0 {
		return errors.New("invalid order fulfilment")
	}
	switch job.ActionType {
	case "role":
		if s.users == nil {
			return errors.New("role fulfilment service is unavailable")
		}
		return s.users.AddRoleByName(job.UserID, job.ActionValue)
	case "credit":
		if s.WalletRepo == nil {
			return errors.New("wallet fulfilment service is unavailable")
		}
		amount, err := strconv.ParseInt(job.ActionValue, 10, 64)
		if err != nil || amount <= 0 || amount > (1<<63-1)/int64(job.Quantity) {
			return errors.New("invalid credit fulfilment value")
		}
		_, _, err = s.WalletRepo.CreateTransactionOnce(&models.WalletTransaction{
			UserID: job.UserID, Amount: amount * int64(job.Quantity), Type: "credit",
			Description: fmt.Sprintf("Received from order #%d", job.OrderID),
		}, "store.product_fulfilment", fmt.Sprintf("fulfilment:%d:%s", job.ID, job.PayloadHash))
		return err
	default:
		return fmt.Errorf("unsupported product fulfilment type %q", job.ActionType)
	}
}

func (s *Service) ApplyProviderPaymentEvent(provider string, event *ProviderPaymentEvent, payloadHash string) (*models.Payment, bool, error) {
	if event == nil {
		return nil, false, errors.New("payment event is required")
	}
	payment, created, err := s.payments.ApplyProviderEvent(provider, event.ID, payloadHash, event.ProviderRef, event.Status)
	if err != nil {
		return nil, false, err
	}
	switch payment.Status {
	case "succeeded":
		order, err := s.orders.AcceptWithStockCheck(payment.OrderID)
		if err != nil {
			return nil, created, err
		}
		hasFulfilments, err := s.orders.OrderHasFulfilments(order.ID)
		if err != nil {
			return nil, created, err
		}
		if hasFulfilments {
			owner := "payment-event-" + hashOperationValue(event.ID)[:24]
			if err := s.ProcessOrderFulfilments(order.ID, owner); err != nil {
				return nil, created, err
			}
			_, err = s.orders.CompleteWithReferencePayout(order.ID)
		} else {
			_, err = s.orders.UpdateStatus(order.ID, "paid")
		}
		if err != nil {
			return nil, created, err
		}
	case "failed":
		if _, err := s.orders.UpdateStatus(payment.OrderID, "failed"); err != nil {
			return nil, created, err
		}
	}
	return payment, created, nil
}

func (s *Service) RefreshProviderPayment(provider, providerRef string) (*models.Payment, error) {
	if s.provider == nil {
		return nil, errors.New("payment provider is unavailable")
	}
	status, err := s.provider.GetPaymentStatus(providerRef)
	if err != nil {
		return nil, err
	}
	normalized := "processing"
	switch status {
	case "succeeded":
		normalized = "succeeded"
	case "failed", "canceled", "requires_payment_method":
		normalized = "failed"
	}
	eventID := fmt.Sprintf("poll:%s:%s", providerRef, normalized)
	payment, _, err := s.ApplyProviderPaymentEvent(provider, &ProviderPaymentEvent{
		ID: eventID, ProviderRef: providerRef, Status: normalized,
	}, hashOperationValue(eventID))
	return payment, err
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

func (s *Service) DeletePlan(id, actorID int64) error {
	return s.plans.Delete(id, actorID)
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
