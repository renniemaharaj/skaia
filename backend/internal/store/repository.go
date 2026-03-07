package store

import (
	"context"
	"database/sql"
	"errors"

	"github.com/skaia/backend/models"
)

// Category repository

type sqlCategoryRepository struct{ db *sql.DB }

func NewCategoryRepository(db *sql.DB) CategoryRepository {
	return &sqlCategoryRepository{db: db}
}

func (r *sqlCategoryRepository) GetByID(id int64) (*models.StoreCategory, error) {
	c := &models.StoreCategory{}
	err := r.db.QueryRow(
		`SELECT id, name, description, display_order, created_at FROM store_categories WHERE id = $1`, id,
	).Scan(&c.ID, &c.Name, &c.Description, &c.DisplayOrder, &c.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("category not found")
	}
	return c, err
}

func (r *sqlCategoryRepository) GetByName(name string) (*models.StoreCategory, error) {
	c := &models.StoreCategory{}
	err := r.db.QueryRow(
		`SELECT id, name, description, display_order, created_at FROM store_categories WHERE name = $1`, name,
	).Scan(&c.ID, &c.Name, &c.Description, &c.DisplayOrder, &c.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("category not found")
	}
	return c, err
}

func (r *sqlCategoryRepository) Create(cat *models.StoreCategory) (*models.StoreCategory, error) {
	err := r.db.QueryRow(
		`INSERT INTO store_categories (name, description, display_order)
		 VALUES ($1, $2, $3)
		 RETURNING id, name, description, display_order, created_at`,
		cat.Name, cat.Description, cat.DisplayOrder,
	).Scan(&cat.ID, &cat.Name, &cat.Description, &cat.DisplayOrder, &cat.CreatedAt)
	return cat, err
}

func (r *sqlCategoryRepository) Update(cat *models.StoreCategory) (*models.StoreCategory, error) {
	err := r.db.QueryRow(
		`UPDATE store_categories SET name=$1, description=$2, display_order=$3
		 WHERE id=$4
		 RETURNING id, name, description, display_order, created_at`,
		cat.Name, cat.Description, cat.DisplayOrder, cat.ID,
	).Scan(&cat.ID, &cat.Name, &cat.Description, &cat.DisplayOrder, &cat.CreatedAt)
	return cat, err
}

func (r *sqlCategoryRepository) Delete(id int64) error {
	// order_items.product_id has no ON DELETE CASCADE; clear them before products cascade away.
	if _, err := r.db.Exec(
		`DELETE FROM order_items WHERE product_id IN (SELECT id FROM products WHERE category_id = $1)`, id,
	); err != nil {
		return err
	}
	_, err := r.db.Exec(`DELETE FROM store_categories WHERE id = $1`, id)
	return err
}

func (r *sqlCategoryRepository) List() ([]*models.StoreCategory, error) {
	rows, err := r.db.Query(
		`SELECT id, name, description, display_order, created_at FROM store_categories ORDER BY display_order ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []*models.StoreCategory
	for rows.Next() {
		c := &models.StoreCategory{}
		if err := rows.Scan(&c.ID, &c.Name, &c.Description, &c.DisplayOrder, &c.CreatedAt); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, rows.Err()
}

// Product repository

type sqlProductRepository struct{ db *sql.DB }

func NewProductRepository(db *sql.DB) ProductRepository {
	return &sqlProductRepository{db: db}
}

func (r *sqlProductRepository) GetByID(id int64) (*models.Product, error) {
	p := &models.Product{}
	err := r.db.QueryRow(
		`SELECT id, category_id, name, description, price, image_url, stock, original_price, stock_unlimited, is_active, created_at, updated_at
		 FROM products WHERE id = $1`, id,
	).Scan(&p.ID, &p.CategoryID, &p.Name, &p.Description, &p.Price, &p.ImageURL, &p.Stock, &p.OriginalPrice, &p.StockUnlimited, &p.IsActive, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("product not found")
	}
	return p, err
}

func (r *sqlProductRepository) GetByCategory(categoryID int64, limit, offset int) ([]*models.Product, error) {
	rows, err := r.db.Query(
		`SELECT id, category_id, name, description, price, image_url, stock, original_price, stock_unlimited, is_active, created_at, updated_at
		 FROM products WHERE category_id = $1 AND is_active = true
		 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		categoryID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanProducts(rows)
}

func (r *sqlProductRepository) Create(p *models.Product) (*models.Product, error) {
	err := r.db.QueryRow(
		`INSERT INTO products (category_id, name, description, price, image_url, stock, stock_unlimited, is_active)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, category_id, name, description, price, image_url, stock, original_price, stock_unlimited, is_active, created_at, updated_at`,
		p.CategoryID, p.Name, p.Description, p.Price, p.ImageURL, p.Stock, p.StockUnlimited, p.IsActive,
	).Scan(&p.ID, &p.CategoryID, &p.Name, &p.Description, &p.Price, &p.ImageURL, &p.Stock, &p.OriginalPrice, &p.StockUnlimited, &p.IsActive, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

func (r *sqlProductRepository) Update(p *models.Product) (*models.Product, error) {
	err := r.db.QueryRow(
		`UPDATE products SET category_id=$1, name=$2, description=$3, price=$4, image_url=$5, stock=$6, original_price=$7, stock_unlimited=$8, is_active=$9, updated_at=CURRENT_TIMESTAMP
		 WHERE id=$10
		 RETURNING id, category_id, name, description, price, image_url, stock, original_price, stock_unlimited, is_active, created_at, updated_at`,
		p.CategoryID, p.Name, p.Description, p.Price, p.ImageURL, p.Stock, p.OriginalPrice, p.StockUnlimited, p.IsActive, p.ID,
	).Scan(&p.ID, &p.CategoryID, &p.Name, &p.Description, &p.Price, &p.ImageURL, &p.Stock, &p.OriginalPrice, &p.StockUnlimited, &p.IsActive, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

func (r *sqlProductRepository) Delete(id int64) error {
	// order_items.product_id has no ON DELETE CASCADE; clear referencing rows first.
	if _, err := r.db.Exec(`DELETE FROM order_items WHERE product_id = $1`, id); err != nil {
		return err
	}
	_, err := r.db.Exec(`DELETE FROM products WHERE id = $1`, id)
	return err
}

func (r *sqlProductRepository) List(limit, offset int) ([]*models.Product, error) {
	rows, err := r.db.Query(
		`SELECT id, category_id, name, description, price, image_url, stock, original_price, stock_unlimited, is_active, created_at, updated_at
		 FROM products ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
		limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanProducts(rows)
}

func scanProducts(rows *sql.Rows) ([]*models.Product, error) {
	var products []*models.Product
	for rows.Next() {
		p := &models.Product{}
		if err := rows.Scan(&p.ID, &p.CategoryID, &p.Name, &p.Description, &p.Price, &p.ImageURL, &p.Stock, &p.OriginalPrice, &p.StockUnlimited, &p.IsActive, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		products = append(products, p)
	}
	return products, rows.Err()
}

// Cart repository

type sqlCartRepository struct{ db *sql.DB }

func NewCartRepository(db *sql.DB) CartRepository {
	return &sqlCartRepository{db: db}
}

func (r *sqlCartRepository) GetItem(userID, productID int64) (*models.CartItem, error) {
	item := &models.CartItem{}
	err := r.db.QueryRow(
		`SELECT id, user_id, product_id, quantity, added_at FROM cart_items WHERE user_id = $1 AND product_id = $2`,
		userID, productID,
	).Scan(&item.ID, &item.UserID, &item.ProductID, &item.Quantity, &item.AddedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("cart item not found")
	}
	return item, err
}

func (r *sqlCartRepository) GetUserCart(userID int64) ([]*models.CartItem, error) {
	rows, err := r.db.Query(
		`SELECT id, user_id, product_id, quantity, added_at FROM cart_items WHERE user_id = $1 ORDER BY added_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*models.CartItem
	for rows.Next() {
		item := &models.CartItem{}
		if err := rows.Scan(&item.ID, &item.UserID, &item.ProductID, &item.Quantity, &item.AddedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *sqlCartRepository) AddToCart(userID, productID int64, quantity int) (*models.CartItem, error) {
	item := &models.CartItem{}
	err := r.db.QueryRow(
		`INSERT INTO cart_items (user_id, product_id, quantity)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
		 RETURNING id, user_id, product_id, quantity, added_at`,
		userID, productID, quantity,
	).Scan(&item.ID, &item.UserID, &item.ProductID, &item.Quantity, &item.AddedAt)
	return item, err
}

func (r *sqlCartRepository) UpdateItem(userID, productID int64, quantity int) (*models.CartItem, error) {
	item := &models.CartItem{}
	err := r.db.QueryRow(
		`UPDATE cart_items SET quantity=$1 WHERE user_id=$2 AND product_id=$3
		 RETURNING id, user_id, product_id, quantity, added_at`,
		quantity, userID, productID,
	).Scan(&item.ID, &item.UserID, &item.ProductID, &item.Quantity, &item.AddedAt)
	return item, err
}

func (r *sqlCartRepository) RemoveFromCart(userID, productID int64) error {
	_, err := r.db.Exec(`DELETE FROM cart_items WHERE user_id=$1 AND product_id=$2`, userID, productID)
	return err
}

func (r *sqlCartRepository) ClearCart(userID int64) error {
	_, err := r.db.Exec(`DELETE FROM cart_items WHERE user_id=$1`, userID)
	return err
}

// Order repository

type sqlOrderRepository struct{ db *sql.DB }

func NewOrderRepository(db *sql.DB) OrderRepository {
	return &sqlOrderRepository{db: db}
}

func (r *sqlOrderRepository) Create(order *models.Order, items []*models.OrderItem) (*models.Order, error) {
	tx, err := r.db.BeginTx(context.Background(), nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback() //nolint:errcheck

	err = tx.QueryRow(
		`INSERT INTO orders (user_id, total_price, status)
		 VALUES ($1, $2, $3)
		 RETURNING id, user_id, total_price, status, created_at, updated_at`,
		order.UserID, order.TotalPrice, order.Status,
	).Scan(&order.ID, &order.UserID, &order.TotalPrice, &order.Status, &order.CreatedAt, &order.UpdatedAt)
	if err != nil {
		return nil, err
	}

	for _, item := range items {
		item.OrderID = order.ID
		_, err := tx.Exec(
			`INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)`,
			item.OrderID, item.ProductID, item.Quantity, item.Price,
		)
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return order, nil
}

func (r *sqlOrderRepository) GetByID(id int64) (*models.Order, error) {
	o := &models.Order{}
	err := r.db.QueryRow(
		`SELECT id, user_id, total_price, status, created_at, updated_at FROM orders WHERE id = $1`, id,
	).Scan(&o.ID, &o.UserID, &o.TotalPrice, &o.Status, &o.CreatedAt, &o.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("order not found")
	}
	return o, err
}

func (r *sqlOrderRepository) GetByUser(userID int64, limit, offset int) ([]*models.Order, error) {
	rows, err := r.db.Query(
		`SELECT id, user_id, total_price, status, created_at, updated_at
		 FROM orders WHERE user_id = $1
		 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		userID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []*models.Order
	for rows.Next() {
		o := &models.Order{}
		if err := rows.Scan(&o.ID, &o.UserID, &o.TotalPrice, &o.Status, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	return orders, rows.Err()
}

func (r *sqlOrderRepository) UpdateStatus(id int64, status string) (*models.Order, error) {
	o := &models.Order{}
	err := r.db.QueryRow(
		`UPDATE orders SET status=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2
		 RETURNING id, user_id, total_price, status, created_at, updated_at`,
		status, id,
	).Scan(&o.ID, &o.UserID, &o.TotalPrice, &o.Status, &o.CreatedAt, &o.UpdatedAt)
	return o, err
}

// Payment repository

type sqlPaymentRepository struct{ db *sql.DB }

func NewPaymentRepository(db *sql.DB) PaymentRepository {
	return &sqlPaymentRepository{db: db}
}

func (r *sqlPaymentRepository) Create(p *models.Payment) (*models.Payment, error) {
	err := r.db.QueryRow(
		`INSERT INTO payments (order_id, user_id, provider, provider_ref, amount, currency, status, failure_reason)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, order_id, user_id, provider, provider_ref, amount, currency, status, failure_reason, created_at, updated_at`,
		p.OrderID, p.UserID, p.Provider, p.ProviderRef, p.Amount, p.Currency, p.Status, p.FailureReason,
	).Scan(&p.ID, &p.OrderID, &p.UserID, &p.Provider, &p.ProviderRef, &p.Amount, &p.Currency, &p.Status, &p.FailureReason, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

func (r *sqlPaymentRepository) GetByOrderID(orderID int64) (*models.Payment, error) {
	p := &models.Payment{}
	err := r.db.QueryRow(
		`SELECT id, order_id, user_id, provider, provider_ref, amount, currency, status, failure_reason, created_at, updated_at
		 FROM payments WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1`, orderID,
	).Scan(&p.ID, &p.OrderID, &p.UserID, &p.Provider, &p.ProviderRef, &p.Amount, &p.Currency, &p.Status, &p.FailureReason, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("payment not found")
	}
	return p, err
}

func (r *sqlPaymentRepository) UpdateStatus(id int64, status, failureReason string) (*models.Payment, error) {
	p := &models.Payment{}
	err := r.db.QueryRow(
		`UPDATE payments SET status=$1, failure_reason=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3
		 RETURNING id, order_id, user_id, provider, provider_ref, amount, currency, status, failure_reason, created_at, updated_at`,
		status, failureReason, id,
	).Scan(&p.ID, &p.OrderID, &p.UserID, &p.Provider, &p.ProviderRef, &p.Amount, &p.Currency, &p.Status, &p.FailureReason, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}
