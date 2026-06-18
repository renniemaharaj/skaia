package store_test

import (
	"testing"

	"github.com/skaia/backend/internal/store"
	"github.com/skaia/backend/internal/testutil"
	"github.com/skaia/backend/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// StoreCategoryRepository extra

func TestStoreCategoryRepository_GetByName(t *testing.T) {
	db := testutil.OpenTestDB(t)
	repo := store.NewCategoryRepository(db)
	name := testutil.UniqueStr("getbyname_cat")
	cat, err := repo.Create(&models.StoreCategory{Name: name, Description: "desc"})
	require.NoError(t, err)
	fetched, err := repo.GetByName(name)
	require.NoError(t, err)
	assert.Equal(t, cat.ID, fetched.ID)
	assert.Equal(t, name, fetched.Name)
}

func TestStoreCategoryRepository_Update(t *testing.T) {
	db := testutil.OpenTestDB(t)
	repo := store.NewCategoryRepository(db)
	name := testutil.UniqueStr("update_scat")
	cat, err := repo.Create(&models.StoreCategory{Name: name})
	require.NoError(t, err)
	cat.Description = "Updated store category description"
	updated, err := repo.Update(cat)
	require.NoError(t, err)
	assert.Equal(t, "Updated store category description", updated.Description)
	fetched, err := repo.GetByID(cat.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated store category description", fetched.Description)
}

// ProductRepository extra

func TestProductRepository_Delete(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)
	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("del_pcat")})
	p, err := prodRepo.Create(&models.Product{
		CategoryID: cat.ID,
		Name:       testutil.UniqueStr("del_prod"),
		Price:      100,
		IsActive:   true,
	})
	require.NoError(t, err)
	require.NoError(t, prodRepo.Delete(p.ID))
	_, err = prodRepo.GetByID(p.ID)
	require.Error(t, err, "deleted product must not be retrievable")
}

func TestProductRepository_GetByCategory(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)
	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("getbycat_cat")})
	other, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("other_cat")})
	// Add 3 products in cat and 1 in other.
	for i := 0; i < 3; i++ {
		_, err := prodRepo.Create(&models.Product{
			CategoryID: cat.ID,
			Name:       testutil.UniqueStr("catprod"),
			Price:      100,
			IsActive:   true,
		})
		require.NoError(t, err)
	}
	_, err := prodRepo.Create(&models.Product{
		CategoryID: other.ID,
		Name:       testutil.UniqueStr("otherprod"),
		Price:      100,
		IsActive:   true,
	})
	require.NoError(t, err)
	products, err := prodRepo.GetByCategory(cat.ID, 10, 0)
	require.NoError(t, err)
	assert.Len(t, products, 3)
	for _, p := range products {
		assert.Equal(t, cat.ID, p.CategoryID)
	}
	// Other category must only have that 1 product.
	others, err := prodRepo.GetByCategory(other.ID, 10, 0)
	require.NoError(t, err)
	assert.Len(t, others, 1)
}

func TestProductRepository_GetByCategory_Pagination(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)
	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("pag_pcat")})
	for i := 0; i < 5; i++ {
		_, err := prodRepo.Create(&models.Product{
			CategoryID: cat.ID, Name: testutil.UniqueStr("pag_prod"),
			Price: 100, IsActive: true,
		})
		require.NoError(t, err)
	}
	p1, err := prodRepo.GetByCategory(cat.ID, 2, 0)
	require.NoError(t, err)
	assert.Len(t, p1, 2)
	p2, err := prodRepo.GetByCategory(cat.ID, 2, 2)
	require.NoError(t, err)
	assert.Len(t, p2, 2)
	ids := make(map[int64]bool)
	for _, p := range p1 {
		ids[p.ID] = true
	}
	for _, p := range p2 {
		assert.False(t, ids[p.ID], "product %d appeared on both pages", p.ID)
	}
}

// CartRepository extra

func TestCartRepository_GetItem(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)
	cartRepo := store.NewCartRepository(db)
	uid := createStoreTestUser(t, db)
	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("gi_cat")})
	prod, _ := prodRepo.Create(&models.Product{
		CategoryID: cat.ID, Name: testutil.UniqueStr("gi_prod"),
		Price: 200, IsActive: true,
	})
	_, err := cartRepo.AddToCart(uid, prod.ID, 3)
	require.NoError(t, err)
	item, err := cartRepo.GetItem(uid, prod.ID)
	require.NoError(t, err)
	assert.Equal(t, 3, item.Quantity)
	assert.Equal(t, prod.ID, item.ProductID)
	assert.Equal(t, uid, item.UserID)
}

func TestCartRepository_UpdateItem(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)
	cartRepo := store.NewCartRepository(db)
	uid := createStoreTestUser(t, db)
	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("ui_cat")})
	prod, _ := prodRepo.Create(&models.Product{
		CategoryID: cat.ID, Name: testutil.UniqueStr("ui_prod"),
		Price: 300, IsActive: true,
	})
	_, err := cartRepo.AddToCart(uid, prod.ID, 5)
	require.NoError(t, err)
	updated, err := cartRepo.UpdateItem(uid, prod.ID, 2)
	require.NoError(t, err)
	assert.Equal(t, 2, updated.Quantity)
	// Verify via GetItem.
	item, err := cartRepo.GetItem(uid, prod.ID)
	require.NoError(t, err)
	assert.Equal(t, 2, item.Quantity)
}

func TestCartRepository_ClearCart(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)
	cartRepo := store.NewCartRepository(db)
	uid := createStoreTestUser(t, db)
	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("cc_cat")})
	for i := 0; i < 3; i++ {
		prod, _ := prodRepo.Create(&models.Product{
			CategoryID: cat.ID, Name: testutil.UniqueStr("cc_prod"),
			Price: 100, IsActive: true,
		})
		_, err := cartRepo.AddToCart(uid, prod.ID, 1)
		require.NoError(t, err)
	}
	cart, err := cartRepo.GetUserCart(uid)
	require.NoError(t, err)
	require.Len(t, cart, 3)
	// Clear.
	require.NoError(t, cartRepo.ClearCart(uid))
	empty, err := cartRepo.GetUserCart(uid)
	require.NoError(t, err)
	assert.Empty(t, empty, "cart must be empty after ClearCart")
}

func TestCartRepository_GetItem_NotFound(t *testing.T) {
	db := testutil.OpenTestDB(t)
	cartRepo := store.NewCartRepository(db)
	uid := createStoreTestUser(t, db)
	// Accessing an item that doesn't exist must return an error.
	_, err := cartRepo.GetItem(uid, 999999999)
	assert.Error(t, err, "GetItem for nonexistent entry must return an error")
}

func TestCheckout_CashOnDeliveryClearsPersistedCart(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)
	cartRepo := store.NewCartRepository(db)
	orderRepo := store.NewOrderRepository(db)
	paymentRepo := store.NewPaymentRepository(db)
	uid := createStoreTestUser(t, db)

	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("cod_cat")})
	prod, err := prodRepo.Create(&models.Product{
		CategoryID: cat.ID,
		Name:       testutil.UniqueStr("cod_prod"),
		Price:      1200,
		Stock:      5,
		IsActive:   true,
	})
	require.NoError(t, err)
	_, err = cartRepo.AddToCart(uid, prod.ID, 2)
	require.NoError(t, err)

	svc := store.NewService(nil, prodRepo, cartRepo, orderRepo, nil, paymentRepo, nil, nil, nil, nil, nil, nil, nil, nil)
	resp, err := svc.Checkout(uid, &models.CheckoutRequest{
		Items: []models.CheckoutItem{{
			ProductID: prod.ID,
			Quantity:  2,
		}},
		PaymentMethodID: "delivery_cash",
		Currency:        "usd",
	})
	require.NoError(t, err)
	require.NotNil(t, resp.Order)
	assert.Equal(t, "pending", resp.Order.Status)

	cart, err := cartRepo.GetUserCart(uid)
	require.NoError(t, err)
	assert.Empty(t, cart)
}

// OrderRepository extra

func TestOrderRepository_GetByUser(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)
	orderRepo := store.NewOrderRepository(db)
	uid := createStoreTestUser(t, db)
	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("gbu_cat")})
	prod, _ := prodRepo.Create(&models.Product{
		CategoryID: cat.ID, Name: testutil.UniqueStr("gbu_prod"),
		Price: 500, IsActive: true,
	})
	// Create 3 orders.
	for i := 0; i < 3; i++ {
		_, err := orderRepo.Create(
			&models.Order{UserID: &uid, TotalPrice: 500, Status: "pending"},
			[]*models.OrderItem{{ProductID: prod.ID, Quantity: 1, Price: 5.0}},
		)
		require.NoError(t, err)
	}
	orders, err := orderRepo.GetByUser(uid, 10, 0)
	require.NoError(t, err)
	assert.Len(t, orders, 3)
	for _, o := range orders {
		assert.Equal(t, uid, *o.UserID)
	}
}

func TestOrderRepository_GetByUser_Pagination(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)
	orderRepo := store.NewOrderRepository(db)
	uid := createStoreTestUser(t, db)
	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("opag_cat")})
	prod, _ := prodRepo.Create(&models.Product{
		CategoryID: cat.ID, Name: testutil.UniqueStr("opag_prod"),
		Price: 100, IsActive: true,
	})
	for i := 0; i < 5; i++ {
		_, err := orderRepo.Create(
			&models.Order{UserID: &uid, TotalPrice: 100, Status: "pending"},
			[]*models.OrderItem{{ProductID: prod.ID, Quantity: 1, Price: 1.0}},
		)
		require.NoError(t, err)
	}
	p1, err := orderRepo.GetByUser(uid, 2, 0)
	require.NoError(t, err)
	assert.Len(t, p1, 2)
	p2, err := orderRepo.GetByUser(uid, 2, 2)
	require.NoError(t, err)
	assert.Len(t, p2, 2)
	ids := make(map[int64]bool)
	for _, o := range p1 {
		ids[o.ID] = true
	}
	for _, o := range p2 {
		assert.False(t, ids[o.ID], "order %d appeared on both pages", o.ID)
	}
}

func TestOrderRepository_UpdateStatus_AllTransitions(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)
	orderRepo := store.NewOrderRepository(db)
	uid := createStoreTestUser(t, db)
	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("trans_cat")})
	prod, _ := prodRepo.Create(&models.Product{
		CategoryID: cat.ID, Name: testutil.UniqueStr("trans_prod"),
		Price: 100, IsActive: true,
	})
	order, err := orderRepo.Create(
		&models.Order{UserID: &uid, TotalPrice: 100, Status: "pending"},
		[]*models.OrderItem{{ProductID: prod.ID, Quantity: 1, Price: 1.0}},
	)
	require.NoError(t, err)
	assert.Equal(t, "pending", order.Status)
	for _, status := range []string{"completed", "cancelled"} {
		updated, err := orderRepo.UpdateStatus(order.ID, status)
		require.NoError(t, err)
		assert.Equal(t, status, updated.Status)
		fetched, err := orderRepo.GetByID(order.ID)
		require.NoError(t, err)
		assert.Equal(t, status, fetched.Status)
	}
}

func TestOrderRepository_AcceptWithStockCheck_DecrementsStockOnce(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)
	orderRepo := store.NewOrderRepository(db)
	uid := createStoreTestUser(t, db)
	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("accept_cat")})
	prod, err := prodRepo.Create(&models.Product{
		CategoryID: cat.ID, Name: testutil.UniqueStr("accept_prod"),
		Price: 100, Stock: 3, IsActive: true,
	})
	require.NoError(t, err)
	order, err := orderRepo.Create(
		&models.Order{UserID: &uid, TotalPrice: 200, Status: "pending"},
		[]*models.OrderItem{{ProductID: prod.ID, Quantity: 2, Price: 100}},
	)
	require.NoError(t, err)

	accepted, err := orderRepo.AcceptWithStockCheck(order.ID)
	require.NoError(t, err)
	assert.Equal(t, "accepted", accepted.Status)
	updatedProd, err := prodRepo.GetByID(prod.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, updatedProd.Stock)

	accepted, err = orderRepo.AcceptWithStockCheck(order.ID)
	require.NoError(t, err)
	assert.Equal(t, "accepted", accepted.Status)
	updatedProd, err = prodRepo.GetByID(prod.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, updatedProd.Stock, "accepting an already accepted order must not decrement stock again")
}

func TestOrderRepository_UpdateVendorStatus_IsolatesVendorLinesAndStock(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)
	orderRepo := store.NewOrderRepository(db)
	buyerID := createStoreTestUser(t, db)
	vendorAID := createStoreTestUser(t, db)
	vendorBID := createStoreTestUser(t, db)
	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("vendor_order_cat")})
	prodA, err := prodRepo.Create(&models.Product{
		CategoryID: cat.ID,
		OwnerID:    &vendorAID,
		Name:       testutil.UniqueStr("vendor_order_a"),
		Price:      100,
		Stock:      5,
		IsActive:   true,
	})
	require.NoError(t, err)
	prodB, err := prodRepo.Create(&models.Product{
		CategoryID: cat.ID,
		OwnerID:    &vendorBID,
		Name:       testutil.UniqueStr("vendor_order_b"),
		Price:      200,
		Stock:      7,
		IsActive:   true,
	})
	require.NoError(t, err)
	order, err := orderRepo.Create(
		&models.Order{UserID: &buyerID, TotalPrice: 400, Status: "pending"},
		[]*models.OrderItem{
			{ProductID: prodA.ID, Quantity: 2, Price: 100},
			{ProductID: prodB.ID, Quantity: 1, Price: 200},
		},
	)
	require.NoError(t, err)

	updated, err := orderRepo.UpdateVendorStatus(order.ID, vendorAID, "accepted", "ready")
	require.NoError(t, err)
	assert.Equal(t, "vendor_review", updated.Status)
	require.Len(t, updated.Vendors, 2)
	assertVendorStatus(t, updated, vendorAID, "accepted")
	assertVendorStatus(t, updated, vendorBID, "pending")
	refetchedA, err := prodRepo.GetByID(prodA.ID)
	require.NoError(t, err)
	refetchedB, err := prodRepo.GetByID(prodB.ID)
	require.NoError(t, err)
	assert.Equal(t, 3, refetchedA.Stock)
	assert.Equal(t, 7, refetchedB.Stock)

	updated, err = orderRepo.UpdateVendorStatus(order.ID, vendorBID, "rejected", "not available")
	require.NoError(t, err)
	assert.Equal(t, "vendor_review", updated.Status)
	assertVendorStatus(t, updated, vendorAID, "accepted")
	assertVendorStatus(t, updated, vendorBID, "rejected")
	refetchedA, err = prodRepo.GetByID(prodA.ID)
	require.NoError(t, err)
	refetchedB, err = prodRepo.GetByID(prodB.ID)
	require.NoError(t, err)
	assert.Equal(t, 3, refetchedA.Stock)
	assert.Equal(t, 7, refetchedB.Stock)

	updated, err = orderRepo.UpdateVendorStatus(order.ID, vendorAID, "rejected", "cannot fulfill")
	require.NoError(t, err)
	assert.Equal(t, "rejected", updated.Status)
	assertVendorStatus(t, updated, vendorAID, "rejected")
	refetchedA, err = prodRepo.GetByID(prodA.ID)
	require.NoError(t, err)
	assert.Equal(t, 5, refetchedA.Stock)
}

func assertVendorStatus(t *testing.T, order *models.Order, vendorID int64, status string) {
	t.Helper()
	for _, vendor := range order.Vendors {
		if vendor.VendorID == vendorID {
			assert.Equal(t, status, vendor.Status)
			return
		}
	}
	t.Fatalf("vendor %d not found in order %d", vendorID, order.ID)
}

func TestOrderRepository_AcceptWithStockCheck_RejectsInsufficientStock(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)
	orderRepo := store.NewOrderRepository(db)
	uid := createStoreTestUser(t, db)
	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("accept_low_cat")})
	prod, err := prodRepo.Create(&models.Product{
		CategoryID: cat.ID, Name: testutil.UniqueStr("accept_low_prod"),
		Price: 100, Stock: 1, IsActive: true,
	})
	require.NoError(t, err)
	order, err := orderRepo.Create(
		&models.Order{UserID: &uid, TotalPrice: 200, Status: "pending"},
		[]*models.OrderItem{{ProductID: prod.ID, Quantity: 2, Price: 100}},
	)
	require.NoError(t, err)

	_, err = orderRepo.AcceptWithStockCheck(order.ID)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "insufficient stock")
	fetchedOrder, err := orderRepo.GetByID(order.ID)
	require.NoError(t, err)
	assert.Equal(t, "pending", fetchedOrder.Status)
	updatedProd, err := prodRepo.GetByID(prod.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, updatedProd.Stock)
}
