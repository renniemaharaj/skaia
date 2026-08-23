package store_test

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/skaia/backend/internal/store"
	"github.com/skaia/backend/internal/testutil"
	"github.com/skaia/backend/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCheckoutConcurrentReplayCreatesOneOrderPaymentAndFulfilment(t *testing.T) {
	db := testutil.OpenTestDB(t)
	t.Setenv("PAYMENT_PROVIDER", "demo")
	t.Setenv("DEMO_PAYMENT_FAIL", "false")

	productRepo := store.NewProductRepository(db)
	orderRepo := store.NewOrderRepository(db)
	paymentRepo := store.NewPaymentRepository(db)
	walletRepo := store.NewWalletRepository(db)
	categoryRepo := store.NewCategoryRepository(db)
	userID := createStoreTestUser(t, db)
	category, err := categoryRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("checkout_once")})
	require.NoError(t, err)
	product, err := productRepo.Create(&models.Product{
		CategoryID: category.ID,
		Name:       testutil.UniqueStr("checkout_once_product"),
		Price:      750,
		Stock:      5,
		IsActive:   true,
		SpecialActions: `[
			{"type":"credit","value":"100"}
		]`,
	})
	require.NoError(t, err)

	svc := store.NewService(nil, productRepo, nil, orderRepo, nil, paymentRepo, nil, nil, nil, walletRepo, nil, store.NewDemoPaymentProvider(), nil, nil)
	request := func() *models.CheckoutRequest {
		return &models.CheckoutRequest{
			Items:           []models.CheckoutItem{{ProductID: product.ID, Quantity: 2}},
			PaymentMethodID: "demo_method",
			Currency:        "usd",
			IdempotencyKey:  "opaque-concurrent-checkout-key",
		}
	}

	const workers = 8
	start := make(chan struct{})
	responses := make(chan *models.CheckoutResponse, workers)
	errs := make(chan error, workers)
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			response, checkoutErr := svc.Checkout(userID, request())
			if checkoutErr != nil {
				errs <- checkoutErr
				return
			}
			responses <- response
		}()
	}
	close(start)
	wg.Wait()
	close(responses)
	close(errs)
	for checkoutErr := range errs {
		require.NoError(t, checkoutErr)
	}

	var orderID int64
	responseCount := 0
	for response := range responses {
		require.NotNil(t, response.Order)
		if orderID == 0 {
			orderID = response.Order.ID
		}
		assert.Equal(t, orderID, response.Order.ID)
		assert.Equal(t, "completed", response.Order.Status)
		responseCount++
	}
	assert.Equal(t, workers, responseCount)

	checks := []struct {
		query string
		args  []any
	}{
		{`SELECT COUNT(*) FROM orders WHERE id=$1`, []any{orderID}},
		{`SELECT COUNT(*) FROM payments WHERE order_id=$1`, []any{orderID}},
		{`SELECT COUNT(*) FROM store_checkout_operations WHERE order_id=$1`, []any{orderID}},
		{`SELECT COUNT(*) FROM store_order_fulfilments WHERE order_id=$1 AND status='succeeded'`, []any{orderID}},
		{`SELECT COUNT(*) FROM user_wallet_transactions WHERE user_id=$1 AND description=$2`, []any{userID, fmt.Sprintf("Received from order #%d", orderID)}},
	}
	for _, check := range checks {
		var count int
		require.NoError(t, db.QueryRow(check.query, check.args...).Scan(&count))
		assert.Equal(t, 1, count, check.query)
	}

	updatedProduct, err := productRepo.GetByID(product.ID)
	require.NoError(t, err)
	assert.Equal(t, 3, updatedProduct.Stock)
	var storedKeyHash string
	require.NoError(t, db.QueryRow(`SELECT key_hash FROM store_checkout_operations WHERE order_id=$1`, orderID).Scan(&storedKeyHash))
	assert.NotEqual(t, request().IdempotencyKey, storedKeyHash)
}

func TestCheckoutIdempotencyPayloadConflictCreatesNoSecondOrder(t *testing.T) {
	db := testutil.OpenTestDB(t)
	orderRepo := store.NewOrderRepository(db)
	userID := createStoreTestUser(t, db)

	first, created, err := orderRepo.BeginCheckout(userID, "same-key", "payload-a")
	require.NoError(t, err)
	assert.True(t, created)
	require.NotZero(t, first.ID)

	_, _, err = orderRepo.BeginCheckout(userID, "same-key", "payload-b")
	require.ErrorIs(t, err, store.ErrIdempotencyConflict)
	var count int
	require.NoError(t, db.QueryRow(`SELECT COUNT(*) FROM store_checkout_operations WHERE user_id=$1`, userID).Scan(&count))
	assert.Equal(t, 1, count)
}

func TestFulfilmentLeaseExpiresAndCanBeReclaimed(t *testing.T) {
	db := testutil.OpenTestDB(t)
	categoryRepo := store.NewCategoryRepository(db)
	productRepo := store.NewProductRepository(db)
	orderRepo := store.NewOrderRepository(db)
	userID := createStoreTestUser(t, db)
	category, err := categoryRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("lease")})
	require.NoError(t, err)
	product, err := productRepo.Create(&models.Product{
		CategoryID: category.ID, Name: testutil.UniqueStr("lease_product"), Price: 100,
		Stock: 1, IsActive: true, SpecialActions: `[{"type":"credit","value":"25"}]`,
	})
	require.NoError(t, err)
	order, err := orderRepo.Create(
		&models.Order{UserID: &userID, TotalPrice: 100, Status: "pending"},
		[]*models.OrderItem{{ProductID: product.ID, Quantity: 1, Price: 100}},
	)
	require.NoError(t, err)
	_, err = orderRepo.AcceptWithStockCheck(order.ID)
	require.NoError(t, err)

	first, err := orderRepo.ClaimFulfilments(order.ID, "worker-a", time.Millisecond, 1)
	require.NoError(t, err)
	require.Len(t, first, 1)
	time.Sleep(5 * time.Millisecond)
	second, err := orderRepo.ClaimFulfilments(order.ID, "worker-b", time.Second, 1)
	require.NoError(t, err)
	require.Len(t, second, 1)
	assert.Equal(t, first[0].ID, second[0].ID)
	assert.Equal(t, 2, second[0].Attempts)
	assert.Error(t, orderRepo.MarkFulfilmentSucceeded(first[0].ID, "worker-a"))
	require.NoError(t, orderRepo.MarkFulfilmentSucceeded(second[0].ID, "worker-b"))
	complete, err := orderRepo.OrderFulfilmentsSucceeded(order.ID)
	require.NoError(t, err)
	assert.True(t, complete)
}

func TestExhaustedFulfilmentRequiresExplicitRecovery(t *testing.T) {
	db := testutil.OpenTestDB(t)
	categoryRepo := store.NewCategoryRepository(db)
	productRepo := store.NewProductRepository(db)
	orderRepo := store.NewOrderRepository(db)
	userID := createStoreTestUser(t, db)
	category, err := categoryRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("dead_letter")})
	require.NoError(t, err)
	product, err := productRepo.Create(&models.Product{
		CategoryID: category.ID, Name: testutil.UniqueStr("dead_letter_product"), Price: 100,
		Stock: 1, IsActive: true, SpecialActions: `[{"type":"credit","value":"25"}]`,
	})
	require.NoError(t, err)
	order, err := orderRepo.Create(
		&models.Order{UserID: &userID, TotalPrice: 100, Status: "pending"},
		[]*models.OrderItem{{ProductID: product.ID, Quantity: 1, Price: 100}},
	)
	require.NoError(t, err)
	_, err = orderRepo.AcceptWithStockCheck(order.ID)
	require.NoError(t, err)
	_, err = db.Exec(`
		UPDATE store_order_fulfilments
		SET status='failed', attempts=8, available_at=CURRENT_TIMESTAMP
		WHERE order_id=$1
	`, order.ID)
	require.NoError(t, err)

	claimed, err := orderRepo.ClaimFulfilments(order.ID, "automatic-worker", time.Second, 1)
	require.NoError(t, err)
	assert.Empty(t, claimed)
	reset, err := orderRepo.RetryExhaustedFulfilments(order.ID)
	require.NoError(t, err)
	assert.EqualValues(t, 1, reset)
	claimed, err = orderRepo.ClaimFulfilments(order.ID, "operator-worker", time.Second, 1)
	require.NoError(t, err)
	require.Len(t, claimed, 1)
	assert.Equal(t, 1, claimed[0].Attempts)
}

func TestFulfilmentRecoveryFailsClosedWithoutAuthorizer(t *testing.T) {
	svc := store.NewService(nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil)
	_, err := svc.RetryOrderFulfilments(1, 1)
	require.ErrorContains(t, err, "forbidden")
}

func TestCancellingAcceptedOrderRestoresStockOnceAndCannotRegress(t *testing.T) {
	db := testutil.OpenTestDB(t)
	categoryRepo := store.NewCategoryRepository(db)
	productRepo := store.NewProductRepository(db)
	orderRepo := store.NewOrderRepository(db)
	userID := createStoreTestUser(t, db)
	category, err := categoryRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("cancel_stock")})
	require.NoError(t, err)
	product, err := productRepo.Create(&models.Product{
		CategoryID: category.ID, Name: testutil.UniqueStr("cancel_stock_product"), Price: 100, Stock: 4, IsActive: true,
	})
	require.NoError(t, err)
	order, err := orderRepo.Create(
		&models.Order{UserID: &userID, TotalPrice: 200, Status: "pending"},
		[]*models.OrderItem{{ProductID: product.ID, Quantity: 2, Price: 100}},
	)
	require.NoError(t, err)
	_, err = orderRepo.AcceptWithStockCheck(order.ID)
	require.NoError(t, err)
	_, err = orderRepo.UpdateStatus(order.ID, "cancelled")
	require.NoError(t, err)
	_, err = orderRepo.UpdateStatus(order.ID, "cancelled")
	require.NoError(t, err)
	_, err = orderRepo.UpdateStatus(order.ID, "accepted")
	require.ErrorContains(t, err, "invalid order status transition")
	updated, err := productRepo.GetByID(product.ID)
	require.NoError(t, err)
	assert.Equal(t, 4, updated.Stock)

	var status string
	require.NoError(t, db.QueryRow(`SELECT status FROM orders WHERE id=$1`, order.ID).Scan(&status))
	assert.Equal(t, "cancelled", status, fmt.Sprintf("order %d must remain terminal", order.ID))
}

func TestConcurrentOrdersCannotReserveTheSameLastStock(t *testing.T) {
	db := testutil.OpenTestDB(t)
	categoryRepo := store.NewCategoryRepository(db)
	productRepo := store.NewProductRepository(db)
	orderRepo := store.NewOrderRepository(db)
	userID := createStoreTestUser(t, db)
	category, err := categoryRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("last_stock")})
	require.NoError(t, err)
	product, err := productRepo.Create(&models.Product{
		CategoryID: category.ID, Name: testutil.UniqueStr("last_stock_product"), Price: 100, Stock: 1, IsActive: true,
	})
	require.NoError(t, err)
	orders := make([]*models.Order, 2)
	for i := range orders {
		orders[i], err = orderRepo.Create(
			&models.Order{UserID: &userID, TotalPrice: 100, Status: "pending"},
			[]*models.OrderItem{{ProductID: product.ID, Quantity: 1, Price: 100}},
		)
		require.NoError(t, err)
	}

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for _, order := range orders {
		wg.Add(1)
		go func(orderID int64) {
			defer wg.Done()
			<-start
			_, acceptErr := orderRepo.AcceptWithStockCheck(orderID)
			errs <- acceptErr
		}(order.ID)
	}
	close(start)
	wg.Wait()
	close(errs)

	succeeded := 0
	failed := 0
	for err := range errs {
		if err == nil {
			succeeded++
		} else {
			assert.ErrorContains(t, err, "insufficient stock")
			failed++
		}
	}
	assert.Equal(t, 1, succeeded)
	assert.Equal(t, 1, failed)
	updated, err := productRepo.GetByID(product.ID)
	require.NoError(t, err)
	assert.Equal(t, 0, updated.Stock)
}

func TestFulfilmentEnqueueFailureRollsBackStockAndOrder(t *testing.T) {
	db := testutil.OpenTestDB(t)
	categoryRepo := store.NewCategoryRepository(db)
	productRepo := store.NewProductRepository(db)
	orderRepo := store.NewOrderRepository(db)
	userID := createStoreTestUser(t, db)
	category, err := categoryRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("enqueue_rollback")})
	require.NoError(t, err)
	product, err := productRepo.Create(&models.Product{
		CategoryID: category.ID, Name: testutil.UniqueStr("enqueue_rollback_product"), Price: 100,
		Stock: 1, IsActive: true, SpecialActions: `[{"type":"unsupported","value":"x"}]`,
	})
	require.NoError(t, err)
	order, err := orderRepo.Create(
		&models.Order{UserID: &userID, TotalPrice: 100, Status: "pending"},
		[]*models.OrderItem{{ProductID: product.ID, Quantity: 1, Price: 100}},
	)
	require.NoError(t, err)

	_, err = orderRepo.AcceptWithStockCheck(order.ID)
	require.ErrorContains(t, err, "unsupported product fulfilment")
	updatedProduct, err := productRepo.GetByID(product.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, updatedProduct.Stock)
	updatedOrder, err := orderRepo.GetByID(order.ID)
	require.NoError(t, err)
	assert.Equal(t, "pending", updatedOrder.Status)
	var fulfilments int
	require.NoError(t, db.QueryRow(`SELECT COUNT(*) FROM store_order_fulfilments WHERE order_id=$1`, order.ID).Scan(&fulfilments))
	assert.Zero(t, fulfilments)
}

func TestProviderPaymentEventIsIdempotentAndFinalizesReservedOrder(t *testing.T) {
	db := testutil.OpenTestDB(t)
	categoryRepo := store.NewCategoryRepository(db)
	productRepo := store.NewProductRepository(db)
	orderRepo := store.NewOrderRepository(db)
	paymentRepo := store.NewPaymentRepository(db)
	userID := createStoreTestUser(t, db)
	category, err := categoryRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("provider_event")})
	require.NoError(t, err)
	product, err := productRepo.Create(&models.Product{
		CategoryID: category.ID, Name: testutil.UniqueStr("provider_event_product"), Price: 300, Stock: 2, IsActive: true,
	})
	require.NoError(t, err)
	order, err := orderRepo.Create(
		&models.Order{UserID: &userID, TotalPrice: 300, Status: "pending"},
		[]*models.OrderItem{{ProductID: product.ID, Quantity: 1, Price: 300}},
	)
	require.NoError(t, err)
	_, err = orderRepo.AcceptWithStockCheck(order.ID)
	require.NoError(t, err)
	_, _, err = paymentRepo.CreateOnce(&models.Payment{
		OrderID: order.ID, UserID: userID, Provider: "stripe", ProviderRef: "pi_test_once",
		Amount: 300, Currency: "usd", Status: "processing",
	})
	require.NoError(t, err)

	svc := store.NewService(nil, productRepo, nil, orderRepo, nil, paymentRepo, nil, nil, nil, nil, nil, nil, nil, nil)
	event := &store.ProviderPaymentEvent{ID: "evt_test_once", ProviderRef: "pi_test_once", Status: "succeeded"}
	payment, created, err := svc.ApplyProviderPaymentEvent("stripe", event, "payload-hash")
	require.NoError(t, err)
	assert.True(t, created)
	assert.Equal(t, "succeeded", payment.Status)
	payment, created, err = svc.ApplyProviderPaymentEvent("stripe", event, "payload-hash")
	require.NoError(t, err)
	assert.False(t, created)
	assert.Equal(t, "succeeded", payment.Status)

	updatedOrder, err := orderRepo.GetByID(order.ID)
	require.NoError(t, err)
	assert.Equal(t, "paid", updatedOrder.Status)
	var eventCount int
	require.NoError(t, db.QueryRow(`SELECT COUNT(*) FROM store_payment_events WHERE provider_ref=$1`, event.ProviderRef).Scan(&eventCount))
	assert.Equal(t, 1, eventCount)
	var storedEventHash string
	require.NoError(t, db.QueryRow(`SELECT event_id_hash FROM store_payment_events WHERE provider_ref=$1`, event.ProviderRef).Scan(&storedEventHash))
	assert.NotEqual(t, event.ID, storedEventHash)

	_, _, err = svc.ApplyProviderPaymentEvent("stripe", event, "different-payload")
	require.ErrorIs(t, err, store.ErrIdempotencyConflict)
}
