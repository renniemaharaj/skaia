package repository

import (
	"context"
	"database/sql"
	"errors"

	"github.com/google/uuid"
	"github.com/skaia/backend/models"
)

type OrderRepositoryImpl struct {
	db *sql.DB
}

func NewOrderRepository(db *sql.DB) OrderRepository {
	return &OrderRepositoryImpl{db: db}
}

func (r *OrderRepositoryImpl) CreateOrder(order *models.Order, items []*models.OrderItem) (*models.Order, error) {
	tx, err := r.db.BeginTx(context.Background(), nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	order.ID = uuid.New()
	err = tx.QueryRow(
		`INSERT INTO orders (id, user_id, total_price, status)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, user_id, total_price, status, created_at, updated_at`,
		order.ID, order.UserID, order.TotalPrice, order.Status,
	).Scan(&order.ID, &order.UserID, &order.TotalPrice, &order.Status, &order.CreatedAt, &order.UpdatedAt)

	if err != nil {
		return nil, err
	}

	// Insert order items
	for _, item := range items {
		item.ID = uuid.New()
		item.OrderID = order.ID
		_, err := tx.Exec(
			`INSERT INTO order_items (id, order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4, $5)`,
			item.ID, item.OrderID, item.ProductID, item.Quantity, item.Price,
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

func (r *OrderRepositoryImpl) GetOrderByID(id uuid.UUID) (*models.Order, error) {
	order := &models.Order{}
	err := r.db.QueryRow(
		`SELECT id, user_id, total_price, status, created_at, updated_at FROM orders WHERE id = $1`,
		id,
	).Scan(&order.ID, &order.UserID, &order.TotalPrice, &order.Status, &order.CreatedAt, &order.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("order not found")
	}
	return order, err
}

func (r *OrderRepositoryImpl) GetUserOrders(userID uuid.UUID, limit int, offset int) ([]*models.Order, error) {
	rows, err := r.db.Query(
		`SELECT id, user_id, total_price, status, created_at, updated_at
		 FROM orders WHERE user_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2 OFFSET $3`,
		userID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []*models.Order
	for rows.Next() {
		order := &models.Order{}
		err := rows.Scan(&order.ID, &order.UserID, &order.TotalPrice, &order.Status, &order.CreatedAt, &order.UpdatedAt)
		if err != nil {
			return nil, err
		}
		orders = append(orders, order)
	}

	return orders, rows.Err()
}

func (r *OrderRepositoryImpl) UpdateOrderStatus(id uuid.UUID, status string) (*models.Order, error) {
	order := &models.Order{}
	err := r.db.QueryRow(
		`UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
		 RETURNING id, user_id, total_price, status, created_at, updated_at`,
		status, id,
	).Scan(&order.ID, &order.UserID, &order.TotalPrice, &order.Status, &order.CreatedAt, &order.UpdatedAt)

	return order, err
}
