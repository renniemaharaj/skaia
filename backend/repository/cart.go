package repository

import (
	"database/sql"
	"errors"

	"github.com/google/uuid"
	"github.com/skaia/backend/models"
)

type CartRepositoryImpl struct {
	db *sql.DB
}

func NewCartRepository(db *sql.DB) CartRepository {
	return &CartRepositoryImpl{db: db}
}

func (r *CartRepositoryImpl) GetCartItem(userID, productID uuid.UUID) (*models.CartItem, error) {
	item := &models.CartItem{}
	err := r.db.QueryRow(
		`SELECT id, user_id, product_id, quantity, added_at FROM cart_items WHERE user_id = $1 AND product_id = $2`,
		userID, productID,
	).Scan(&item.ID, &item.UserID, &item.ProductID, &item.Quantity, &item.AddedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("cart item not found")
	}
	return item, err
}

func (r *CartRepositoryImpl) GetUserCart(userID uuid.UUID) ([]*models.CartItem, error) {
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
		err := rows.Scan(&item.ID, &item.UserID, &item.ProductID, &item.Quantity, &item.AddedAt)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func (r *CartRepositoryImpl) AddToCart(userID, productID uuid.UUID, quantity int) (*models.CartItem, error) {
	item := &models.CartItem{
		ID:        uuid.New(),
		UserID:    userID,
		ProductID: productID,
		Quantity:  quantity,
	}

	err := r.db.QueryRow(
		`INSERT INTO cart_items (id, user_id, product_id, quantity)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = quantity + $4
		 RETURNING id, user_id, product_id, quantity, added_at`,
		item.ID, userID, productID, quantity,
	).Scan(&item.ID, &item.UserID, &item.ProductID, &item.Quantity, &item.AddedAt)

	return item, err
}

func (r *CartRepositoryImpl) UpdateCartItem(userID, productID uuid.UUID, quantity int) (*models.CartItem, error) {
	item := &models.CartItem{}
	err := r.db.QueryRow(
		`UPDATE cart_items SET quantity = $1 WHERE user_id = $2 AND product_id = $3
		 RETURNING id, user_id, product_id, quantity, added_at`,
		quantity, userID, productID,
	).Scan(&item.ID, &item.UserID, &item.ProductID, &item.Quantity, &item.AddedAt)

	return item, err
}

func (r *CartRepositoryImpl) RemoveFromCart(userID, productID uuid.UUID) error {
	_, err := r.db.Exec(
		`DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2`,
		userID, productID,
	)
	return err
}

func (r *CartRepositoryImpl) ClearCart(userID uuid.UUID) error {
	_, err := r.db.Exec(`DELETE FROM cart_items WHERE user_id = $1`, userID)
	return err
}
