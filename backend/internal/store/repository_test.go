package store_test

import (
	"database/sql"
	"testing"

	_ "github.com/lib/pq"
	"github.com/skaia/backend/internal/store"
	"github.com/skaia/backend/internal/testutil"
	"github.com/skaia/backend/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- Category tests ---

func TestStoreCategoryRepository_CreateAndGet(t *testing.T) {
	db := testutil.OpenTestDB(t)
	repo := store.NewCategoryRepository(db)

	cat, err := repo.Create(&models.StoreCategory{
		Name:        testutil.UniqueStr("Electronics"),
		Description: "Electronic products",
	})
	require.NoError(t, err)
	require.NotZero(t, cat.ID)

	fetched, err := repo.GetByID(cat.ID)
	require.NoError(t, err)
	assert.Equal(t, cat.Name, fetched.Name)
}

func TestStoreCategoryRepository_List(t *testing.T) {
	db := testutil.OpenTestDB(t)
	repo := store.NewCategoryRepository(db)

	for i := 0; i < 2; i++ {
		_, err := repo.Create(&models.StoreCategory{Name: testutil.UniqueStr("scat")})
		require.NoError(t, err)
	}

	cats, err := repo.List()
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(cats), 2)
}

func TestStoreCategoryRepository_Delete(t *testing.T) {
	db := testutil.OpenTestDB(t)
	repo := store.NewCategoryRepository(db)

	cat, err := repo.Create(&models.StoreCategory{Name: testutil.UniqueStr("del_scat")})
	require.NoError(t, err)

	require.NoError(t, repo.Delete(cat.ID))

	_, err = repo.GetByID(cat.ID)
	require.Error(t, err)
}

// --- Product tests ---

func TestProductRepository_CreateAndGet(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)

	cat, err := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("pcat")})
	require.NoError(t, err)

	p, err := prodRepo.Create(&models.Product{
		CategoryID:  cat.ID,
		Name:        testutil.UniqueStr("Widget"),
		Description: "A fine widget",
		Price:       999,
		Stock:       50,
		IsActive:    true,
	})
	require.NoError(t, err)
	require.NotZero(t, p.ID)

	fetched, err := prodRepo.GetByID(p.ID)
	require.NoError(t, err)
	assert.Equal(t, p.Name, fetched.Name)
	assert.Equal(t, int64(999), fetched.Price)
}

func TestProductRepository_List(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)

	cat, err := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("listpcat")})
	require.NoError(t, err)

	for i := 0; i < 3; i++ {
		_, err := prodRepo.Create(&models.Product{
			CategoryID: cat.ID,
			Name:       testutil.UniqueStr("prod"),
			Price:      100,
			IsActive:   true,
		})
		require.NoError(t, err)
	}

	products, err := prodRepo.List(100, 0)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(products), 3)
}

func TestProductRepository_Update(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)

	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("upcat")})
	p, err := prodRepo.Create(&models.Product{
		CategoryID: cat.ID,
		Name:       testutil.UniqueStr("updateme"),
		Price:      500,
		IsActive:   true,
	})
	require.NoError(t, err)

	p.Price = 1250
	updated, err := prodRepo.Update(p)
	require.NoError(t, err)
	assert.Equal(t, int64(1250), updated.Price)
}

// --- Cart tests ---

func TestCartRepository_AddAndGet(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)
	cartRepo := store.NewCartRepository(db)
	uid := createStoreTestUser(t, db)

	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("cartcat")})
	prod, _ := prodRepo.Create(&models.Product{
		CategoryID: cat.ID,
		Name:       testutil.UniqueStr("cartprod"),
		Price:      300,
		IsActive:   true,
	})

	item, err := cartRepo.AddToCart(uid, prod.ID, 2)
	require.NoError(t, err)
	assert.Equal(t, 2, item.Quantity)

	cart, err := cartRepo.GetUserCart(uid)
	require.NoError(t, err)
	require.Len(t, cart, 1)
	assert.Equal(t, prod.ID, cart[0].ProductID)
}

func TestCartRepository_AddToCart_Upsert(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)
	cartRepo := store.NewCartRepository(db)
	uid := createStoreTestUser(t, db)

	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("upscat")})
	prod, _ := prodRepo.Create(&models.Product{
		CategoryID: cat.ID,
		Name:       testutil.UniqueStr("upsprod"),
		Price:      100,
		IsActive:   true,
	})

	_, err := cartRepo.AddToCart(uid, prod.ID, 1)
	require.NoError(t, err)
	item, err := cartRepo.AddToCart(uid, prod.ID, 2)
	require.NoError(t, err)
	// ON CONFLICT adds quantities: 1+2=3
	assert.Equal(t, 3, item.Quantity)
}

func TestCartRepository_RemoveFromCart(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)
	cartRepo := store.NewCartRepository(db)
	uid := createStoreTestUser(t, db)

	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("rmcat")})
	prod, _ := prodRepo.Create(&models.Product{
		CategoryID: cat.ID,
		Name:       testutil.UniqueStr("rmprod"),
		Price:      100,
		IsActive:   true,
	})

	_, err := cartRepo.AddToCart(uid, prod.ID, 1)
	require.NoError(t, err)

	require.NoError(t, cartRepo.RemoveFromCart(uid, prod.ID))

	cart, err := cartRepo.GetUserCart(uid)
	require.NoError(t, err)
	assert.Empty(t, cart)
}

// --- Order tests ---

func TestOrderRepository_CreateAndGet(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)
	orderRepo := store.NewOrderRepository(db)
	uid := createStoreTestUser(t, db)

	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("ordcat")})
	prod, _ := prodRepo.Create(&models.Product{
		CategoryID: cat.ID,
		Name:       testutil.UniqueStr("ordprod"),
		Price:      1000,
		IsActive:   true,
	})

	order, err := orderRepo.Create(&models.Order{
		UserID:     uid,
		TotalPrice: 2000,
		Status:     "pending",
	}, []*models.OrderItem{
		{ProductID: prod.ID, Quantity: 2, Price: 1000},
	})
	require.NoError(t, err)
	require.NotZero(t, order.ID)
	assert.Equal(t, "pending", order.Status)

	fetched, err := orderRepo.GetByID(order.ID)
	require.NoError(t, err)
	assert.Equal(t, order.ID, fetched.ID)
}

func TestOrderRepository_UpdateStatus(t *testing.T) {
	db := testutil.OpenTestDB(t)
	catRepo := store.NewCategoryRepository(db)
	prodRepo := store.NewProductRepository(db)
	orderRepo := store.NewOrderRepository(db)
	uid := createStoreTestUser(t, db)

	cat, _ := catRepo.Create(&models.StoreCategory{Name: testutil.UniqueStr("stcat")})
	prod, _ := prodRepo.Create(&models.Product{
		CategoryID: cat.ID,
		Name:       testutil.UniqueStr("stprod"),
		Price:      500,
		IsActive:   true,
	})

	order, _ := orderRepo.Create(&models.Order{
		UserID:     uid,
		TotalPrice: 500,
		Status:     "pending",
	}, []*models.OrderItem{
		{ProductID: prod.ID, Quantity: 1, Price: 500},
	})

	updated, err := orderRepo.UpdateStatus(order.ID, "completed")
	require.NoError(t, err)
	assert.Equal(t, "completed", updated.Status)
}

// createStoreTestUser inserts a minimal user row and returns its ID.
func createStoreTestUser(t *testing.T, db *sql.DB) int64 {
	t.Helper()
	name := testutil.UniqueStr("store_user")
	var id int64
	err := db.QueryRow(
		`INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id`,
		name, name+"@example.com", "hash",
	).Scan(&id)
	require.NoError(t, err)
	return id
}
