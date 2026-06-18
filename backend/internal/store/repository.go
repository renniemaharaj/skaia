package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/skaia/backend/database"
	"github.com/skaia/backend/models"
)

// Category repository

type sqlCategoryRepository struct{ db database.Executor }

func NewCategoryRepository(db database.Executor) CategoryRepository {
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

type sqlProductRepository struct{ db database.Executor }

func NewProductRepository(db database.Executor) ProductRepository {
	return &sqlProductRepository{db: db}
}

const productSelectFields = `
	p.id, p.category_id, p.owner_id,
	p.name, p.description, p.price, COALESCE(p.image_url, ''),
	p.stock, p.original_price, p.stock_unlimited, p.is_active,
	COALESCE(p.special_actions, '[]'::jsonb)::text,
	COALESCE(p.media, '[]'::jsonb)::text,
	p.created_at, p.updated_at,
	COALESCE(owner.id, 0), COALESCE(owner.display_name, ''), COALESCE(owner.avatar_url, ''),
	COALESCE((
		SELECT SUM(oi.quantity)::int
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		WHERE oi.product_id = p.id AND o.status IN ('accepted', 'paid', 'completed')
	), 0),
	COALESCE((
		SELECT SUM(oi.quantity)::int
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		WHERE oi.product_id = p.id AND o.status NOT IN ('completed', 'failed', 'cancelled')
	), 0)`

func (r *sqlProductRepository) GetByID(id int64) (*models.Product, error) {
	rows, err := r.db.Query(
		`SELECT `+productSelectFields+`
		 FROM products p
		 LEFT JOIN users owner ON owner.id = p.owner_id
		 WHERE p.id = $1`, id,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	products, err := scanProducts(rows)
	if err != nil {
		return nil, err
	}
	if len(products) == 0 {
		return nil, errors.New("product not found")
	}
	return products[0], nil
}

func productMediaJSON(media []models.ProductMedia) string {
	if media == nil {
		media = []models.ProductMedia{}
	}
	b, err := json.Marshal(media)
	if err != nil {
		return "[]"
	}
	return string(b)
}

func normalizeProductMedia(p *models.Product) {
	if p.Media == nil {
		p.Media = []models.ProductMedia{}
	}
	if p.ImageURL == "" && len(p.Media) > 0 {
		p.ImageURL = p.Media[0].URL
	}
	for i := range p.Media {
		if p.Media[i].Type == "" {
			if p.Media[i].MimeType != "" && len(p.Media[i].MimeType) >= 6 && p.Media[i].MimeType[:6] == "video/" {
				p.Media[i].Type = "video"
			} else {
				p.Media[i].Type = "image"
			}
		}
		if p.Media[i].CreatedAt.IsZero() {
			p.Media[i].CreatedAt = time.Now().UTC()
		}
	}
}

func scanProductRow(rows *sql.Rows, p *models.Product) error {
	var mediaJSON string
	var ownerID sql.NullInt64
	var ownerSummaryID int64
	var ownerDisplayName, ownerAvatarURL string
	err := rows.Scan(
		&p.ID, &p.CategoryID, &ownerID,
		&p.Name, &p.Description, &p.Price, &p.ImageURL,
		&p.Stock, &p.OriginalPrice, &p.StockUnlimited, &p.IsActive,
		&p.SpecialActions, &mediaJSON,
		&p.CreatedAt, &p.UpdatedAt,
		&ownerSummaryID, &ownerDisplayName, &ownerAvatarURL,
		&p.RecentPurchases, &p.CurrentOrders,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if err != nil {
		return err
	}
	if ownerID.Valid {
		p.OwnerID = &ownerID.Int64
		if ownerSummaryID > 0 {
			p.Owner = &models.UserSummary{ID: ownerSummaryID, DisplayName: ownerDisplayName, AvatarURL: ownerAvatarURL}
		}
	}
	if mediaJSON != "" {
		_ = json.Unmarshal([]byte(mediaJSON), &p.Media)
	}
	normalizeProductMedia(p)
	return nil
}

func (r *sqlProductRepository) GetByCategory(categoryID int64, limit, offset int) ([]*models.Product, error) {
	rows, err := r.db.Query(
		`SELECT `+productSelectFields+`
		 FROM products p
		 LEFT JOIN users owner ON owner.id = p.owner_id
		 WHERE p.category_id = $1 AND p.is_active = true
		 ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`,
		categoryID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanProducts(rows)
}

func (r *sqlProductRepository) Create(p *models.Product) (*models.Product, error) {
	normalizeProductMedia(p)
	err := r.db.QueryRow(
		`INSERT INTO products (category_id, owner_id, name, description, price, image_url, media, stock, stock_unlimited, is_active, special_actions)
		 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
		 RETURNING id`,
		p.CategoryID, p.OwnerID, p.Name, p.Description, p.Price, p.ImageURL, productMediaJSON(p.Media), p.Stock, p.StockUnlimited, p.IsActive, p.SpecialActions,
	).Scan(&p.ID)
	if err != nil {
		return p, err
	}
	return r.GetByID(p.ID)
}

func (r *sqlProductRepository) Update(p *models.Product) (*models.Product, error) {
	normalizeProductMedia(p)
	err := r.db.QueryRow(
		`UPDATE products SET category_id=$1, owner_id=$2, name=$3, description=$4, price=$5, image_url=$6, media=$7::jsonb, stock=$8, original_price=$9, stock_unlimited=$10, is_active=$11, special_actions=$12, updated_at=CURRENT_TIMESTAMP
		 WHERE id=$13
		 RETURNING id`,
		p.CategoryID, p.OwnerID, p.Name, p.Description, p.Price, p.ImageURL, productMediaJSON(p.Media), p.Stock, p.OriginalPrice, p.StockUnlimited, p.IsActive, p.SpecialActions, p.ID,
	).Scan(&p.ID)
	if err != nil {
		return p, err
	}
	return r.GetByID(p.ID)
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
		`SELECT `+productSelectFields+`
		 FROM products p
		 LEFT JOIN users owner ON owner.id = p.owner_id
		 ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,
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
		if err := scanProductRow(rows, p); err != nil {
			return nil, err
		}
		products = append(products, p)
	}
	return products, rows.Err()
}

// Cart repository

type sqlCartRepository struct{ db database.Executor }

func NewCartRepository(db database.Executor) CartRepository {
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

type sqlOrderRepository struct{ db database.Executor }

func NewOrderRepository(db database.Executor) OrderRepository {
	return &sqlOrderRepository{db: db}
}

func (r *sqlOrderRepository) loadItems(orders ...*models.Order) error {
	if len(orders) == 0 {
		return nil
	}

	// Create a map for quick lookup
	orderMap := make(map[int64]*models.Order)
	var ids []any

	query := "SELECT id, order_id, product_id, quantity, price, created_at FROM order_items WHERE order_id IN ("
	for i, o := range orders {
		orderMap[o.ID] = o
		o.Items = []*models.OrderItem{} // initialize

		if i > 0 {
			query += ", "
		}
		query += "?"
		ids = append(ids, o.ID)
	}
	query += ")"

	// Replace ? with $1, $2, etc for postgres/sqlite parameter binding
	// actually since this uses standard sql driver ? might work for sqlite,
	// but $N is safer if they are using pg. The rest of the file uses $N.
	// Let's rewrite the query building for $N
	queryN := `SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.price,
		COALESCE(oi.vendor_status, 'pending'), COALESCE(oi.vendor_note, ''), oi.vendor_updated_at,
		oi.created_at,
		p.owner_id, COALESCE(owner.id, 0), COALESCE(owner.display_name, ''), COALESCE(owner.avatar_url, '')
		FROM order_items oi
		LEFT JOIN products p ON p.id = oi.product_id
		LEFT JOIN users owner ON owner.id = p.owner_id
		WHERE oi.order_id IN (`
	for i := range orders {
		if i > 0 {
			queryN += ", "
		}
		queryN += "$" + strconv.Itoa(i+1)
	}
	queryN += ")"

	rows, err := r.db.Query(queryN, ids...)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		item := &models.OrderItem{}
		var ownerID sql.NullInt64
		var vendorUpdatedAt sql.NullTime
		var ownerSummaryID int64
		var ownerDisplayName, ownerAvatarURL string
		if err := rows.Scan(
			&item.ID, &item.OrderID, &item.ProductID, &item.Quantity, &item.Price,
			&item.VendorStatus, &item.VendorNote, &vendorUpdatedAt,
			&item.CreatedAt,
			&ownerID, &ownerSummaryID, &ownerDisplayName, &ownerAvatarURL,
		); err != nil {
			return err
		}
		if item.VendorStatus == "" {
			item.VendorStatus = "pending"
		}
		if ownerID.Valid {
			item.OwnerID = &ownerID.Int64
			if ownerSummaryID > 0 {
				item.Owner = &models.UserSummary{ID: ownerSummaryID, DisplayName: ownerDisplayName, AvatarURL: ownerAvatarURL}
			}
		}
		if vendorUpdatedAt.Valid {
			item.VendorUpdatedAt = &vendorUpdatedAt.Time
		}
		if o, ok := orderMap[item.OrderID]; ok {
			o.Items = append(o.Items, item)
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, order := range orders {
		order.Vendors = summarizeOrderVendors(order.Items)
	}
	return nil
}

func summarizeOrderVendors(items []*models.OrderItem) []*models.OrderVendorStatus {
	vendorsByID := map[int64]*models.OrderVendorStatus{}
	orderIDs := []int64{}
	for _, item := range items {
		if item.OwnerID == nil {
			continue
		}
		ownerID := *item.OwnerID
		vendor, ok := vendorsByID[ownerID]
		if !ok {
			vendor = &models.OrderVendorStatus{
				VendorID: ownerID,
				Vendor:   item.Owner,
				Status:   "pending",
			}
			vendorsByID[ownerID] = vendor
			orderIDs = append(orderIDs, ownerID)
		}
		vendor.Items += item.Quantity
		vendor.Total += item.Price * int64(item.Quantity)
		vendor.Status = combineVendorStatus(vendor.Status, item.VendorStatus)
		if item.VendorUpdatedAt != nil && (vendor.UpdatedAt == nil || item.VendorUpdatedAt.After(*vendor.UpdatedAt)) {
			vendor.UpdatedAt = item.VendorUpdatedAt
		}
	}
	out := make([]*models.OrderVendorStatus, 0, len(orderIDs))
	for _, ownerID := range orderIDs {
		out = append(out, vendorsByID[ownerID])
	}
	return out
}

func combineVendorStatus(current, next string) string {
	if current == "" || current == "pending" {
		return next
	}
	if next == "" || next == current {
		return current
	}
	if current == "rejected" || next == "rejected" {
		return "mixed"
	}
	if current == "pending" || next == "pending" {
		return "partial"
	}
	return "partial"
}

func (r *sqlOrderRepository) Create(order *models.Order, items []*models.OrderItem) (*models.Order, error) {
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		err := exec.QueryRow(
			`INSERT INTO orders (user_id, is_guest, guest_email, guest_phone, delivery_location, delivery_date, delivery_time, extra_info, billing_info, total_price, status, referral_code)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		 RETURNING id, user_id, is_guest, guest_email, guest_phone, delivery_location, delivery_date, delivery_time, extra_info, billing_info, total_price, status, COALESCE(referral_code, ''), created_at, updated_at`,
			order.UserID, order.IsGuest, order.GuestEmail, order.GuestPhone, order.DeliveryLocation, order.DeliveryDate, order.DeliveryTime, order.ExtraInfo, order.BillingInfo, order.TotalPrice, order.Status, order.ReferralCode,
		).Scan(&order.ID, &order.UserID, &order.IsGuest, &order.GuestEmail, &order.GuestPhone, &order.DeliveryLocation, &order.DeliveryDate, &order.DeliveryTime, &order.ExtraInfo, &order.BillingInfo, &order.TotalPrice, &order.Status, &order.ReferralCode, &order.CreatedAt, &order.UpdatedAt)
		if err != nil {
			return err
		}

		for _, item := range items {
			item.OrderID = order.ID
			_, err := exec.Exec(
				`INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)`,
				item.OrderID, item.ProductID, item.Quantity, item.Price,
			)
			if err != nil {
				return err
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetByID(order.ID)
}

func (r *sqlOrderRepository) GetByID(id int64) (*models.Order, error) {
	o := &models.Order{}
	err := r.db.QueryRow(
		`SELECT id, user_id, is_guest, guest_email, guest_phone, delivery_location, delivery_date, delivery_time, extra_info, billing_info, total_price, status, COALESCE(referral_code, ''), created_at, updated_at FROM orders WHERE id = $1`, id,
	).Scan(&o.ID, &o.UserID, &o.IsGuest, &o.GuestEmail, &o.GuestPhone, &o.DeliveryLocation, &o.DeliveryDate, &o.DeliveryTime, &o.ExtraInfo, &o.BillingInfo, &o.TotalPrice, &o.Status, &o.ReferralCode, &o.CreatedAt, &o.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("order not found")
	}
	if err == nil {
		err = r.loadItems(o)
	}
	return o, err
}

func (r *sqlOrderRepository) GetByUser(userID int64, limit, offset int) ([]*models.Order, error) {
	rows, err := r.db.Query(
		`SELECT id, user_id, is_guest, guest_email, guest_phone, delivery_location, delivery_date, delivery_time, extra_info, billing_info, total_price, status, COALESCE(referral_code, ''), created_at, updated_at
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
		if err := rows.Scan(&o.ID, &o.UserID, &o.IsGuest, &o.GuestEmail, &o.GuestPhone, &o.DeliveryLocation, &o.DeliveryDate, &o.DeliveryTime, &o.ExtraInfo, &o.BillingInfo, &o.TotalPrice, &o.Status, &o.ReferralCode, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	if rows.Err() == nil {
		_ = r.loadItems(orders...)
	}
	return orders, rows.Err()
}

func (r *sqlOrderRepository) GetByProductOwner(ownerID int64, limit, offset int) ([]*models.Order, error) {
	rows, err := r.db.Query(
		`SELECT DISTINCT o.id, o.user_id, o.is_guest, o.guest_email, o.guest_phone, o.delivery_location, o.delivery_date, o.delivery_time, o.extra_info, o.billing_info, o.total_price, o.status, COALESCE(o.referral_code, ''), o.created_at, o.updated_at
		 FROM orders o
		 JOIN order_items oi ON oi.order_id = o.id
		 JOIN products p ON p.id = oi.product_id
		 WHERE p.owner_id = $1
		 ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
		ownerID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []*models.Order
	for rows.Next() {
		o := &models.Order{}
		if err := rows.Scan(&o.ID, &o.UserID, &o.IsGuest, &o.GuestEmail, &o.GuestPhone, &o.DeliveryLocation, &o.DeliveryDate, &o.DeliveryTime, &o.ExtraInfo, &o.BillingInfo, &o.TotalPrice, &o.Status, &o.ReferralCode, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	if rows.Err() == nil {
		_ = r.loadItems(orders...)
	}
	return orders, rows.Err()
}

func (r *sqlOrderRepository) ContainsProductOwnedBy(orderID, ownerID int64) (bool, error) {
	var exists bool
	err := r.db.QueryRow(
		`SELECT EXISTS (
			SELECT 1
			FROM order_items oi
			JOIN products p ON p.id = oi.product_id
			WHERE oi.order_id = $1 AND p.owner_id = $2
		)`,
		orderID, ownerID,
	).Scan(&exists)
	return exists, err
}

func (r *sqlOrderRepository) AcceptWithStockCheck(id int64) (*models.Order, error) {
	o := &models.Order{}
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		var currentStatus string
		err := exec.QueryRow(`SELECT status FROM orders WHERE id = $1 FOR UPDATE`, id).Scan(&currentStatus)
		if errors.Is(err, sql.ErrNoRows) {
			return errors.New("order not found")
		}
		if err != nil {
			return err
		}

		rows, err := exec.Query(`SELECT product_id, quantity FROM order_items WHERE order_id = $1`, id)
		if err != nil {
			return err
		}
		var items []*models.OrderItem
		for rows.Next() {
			item := &models.OrderItem{OrderID: id}
			if err := rows.Scan(&item.ProductID, &item.Quantity); err != nil {
				rows.Close()
				return err
			}
			items = append(items, item)
		}
		if err := rows.Close(); err != nil {
			return err
		}
		if err := rows.Err(); err != nil {
			return err
		}

		shouldReserveStock := currentStatus != "accepted" && currentStatus != "paid" && currentStatus != "completed"
		if shouldReserveStock {
			for _, item := range items {
				var productName string
				err := exec.QueryRow(
					`UPDATE products
				 SET stock = CASE WHEN stock_unlimited THEN stock ELSE stock - $2 END,
				     updated_at = CURRENT_TIMESTAMP
				 WHERE id = $1 AND (stock_unlimited = true OR stock >= $2)
				 RETURNING name`,
					item.ProductID, item.Quantity,
				).Scan(&productName)
				if errors.Is(err, sql.ErrNoRows) {
					var name string
					_ = exec.QueryRow(`SELECT name FROM products WHERE id = $1`, item.ProductID).Scan(&name)
					if name == "" {
						name = fmt.Sprintf("%d", item.ProductID)
					}
					return fmt.Errorf("insufficient stock for product %q", name)
				}
				if err != nil {
					return err
				}
			}
		}

		err = exec.QueryRow(
			`UPDATE orders SET status='accepted', updated_at=CURRENT_TIMESTAMP WHERE id=$1
		 RETURNING id, user_id, is_guest, guest_email, guest_phone, delivery_location, delivery_date, delivery_time, extra_info, billing_info, total_price, status, COALESCE(referral_code, ''), created_at, updated_at`,
			id,
		).Scan(&o.ID, &o.UserID, &o.IsGuest, &o.GuestEmail, &o.GuestPhone, &o.DeliveryLocation, &o.DeliveryDate, &o.DeliveryTime, &o.ExtraInfo, &o.BillingInfo, &o.TotalPrice, &o.Status, &o.ReferralCode, &o.CreatedAt, &o.UpdatedAt)
		if err != nil {
			return err
		}
		_, err = exec.Exec(`UPDATE order_items SET vendor_status='accepted', vendor_updated_at=CURRENT_TIMESTAMP WHERE order_id=$1 AND vendor_status <> 'accepted'`, id)
		return err
	})
	if err != nil {
		return nil, err
	}

	if err := r.loadItems(o); err != nil {
		return nil, err
	}
	return o, nil
}

func (r *sqlOrderRepository) UpdateStatus(id int64, status string) (*models.Order, error) {
	o := &models.Order{}
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		err := exec.QueryRow(
			`UPDATE orders SET status=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2
			 RETURNING id, user_id, is_guest, guest_email, guest_phone, delivery_location, delivery_date, delivery_time, extra_info, billing_info, total_price, status, COALESCE(referral_code, ''), created_at, updated_at`,
			status, id,
		).Scan(&o.ID, &o.UserID, &o.IsGuest, &o.GuestEmail, &o.GuestPhone, &o.DeliveryLocation, &o.DeliveryDate, &o.DeliveryTime, &o.ExtraInfo, &o.BillingInfo, &o.TotalPrice, &o.Status, &o.ReferralCode, &o.CreatedAt, &o.UpdatedAt)
		if err != nil {
			return err
		}
		if status == "completed" || status == "cancelled" || status == "failed" || status == "rejected" {
			_, err = exec.Exec(`UPDATE order_items SET vendor_status=$1, vendor_updated_at=CURRENT_TIMESTAMP WHERE order_id=$2`, status, id)
		}
		return err
	})
	if err == nil {
		err = r.loadItems(o)
	}
	return o, err
}

func (r *sqlOrderRepository) UpdateVendorStatus(id, ownerID int64, status, note string) (*models.Order, error) {
	if status != "accepted" && status != "rejected" && status != "completed" && status != "pending" {
		return nil, fmt.Errorf("invalid vendor status")
	}
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		if _, err := exec.Exec(`SELECT id FROM orders WHERE id = $1 FOR UPDATE`, id); err != nil {
			return err
		}

		rows, err := exec.Query(`
			SELECT oi.id, oi.product_id, oi.quantity, COALESCE(oi.vendor_status, 'pending')
			FROM order_items oi
			JOIN products p ON p.id = oi.product_id
			WHERE oi.order_id = $1 AND p.owner_id = $2
			FOR UPDATE OF oi
		`, id, ownerID)
		if err != nil {
			return err
		}
		type vendorItem struct {
			id        int64
			productID int64
			quantity  int
			status    string
		}
		items := []vendorItem{}
		for rows.Next() {
			var item vendorItem
			if err := rows.Scan(&item.id, &item.productID, &item.quantity, &item.status); err != nil {
				rows.Close()
				return err
			}
			items = append(items, item)
		}
		if err := rows.Close(); err != nil {
			return err
		}
		if err := rows.Err(); err != nil {
			return err
		}
		if len(items) == 0 {
			return errors.New("vendor has no items in order")
		}

		if status == "accepted" {
			for _, item := range items {
				if item.status == "accepted" || item.status == "completed" {
					continue
				}
				var productName string
				err := exec.QueryRow(
					`UPDATE products
					 SET stock = CASE WHEN stock_unlimited THEN stock ELSE stock - $2 END,
					     updated_at = CURRENT_TIMESTAMP
					 WHERE id = $1 AND (stock_unlimited = true OR stock >= $2)
					 RETURNING name`,
					item.productID, item.quantity,
				).Scan(&productName)
				if errors.Is(err, sql.ErrNoRows) {
					var name string
					_ = exec.QueryRow(`SELECT name FROM products WHERE id = $1`, item.productID).Scan(&name)
					if name == "" {
						name = fmt.Sprintf("%d", item.productID)
					}
					return fmt.Errorf("insufficient stock for product %q", name)
				}
				if err != nil {
					return err
				}
			}
		}
		if status == "rejected" || status == "pending" {
			for _, item := range items {
				if item.status != "accepted" {
					continue
				}
				if _, err := exec.Exec(
					`UPDATE products
					 SET stock = CASE WHEN stock_unlimited THEN stock ELSE stock + $2 END,
					     updated_at = CURRENT_TIMESTAMP
					 WHERE id = $1`,
					item.productID, item.quantity,
				); err != nil {
					return err
				}
			}
		}

		if _, err := exec.Exec(`
			UPDATE order_items oi
			SET vendor_status = $3,
			    vendor_note = $4,
			    vendor_updated_at = CURRENT_TIMESTAMP
			FROM products p
			WHERE oi.product_id = p.id
			  AND oi.order_id = $1
			  AND p.owner_id = $2
		`, id, ownerID, status, note); err != nil {
			return err
		}

		aggregateStatus, err := aggregateOrderStatus(exec, id)
		if err != nil {
			return err
		}
		_, err = exec.Exec(`UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, aggregateStatus, id)
		return err
	})
	if err != nil {
		return nil, err
	}
	return r.GetByID(id)
}

func aggregateOrderStatus(exec database.Executor, orderID int64) (string, error) {
	rows, err := exec.Query(`SELECT COALESCE(vendor_status, 'pending') FROM order_items WHERE order_id = $1`, orderID)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	total := 0
	counts := map[string]int{}
	for rows.Next() {
		var status string
		if err := rows.Scan(&status); err != nil {
			return "", err
		}
		if status == "" {
			status = "pending"
		}
		counts[status]++
		total++
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	if total == 0 {
		return "pending", nil
	}
	if counts["completed"] == total {
		return "completed", nil
	}
	if counts["rejected"] == total {
		return "rejected", nil
	}
	if counts["accepted"]+counts["completed"] == total {
		return "accepted", nil
	}
	if counts["pending"] == total {
		return "pending", nil
	}
	return "vendor_review", nil
}

func (r *sqlOrderRepository) GetGuestOrder(id int64, email, phone string) (*models.Order, error) {
	o := &models.Order{}
	err := r.db.QueryRow(
		`SELECT id, user_id, is_guest, guest_email, guest_phone, delivery_location, delivery_date, delivery_time, extra_info, billing_info, total_price, status, COALESCE(referral_code, ''), created_at, updated_at
		 FROM orders
		 WHERE id = $1 AND is_guest = true AND guest_email = $2 AND guest_phone = $3`, id, email, phone,
	).Scan(&o.ID, &o.UserID, &o.IsGuest, &o.GuestEmail, &o.GuestPhone, &o.DeliveryLocation, &o.DeliveryDate, &o.DeliveryTime, &o.ExtraInfo, &o.BillingInfo, &o.TotalPrice, &o.Status, &o.ReferralCode, &o.CreatedAt, &o.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("guest order not found")
	}
	if err == nil {
		err = r.loadItems(o)
	}
	return o, err
}

func (r *sqlOrderRepository) ListAll(limit, offset int) ([]*models.Order, error) {
	rows, err := r.db.Query(
		`SELECT id, user_id, is_guest, guest_email, guest_phone, delivery_location, delivery_date, delivery_time, extra_info, billing_info, total_price, status, COALESCE(referral_code, ''), created_at, updated_at
		 FROM orders
		 ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
		limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []*models.Order
	for rows.Next() {
		o := &models.Order{}
		if err := rows.Scan(&o.ID, &o.UserID, &o.IsGuest, &o.GuestEmail, &o.GuestPhone, &o.DeliveryLocation, &o.DeliveryDate, &o.DeliveryTime, &o.ExtraInfo, &o.BillingInfo, &o.TotalPrice, &o.Status, &o.ReferralCode, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	if rows.Err() == nil {
		_ = r.loadItems(orders...)
	}
	return orders, rows.Err()
}

func (r *sqlOrderRepository) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM orders WHERE id=$1`, id)
	return err
}

// Payment repository

type sqlPaymentRepository struct{ db database.Executor }

func NewPaymentRepository(db database.Executor) PaymentRepository {
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
