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
		`SELECT id, name, description, display_order, created_at
		 FROM store_categories WHERE id = $1 AND deleted_at IS NULL`, id,
	).Scan(&c.ID, &c.Name, &c.Description, &c.DisplayOrder, &c.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("category not found")
	}
	return c, err
}

func (r *sqlCategoryRepository) GetByName(name string) (*models.StoreCategory, error) {
	c := &models.StoreCategory{}
	err := r.db.QueryRow(
		`SELECT id, name, description, display_order, created_at
		 FROM store_categories WHERE name = $1 AND deleted_at IS NULL`, name,
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
		 WHERE id=$4 AND deleted_at IS NULL
		 RETURNING id, name, description, display_order, created_at`,
		cat.Name, cat.Description, cat.DisplayOrder, cat.ID,
	).Scan(&cat.ID, &cat.Name, &cat.Description, &cat.DisplayOrder, &cat.CreatedAt)
	return cat, err
}

func (r *sqlCategoryRepository) Delete(id, actorID int64) error {
	_, err := r.db.Exec(
		`WITH changed AS (
		    UPDATE store_categories
		    SET deleted_at=COALESCE(deleted_at, NOW()),
		        deleted_by=COALESCE(deleted_by, $2)
		    WHERE id=$1 AND deleted_at IS NULL
		    RETURNING id
		 )
		 INSERT INTO resource_lifecycle_events(actor_id, resource_type, resource_id, action)
		 SELECT $2, 'store_category', id::text, 'delete' FROM changed`,
		id, actorID,
	)
	return err
}

func (r *sqlCategoryRepository) List() ([]*models.StoreCategory, error) {
	rows, err := r.db.Query(
		`SELECT id, name, description, display_order, created_at
		 FROM store_categories WHERE deleted_at IS NULL ORDER BY display_order ASC`,
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
		 JOIN store_categories sc ON sc.id=p.category_id AND sc.deleted_at IS NULL
		 LEFT JOIN users owner ON owner.id = p.owner_id
		 WHERE p.id = $1 AND p.deleted_at IS NULL`, id,
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

func productSpecialActionsJSON(actions string) string {
	if actions == "" || !json.Valid([]byte(actions)) {
		return "[]"
	}
	return actions
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
		 JOIN store_categories sc ON sc.id=p.category_id AND sc.deleted_at IS NULL
		 LEFT JOIN users owner ON owner.id = p.owner_id
		 WHERE p.category_id = $1 AND p.is_active = true AND p.deleted_at IS NULL
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
		 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11::jsonb)
		 RETURNING id`,
		p.CategoryID, p.OwnerID, p.Name, p.Description, p.Price, p.ImageURL, productMediaJSON(p.Media), p.Stock, p.StockUnlimited, p.IsActive, productSpecialActionsJSON(p.SpecialActions),
	).Scan(&p.ID)
	if err != nil {
		return p, err
	}
	return r.GetByID(p.ID)
}

func (r *sqlProductRepository) Update(p *models.Product) (*models.Product, error) {
	normalizeProductMedia(p)
	err := r.db.QueryRow(
		`UPDATE products SET category_id=$1, owner_id=$2, name=$3, description=$4, price=$5, image_url=$6, media=$7::jsonb, stock=$8, original_price=$9, stock_unlimited=$10, is_active=$11, special_actions=$12::jsonb, updated_at=CURRENT_TIMESTAMP
		 WHERE id=$13 AND deleted_at IS NULL
		   AND EXISTS (
		       SELECT 1 FROM store_categories
		       WHERE id=$1 AND deleted_at IS NULL
		   )
		 RETURNING id`,
		p.CategoryID, p.OwnerID, p.Name, p.Description, p.Price, p.ImageURL, productMediaJSON(p.Media), p.Stock, p.OriginalPrice, p.StockUnlimited, p.IsActive, productSpecialActionsJSON(p.SpecialActions), p.ID,
	).Scan(&p.ID)
	if err != nil {
		return p, err
	}
	return r.GetByID(p.ID)
}

func (r *sqlProductRepository) Delete(id, actorID int64) error {
	_, err := r.db.Exec(
		`WITH changed AS (
		    UPDATE products
		    SET deleted_at=COALESCE(deleted_at, NOW()),
		        deleted_by=COALESCE(deleted_by, $2)
		    WHERE id=$1 AND deleted_at IS NULL
		    RETURNING id
		 )
		 INSERT INTO resource_lifecycle_events(actor_id, resource_type, resource_id, action)
		 SELECT $2, 'product', id::text, 'delete' FROM changed`,
		id, actorID,
	)
	return err
}

func (r *sqlProductRepository) List(limit, offset int) ([]*models.Product, error) {
	rows, err := r.db.Query(
		`SELECT `+productSelectFields+`
		 FROM products p
		 JOIN store_categories sc ON sc.id=p.category_id AND sc.deleted_at IS NULL
		 LEFT JOIN users owner ON owner.id = p.owner_id
		 WHERE p.deleted_at IS NULL
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
		`SELECT ci.id,ci.user_id,ci.product_id,ci.quantity,ci.added_at
		 FROM cart_items ci
		 JOIN products p ON p.id=ci.product_id AND p.deleted_at IS NULL
		 JOIN store_categories sc ON sc.id=p.category_id AND sc.deleted_at IS NULL
		 WHERE ci.user_id=$1 AND ci.product_id=$2 AND ci.inactive_at IS NULL`,
		userID, productID,
	).Scan(&item.ID, &item.UserID, &item.ProductID, &item.Quantity, &item.AddedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("cart item not found")
	}
	return item, err
}

func (r *sqlCartRepository) GetUserCart(userID int64) ([]*models.CartItem, error) {
	rows, err := r.db.Query(
		`SELECT ci.id,ci.user_id,ci.product_id,ci.quantity,ci.added_at
		 FROM cart_items ci
		 JOIN products p ON p.id=ci.product_id AND p.deleted_at IS NULL
		 JOIN store_categories sc ON sc.id=p.category_id AND sc.deleted_at IS NULL
		 WHERE ci.user_id=$1 AND ci.inactive_at IS NULL ORDER BY ci.added_at DESC`,
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
		 ON CONFLICT (user_id,product_id) DO UPDATE SET
		   quantity=CASE WHEN cart_items.inactive_at IS NULL THEN cart_items.quantity+EXCLUDED.quantity ELSE EXCLUDED.quantity END,
		   inactive_at=NULL,inactive_by=NULL,added_at=NOW()
		 RETURNING id, user_id, product_id, quantity, added_at`,
		userID, productID, quantity,
	).Scan(&item.ID, &item.UserID, &item.ProductID, &item.Quantity, &item.AddedAt)
	return item, err
}

func (r *sqlCartRepository) UpdateItem(userID, productID int64, quantity int) (*models.CartItem, error) {
	item := &models.CartItem{}
	err := r.db.QueryRow(
		`UPDATE cart_items SET quantity=$1 WHERE user_id=$2 AND product_id=$3 AND inactive_at IS NULL
		 RETURNING id, user_id, product_id, quantity, added_at`,
		quantity, userID, productID,
	).Scan(&item.ID, &item.UserID, &item.ProductID, &item.Quantity, &item.AddedAt)
	return item, err
}

func (r *sqlCartRepository) RemoveFromCart(userID, productID int64) error {
	_, err := r.db.Exec(`UPDATE cart_items SET inactive_at=COALESCE(inactive_at,NOW()),inactive_by=COALESCE(inactive_by,$1)
		WHERE user_id=$1 AND product_id=$2 AND inactive_at IS NULL`, userID, productID)
	return err
}

func (r *sqlCartRepository) ClearCart(userID int64) error {
	_, err := r.db.Exec(`UPDATE cart_items SET inactive_at=COALESCE(inactive_at,NOW()),inactive_by=COALESCE(inactive_by,$1)
		WHERE user_id=$1 AND inactive_at IS NULL`, userID)
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
		return insertOrder(exec, order, items)
	})
	if err != nil {
		return nil, err
	}
	return r.GetByID(order.ID)
}

func insertOrder(exec database.Executor, order *models.Order, items []*models.OrderItem) error {
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
		if err := exec.QueryRow(
			`INSERT INTO order_items (order_id, product_id, quantity, price)
			 VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
			item.OrderID, item.ProductID, item.Quantity, item.Price,
		).Scan(&item.ID, &item.CreatedAt); err != nil {
			return err
		}
	}
	return nil
}

func (r *sqlOrderRepository) BeginCheckout(userID int64, operationKey, payloadHash string) (*models.CheckoutOperation, bool, error) {
	if userID <= 0 || operationKey == "" || len(operationKey) > 500 || payloadHash == "" {
		return nil, false, errors.New("checkout requires a user, bounded idempotency key, and payload hash")
	}
	keyHash := hashOperationValue(operationKey)
	op := &models.CheckoutOperation{}
	created := false
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		err := exec.QueryRow(`
			INSERT INTO store_checkout_operations (user_id, key_hash, payload_hash)
			VALUES ($1, $2, $3)
			ON CONFLICT (user_id, key_hash) DO NOTHING
			RETURNING id, user_id, payload_hash, order_id, status, created_at, updated_at
		`, userID, keyHash, payloadHash).Scan(
			&op.ID, &op.UserID, &op.PayloadHash, &op.OrderID, &op.Status, &op.CreatedAt, &op.UpdatedAt,
		)
		if err == nil {
			created = true
			return nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err := exec.QueryRow(`
			SELECT id, user_id, payload_hash, order_id, status, created_at, updated_at
			FROM store_checkout_operations WHERE user_id=$1 AND key_hash=$2 FOR UPDATE
		`, userID, keyHash).Scan(
			&op.ID, &op.UserID, &op.PayloadHash, &op.OrderID, &op.Status, &op.CreatedAt, &op.UpdatedAt,
		); err != nil {
			return err
		}
		if op.PayloadHash != payloadHash {
			return ErrIdempotencyConflict
		}
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	return op, created, nil
}

func (r *sqlOrderRepository) CreateForCheckout(operationID int64, order *models.Order, items []*models.OrderItem) (*models.Order, error) {
	var orderID int64
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		if err := exec.QueryRow(`SELECT COALESCE(order_id, 0) FROM store_checkout_operations WHERE id=$1 FOR UPDATE`, operationID).Scan(&orderID); err != nil {
			return err
		}
		if orderID > 0 {
			return nil
		}
		if err := insertOrder(exec, order, items); err != nil {
			return err
		}
		orderID = order.ID
		result, err := exec.Exec(`UPDATE store_checkout_operations SET order_id=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND order_id IS NULL`, orderID, operationID)
		if err != nil {
			return err
		}
		rows, err := result.RowsAffected()
		if err != nil || rows != 1 {
			return errors.New("checkout operation order binding failed")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetByID(orderID)
}

func (r *sqlOrderRepository) CompleteCheckout(operationID int64) error {
	result, err := r.db.Exec(`UPDATE store_checkout_operations SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND order_id IS NOT NULL`, operationID)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows != 1 {
		return errors.New("checkout operation cannot complete without an order")
	}
	return nil
}

func (r *sqlOrderRepository) GetByID(id int64) (*models.Order, error) {
	o := &models.Order{}
	err := r.db.QueryRow(
		`SELECT id, user_id, is_guest, guest_email, guest_phone, delivery_location, delivery_date, delivery_time, extra_info, billing_info, total_price, status, COALESCE(referral_code, ''), created_at, updated_at
		 FROM orders WHERE id = $1 AND deleted_at IS NULL`, id,
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
		 FROM orders WHERE user_id = $1 AND deleted_at IS NULL
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
		 WHERE p.owner_id = $1 AND o.deleted_at IS NULL
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
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		var currentStatus string
		var userID sql.NullInt64
		err := exec.QueryRow(
			`SELECT status, user_id FROM orders
			 WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
			id,
		).Scan(&currentStatus, &userID)
		if errors.Is(err, sql.ErrNoRows) {
			return errors.New("order not found")
		}
		if err != nil {
			return err
		}
		if currentStatus == "accepted" || currentStatus == "paid" || currentStatus == "completed" {
			return nil
		}
		if currentStatus != "pending" && currentStatus != "vendor_review" {
			return fmt.Errorf("invalid order status transition from %s to accepted", currentStatus)
		}

		rows, err := exec.Query(`
			SELECT oi.id, oi.product_id, oi.quantity, COALESCE(p.special_actions, '[]'::jsonb)::text
			FROM order_items oi JOIN products p ON p.id=oi.product_id
			WHERE oi.order_id = $1 ORDER BY oi.id FOR UPDATE OF oi
		`, id)
		if err != nil {
			return err
		}
		type acceptedItem struct {
			item    *models.OrderItem
			actions string
		}
		var items []acceptedItem
		for rows.Next() {
			item := &models.OrderItem{OrderID: id}
			var actions string
			if err := rows.Scan(&item.ID, &item.ProductID, &item.Quantity, &actions); err != nil {
				rows.Close()
				return err
			}
			items = append(items, acceptedItem{item: item, actions: actions})
		}
		if err := rows.Close(); err != nil {
			return err
		}
		if err := rows.Err(); err != nil {
			return err
		}

		for _, accepted := range items {
			item := accepted.item
			var productName string
			err := exec.QueryRow(
				`UPDATE products
				 SET stock = CASE WHEN stock_unlimited THEN stock ELSE stock - $2 END,
				     updated_at = CURRENT_TIMESTAMP
				 WHERE id = $1 AND deleted_at IS NULL
				   AND (stock_unlimited = true OR stock >= $2)
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

		for _, accepted := range items {
			if err := enqueueItemFulfilments(exec, id, userID, accepted.item.ID, accepted.item.Quantity, accepted.actions); err != nil {
				return err
			}
		}

		_, err = exec.Exec(
			`UPDATE orders SET status='accepted', updated_at=CURRENT_TIMESTAMP
			 WHERE id=$1 AND deleted_at IS NULL`,
			id,
		)
		if err != nil {
			return err
		}
		_, err = exec.Exec(`UPDATE order_items SET vendor_status='accepted', vendor_updated_at=CURRENT_TIMESTAMP WHERE order_id=$1 AND vendor_status <> 'accepted'`, id)
		return err
	})
	if err != nil {
		return nil, err
	}

	return r.GetByID(id)
}

func enqueueItemFulfilments(exec database.Executor, orderID int64, userID sql.NullInt64, orderItemID int64, quantity int, rawActions string) error {
	if rawActions == "" || rawActions == "[]" {
		return nil
	}
	if !userID.Valid || userID.Int64 <= 0 {
		return errors.New("special-action fulfilment requires an authenticated order owner")
	}
	var actions []struct {
		Type  string `json:"type"`
		Value string `json:"value"`
	}
	if err := json.Unmarshal([]byte(rawActions), &actions); err != nil {
		return fmt.Errorf("decode product fulfilment: %w", err)
	}
	for actionIndex, action := range actions {
		if action.Type != "role" && action.Type != "credit" {
			return fmt.Errorf("unsupported product fulfilment type %q", action.Type)
		}
		if action.Value == "" {
			return errors.New("product fulfilment value is required")
		}
		payloadHash := hashOperationValue(fmt.Sprintf("%d:%d:%d:%s:%s:%d", orderID, orderItemID, actionIndex, action.Type, action.Value, quantity))
		if _, err := exec.Exec(`
			INSERT INTO store_order_fulfilments
				(order_id, order_item_id, user_id, action_index, action_type, action_value, quantity, payload_hash)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
			ON CONFLICT (order_item_id, action_index) DO UPDATE SET updated_at=CURRENT_TIMESTAMP
			WHERE store_order_fulfilments.payload_hash=EXCLUDED.payload_hash
		`, orderID, orderItemID, userID.Int64, actionIndex, action.Type, action.Value, quantity, payloadHash); err != nil {
			return err
		}
		var storedHash string
		if err := exec.QueryRow(`SELECT payload_hash FROM store_order_fulfilments WHERE order_item_id=$1 AND action_index=$2`, orderItemID, actionIndex).Scan(&storedHash); err != nil {
			return err
		}
		if storedHash != payloadHash {
			return ErrIdempotencyConflict
		}
	}
	return nil
}

func (r *sqlOrderRepository) UpdateStatus(id int64, status string) (*models.Order, error) {
	o := &models.Order{}
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		var current string
		if err := exec.QueryRow(`SELECT status FROM orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, id).Scan(&current); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return errors.New("order not found")
			}
			return err
		}
		if !allowedOrderTransition(current, status) {
			return fmt.Errorf("invalid order status transition from %s to %s", current, status)
		}
		if current != status && (status == "cancelled" || status == "failed" || status == "rejected") {
			var paid bool
			if err := exec.QueryRow(`SELECT EXISTS(SELECT 1 FROM payments WHERE order_id=$1 AND status='succeeded')`, id).Scan(&paid); err != nil {
				return err
			}
			if paid {
				return errors.New("paid order requires an explicit refund workflow")
			}
			if _, err := exec.Exec(`
				WITH released AS (
					SELECT product_id, SUM(quantity)::bigint AS quantity
					FROM order_items
					WHERE order_id=$1 AND vendor_status IN ('accepted','completed')
					GROUP BY product_id
				)
				UPDATE products p
				SET stock=CASE WHEN p.stock_unlimited THEN p.stock ELSE p.stock+released.quantity::int END,
					updated_at=CURRENT_TIMESTAMP
				FROM released WHERE p.id=released.product_id
			`, id); err != nil {
				return err
			}
		}
		err := exec.QueryRow(
			`UPDATE orders SET status=$1, updated_at=CURRENT_TIMESTAMP
			 WHERE id=$2 AND deleted_at IS NULL
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

func allowedOrderTransition(current, next string) bool {
	if current == next {
		return true
	}
	switch current {
	case "pending":
		return next == "accepted" || next == "failed" || next == "cancelled" || next == "rejected"
	case "vendor_review":
		return next == "accepted" || next == "rejected" || next == "cancelled"
	case "accepted":
		return next == "paid" || next == "completed" || next == "rejected" || next == "cancelled"
	case "paid":
		return next == "completed" || next == "cancelled"
	case "fulfilment_pending":
		return next == "completed" || next == "cancelled"
	default:
		return false
	}
}

func (r *sqlOrderRepository) CompleteWithReferencePayout(id int64) (*models.Order, error) {
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		var current string
		if err := exec.QueryRow(`SELECT status FROM orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, id).Scan(&current); err != nil {
			return err
		}
		if current != "completed" && !allowedOrderTransition(current, "completed") {
			return fmt.Errorf("invalid order status transition from %s to completed", current)
		}
		var pending int
		if err := exec.QueryRow(`SELECT COUNT(*) FROM store_order_fulfilments WHERE order_id=$1 AND status <> 'succeeded'`, id).Scan(&pending); err != nil {
			return err
		}
		if pending > 0 {
			return errors.New("order fulfilments are incomplete")
		}

		var payoutID, payoutUserID, payoutAmount int64
		var code string
		err := exec.QueryRow(`
			INSERT INTO store_reference_code_payouts (reference_code_id, order_id, user_id, amount)
			SELECT rc.id, o.id, rc.user_id, rc.incentive_amount
			FROM orders o
			JOIN store_reference_codes rc ON rc.code=o.referral_code
			WHERE o.id=$1 AND o.referral_code IS NOT NULL AND o.referral_code <> ''
			  AND rc.deleted_at IS NULL AND rc.is_active=true AND rc.incentive_amount > 0
			  AND (o.user_id IS NULL OR o.user_id <> rc.user_id)
			ON CONFLICT (order_id) DO NOTHING
			RETURNING id, user_id, amount, (SELECT referral_code FROM orders WHERE id=$1)
		`, id).Scan(&payoutID, &payoutUserID, &payoutAmount, &code)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err == nil {
			if _, err := exec.Exec(`
				INSERT INTO user_wallet_transactions (user_id, amount, type, description)
				VALUES ($1, $2, 'credit', $3)
			`, payoutUserID, payoutAmount, fmt.Sprintf("Reference code %s reward for order #%d", code, id)); err != nil {
				return err
			}
		}

		if _, err := exec.Exec(`UPDATE orders SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=$1`, id); err != nil {
			return err
		}
		_, err = exec.Exec(`UPDATE order_items SET vendor_status='completed', vendor_updated_at=CURRENT_TIMESTAMP WHERE order_id=$1`, id)
		return err
	})
	if err != nil {
		return nil, err
	}
	return r.GetByID(id)
}

func (r *sqlOrderRepository) UpdateVendorStatus(id, ownerID int64, status, note string) (*models.Order, error) {
	if status != "accepted" && status != "rejected" && status != "completed" && status != "pending" {
		return nil, fmt.Errorf("invalid vendor status")
	}
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		var orderStatus string
		var orderUserID sql.NullInt64
		if err := exec.QueryRow(
			`SELECT status, user_id FROM orders
			 WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
			id,
		).Scan(&orderStatus, &orderUserID); err != nil {
			return err
		}
		if (orderStatus == "completed" || orderStatus == "cancelled" || orderStatus == "failed" || orderStatus == "rejected") && orderStatus != status {
			return fmt.Errorf("order status %s is terminal", orderStatus)
		}

		rows, err := exec.Query(`
			SELECT oi.id, oi.product_id, oi.quantity, COALESCE(oi.vendor_status, 'pending'),
			       COALESCE(p.special_actions, '[]'::jsonb)::text
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
			actions   string
		}
		items := []vendorItem{}
		for rows.Next() {
			var item vendorItem
			if err := rows.Scan(&item.id, &item.productID, &item.quantity, &item.status, &item.actions); err != nil {
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
		for _, item := range items {
			if !allowedVendorTransition(item.status, status) {
				return fmt.Errorf("invalid vendor status transition from %s to %s", item.status, status)
			}
		}
		if status == "rejected" || status == "pending" {
			var paid bool
			if err := exec.QueryRow(`SELECT EXISTS(SELECT 1 FROM payments WHERE order_id=$1 AND status='succeeded')`, id).Scan(&paid); err != nil {
				return err
			}
			if paid {
				return errors.New("paid order requires an explicit refund workflow")
			}
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
					 WHERE id = $1 AND deleted_at IS NULL
					   AND (stock_unlimited = true OR stock >= $2)
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
				if err := enqueueItemFulfilments(exec, id, orderUserID, item.id, item.quantity, item.actions); err != nil {
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
		if aggregateStatus == "completed" {
			var incomplete int
			if err := exec.QueryRow(`SELECT COUNT(*) FROM store_order_fulfilments WHERE order_id=$1 AND status <> 'succeeded'`, id).Scan(&incomplete); err != nil {
				return err
			}
			if incomplete > 0 {
				aggregateStatus = "fulfilment_pending"
			}
		}
		_, err = exec.Exec(
			`UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP
			 WHERE id = $2 AND deleted_at IS NULL`,
			aggregateStatus, id,
		)
		return err
	})
	if err != nil {
		return nil, err
	}
	return r.GetByID(id)
}

func allowedVendorTransition(current, next string) bool {
	if current == next {
		return true
	}
	switch current {
	case "pending":
		return next == "accepted" || next == "rejected"
	case "accepted":
		return next == "completed" || next == "rejected" || next == "pending"
	case "rejected":
		return next == "pending"
	default:
		return false
	}
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
		 WHERE id = $1 AND is_guest = true AND guest_email = $2 AND guest_phone = $3
		   AND deleted_at IS NULL`, id, email, phone,
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
		 WHERE deleted_at IS NULL
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

func (r *sqlOrderRepository) Delete(id, actorID int64) error {
	_, err := r.db.Exec(
		`WITH changed AS (
		    UPDATE orders
		    SET deleted_at=COALESCE(deleted_at, NOW()),
		        deleted_by=COALESCE(deleted_by, $2)
		    WHERE id=$1 AND deleted_at IS NULL
		    RETURNING id
		 )
		 INSERT INTO resource_lifecycle_events(actor_id, resource_type, resource_id, action)
		 SELECT $2, 'order', id::text, 'delete' FROM changed`,
		id, actorID,
	)
	return err
}

// Payment repository
type sqlPaymentRepository struct{ db database.Executor }

var ErrPaymentNotFound = errors.New("payment not found")

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

func (r *sqlPaymentRepository) CreateOnce(p *models.Payment) (*models.Payment, bool, error) {
	created := false
	result := &models.Payment{}
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		err := exec.QueryRow(
			`INSERT INTO payments (order_id, user_id, provider, provider_ref, amount, currency, status, failure_reason)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 ON CONFLICT (order_id) DO NOTHING
			 RETURNING id, order_id, user_id, provider, provider_ref, amount, currency, status, failure_reason, created_at, updated_at`,
			p.OrderID, p.UserID, p.Provider, p.ProviderRef, p.Amount, p.Currency, p.Status, p.FailureReason,
		).Scan(&result.ID, &result.OrderID, &result.UserID, &result.Provider, &result.ProviderRef, &result.Amount, &result.Currency, &result.Status, &result.FailureReason, &result.CreatedAt, &result.UpdatedAt)
		if err == nil {
			created = true
			return nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err := exec.QueryRow(
			`SELECT id, order_id, user_id, provider, provider_ref, amount, currency, status, failure_reason, created_at, updated_at
			 FROM payments WHERE order_id=$1`, p.OrderID,
		).Scan(&result.ID, &result.OrderID, &result.UserID, &result.Provider, &result.ProviderRef, &result.Amount, &result.Currency, &result.Status, &result.FailureReason, &result.CreatedAt, &result.UpdatedAt); err != nil {
			return err
		}
		if result.UserID != p.UserID || result.Provider != p.Provider || result.ProviderRef != p.ProviderRef ||
			result.Amount != p.Amount || result.Currency != p.Currency {
			return ErrIdempotencyConflict
		}
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	return result, created, nil
}

func (r *sqlPaymentRepository) GetByOrderID(orderID int64) (*models.Payment, error) {
	p := &models.Payment{}
	err := r.db.QueryRow(
		`SELECT id, order_id, user_id, provider, provider_ref, amount, currency, status, failure_reason, created_at, updated_at
		 FROM payments WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1`, orderID,
	).Scan(&p.ID, &p.OrderID, &p.UserID, &p.Provider, &p.ProviderRef, &p.Amount, &p.Currency, &p.Status, &p.FailureReason, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPaymentNotFound
	}
	return p, err
}

func (r *sqlPaymentRepository) GetByProviderRef(provider, providerRef string) (*models.Payment, error) {
	p := &models.Payment{}
	err := r.db.QueryRow(
		`SELECT id, order_id, user_id, provider, provider_ref, amount, currency, status, failure_reason, created_at, updated_at
		 FROM payments WHERE provider=$1 AND provider_ref=$2`, provider, providerRef,
	).Scan(&p.ID, &p.OrderID, &p.UserID, &p.Provider, &p.ProviderRef, &p.Amount, &p.Currency, &p.Status, &p.FailureReason, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPaymentNotFound
	}
	return p, err
}

func (r *sqlPaymentRepository) ApplyProviderEvent(provider, eventID, payloadHash, providerRef, status string) (*models.Payment, bool, error) {
	if provider == "" || len(provider) > 50 || eventID == "" || len(eventID) > 500 || payloadHash == "" || providerRef == "" || len(providerRef) > 255 || status == "" || len(status) > 50 {
		return nil, false, errors.New("provider event requires bounded identity and status")
	}
	eventIDHash := hashOperationValue(eventID)
	created := false
	payment := &models.Payment{}
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		var eventRowID int64
		err := exec.QueryRow(`
			INSERT INTO store_payment_events (provider, event_id_hash, payload_hash, provider_ref, payment_status)
			VALUES ($1,$2,$3,$4,$5)
			ON CONFLICT (provider, event_id_hash) DO NOTHING
			RETURNING id
		`, provider, eventIDHash, payloadHash, providerRef, status).Scan(&eventRowID)
		if err == nil {
			created = true
		} else if errors.Is(err, sql.ErrNoRows) {
			var storedPayload, storedRef, storedStatus string
			if err := exec.QueryRow(`
				SELECT payload_hash, provider_ref, payment_status FROM store_payment_events
				WHERE provider=$1 AND event_id_hash=$2
			`, provider, eventIDHash).Scan(&storedPayload, &storedRef, &storedStatus); err != nil {
				return err
			}
			if storedPayload != payloadHash || storedRef != providerRef || storedStatus != status {
				return ErrIdempotencyConflict
			}
		} else {
			return err
		}

		if err := exec.QueryRow(`
			SELECT id, order_id, user_id, provider, provider_ref, amount, currency, status, failure_reason, created_at, updated_at
			FROM payments WHERE provider=$1 AND provider_ref=$2 FOR UPDATE
		`, provider, providerRef).Scan(
			&payment.ID, &payment.OrderID, &payment.UserID, &payment.Provider, &payment.ProviderRef,
			&payment.Amount, &payment.Currency, &payment.Status, &payment.FailureReason,
			&payment.CreatedAt, &payment.UpdatedAt,
		); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrPaymentNotFound
			}
			return err
		}
		if payment.Status == "succeeded" && status != "succeeded" {
			return nil
		}
		return exec.QueryRow(`
			UPDATE payments SET status=$1, failure_reason='', updated_at=CURRENT_TIMESTAMP WHERE id=$2
			RETURNING id, order_id, user_id, provider, provider_ref, amount, currency, status, failure_reason, created_at, updated_at
		`, status, payment.ID).Scan(
			&payment.ID, &payment.OrderID, &payment.UserID, &payment.Provider, &payment.ProviderRef,
			&payment.Amount, &payment.Currency, &payment.Status, &payment.FailureReason,
			&payment.CreatedAt, &payment.UpdatedAt,
		)
	})
	if err != nil {
		return nil, false, err
	}
	return payment, created, nil
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
