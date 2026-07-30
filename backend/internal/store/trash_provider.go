package store

import (
	"context"
	"database/sql"
	"errors"
	"strconv"

	"github.com/skaia/backend/database"
	"github.com/skaia/backend/internal/trash"
)

type trashProvider struct {
	db         database.Executor
	resource   string
	label      string
	permission string
}

func NewTrashProviders(db database.Executor) []trash.Provider {
	return []trash.Provider{
		&trashProvider{db: db, resource: "store_category", label: "Store categories", permission: "store.manageCategories"},
		&trashProvider{db: db, resource: "product", label: "Products", permission: "store.product-delete"},
		&trashProvider{db: db, resource: "order", label: "Orders", permission: "store.manageOrders"},
		&trashProvider{db: db, resource: "store_reference_code", label: "Reference codes", permission: "store.manageOrders"},
		&trashProvider{db: db, resource: "user_card", label: "Payment cards", permission: "store.manageOrders"},
		&trashProvider{db: db, resource: "subscription_plan", label: "Subscription plans", permission: "store.managePlans"},
	}
}

func (p *trashProvider) Resource() string         { return p.resource }
func (p *trashProvider) Label() string            { return p.label }
func (p *trashProvider) ManagePermission() string { return p.permission }

func (p *trashProvider) ListDeleted(ctx context.Context, actorID int64, includeManaged bool, limit, offset int) ([]trash.Item, error) {
	var query string
	switch p.resource {
	case "store_category":
		query = `SELECT id::text, name, description, deleted_at, deleted_by
		         FROM store_categories
		         WHERE deleted_at IS NOT NULL AND ($2 OR deleted_by=$1)
		         ORDER BY deleted_at DESC, id DESC LIMIT $3 OFFSET $4`
	case "product":
		query = `SELECT id::text, name, 'Product', deleted_at, deleted_by
		         FROM products
		         WHERE deleted_at IS NOT NULL AND ($2 OR owner_id=$1 OR deleted_by=$1)
		         ORDER BY deleted_at DESC, id DESC LIMIT $3 OFFSET $4`
	case "order":
		query = `SELECT id::text, 'Order #' || id::text, status, deleted_at, deleted_by
		         FROM orders
		         WHERE deleted_at IS NOT NULL AND ($2 OR user_id=$1 OR deleted_by=$1)
		         ORDER BY deleted_at DESC, id DESC LIMIT $3 OFFSET $4`
	case "store_reference_code":
		query = `SELECT id::text, code, 'Reference code', deleted_at, deleted_by
		         FROM store_reference_codes
		         WHERE deleted_at IS NOT NULL AND ($2 OR user_id=$1 OR deleted_by=$1)
		         ORDER BY deleted_at DESC, id DESC LIMIT $3 OFFSET $4`
	case "user_card":
		query = `SELECT id::text, card_name,
		                'Card ending ' || COALESCE(NULLIF(card_number, ''), 'unknown'),
		                deleted_at, deleted_by
		         FROM user_cards
		         WHERE deleted_at IS NOT NULL AND ($2 OR user_id=$1 OR deleted_by=$1)
		         ORDER BY deleted_at DESC, id DESC LIMIT $3 OFFSET $4`
	case "subscription_plan":
		query = `SELECT id::text, name, 'Subscription plan', deleted_at, deleted_by
		         FROM subscription_plans
		         WHERE deleted_at IS NOT NULL AND ($2 OR deleted_by=$1)
		         ORDER BY deleted_at DESC, id DESC LIMIT $3 OFFSET $4`
	default:
		return nil, trash.ErrNotFound
	}

	rows, err := p.db.QueryContext(ctx, query, actorID, includeManaged, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]trash.Item, 0)
	for rows.Next() {
		var item trash.Item
		var detail sql.NullString
		var deletedBy sql.NullInt64
		if err := rows.Scan(&item.ID, &item.Label, &detail, &item.DeletedAt, &deletedBy); err != nil {
			return nil, err
		}
		item.Resource = p.resource
		if detail.Valid {
			item.Detail = detail.String
		}
		if deletedBy.Valid {
			item.DeletedBy = &deletedBy.Int64
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (p *trashProvider) Restore(ctx context.Context, actorID int64, includeManaged bool, rawID string) error {
	id, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil || id <= 0 {
		return trash.ErrNotFound
	}
	return database.TransactionalExecutor(ctx, p.db, func(exec database.Executor) error {
		var query string
		switch p.resource {
		case "store_category":
			query = `UPDATE store_categories SET deleted_at=NULL, deleted_by=NULL
			         WHERE id=$1 AND deleted_at IS NOT NULL AND ($3 OR deleted_by=$2)
			         RETURNING id`
		case "product":
			query = `UPDATE products p SET deleted_at=NULL, deleted_by=NULL
			         FROM store_categories c
			         WHERE p.id=$1 AND p.deleted_at IS NOT NULL
			           AND c.id=p.category_id AND c.deleted_at IS NULL
			           AND ($3 OR p.owner_id=$2 OR p.deleted_by=$2)
			         RETURNING p.id`
		case "order":
			query = `UPDATE orders SET deleted_at=NULL, deleted_by=NULL
			         WHERE id=$1 AND deleted_at IS NOT NULL
			           AND ($3 OR user_id=$2 OR deleted_by=$2)
			         RETURNING id`
		case "store_reference_code":
			query = `UPDATE store_reference_codes SET deleted_at=NULL, deleted_by=NULL
			         WHERE id=$1 AND deleted_at IS NOT NULL
			           AND ($3 OR user_id=$2 OR deleted_by=$2)
			         RETURNING id`
		case "user_card":
			query = `UPDATE user_cards SET deleted_at=NULL, deleted_by=NULL
			         WHERE id=$1 AND deleted_at IS NOT NULL
			           AND ($3 OR user_id=$2 OR deleted_by=$2)
			         RETURNING id`
		case "subscription_plan":
			query = `UPDATE subscription_plans SET deleted_at=NULL, deleted_by=NULL
			         WHERE id=$1 AND deleted_at IS NOT NULL
			           AND ($3 OR deleted_by=$2)
			         RETURNING id`
		default:
			return trash.ErrNotFound
		}
		var restored int64
		err := exec.QueryRowContext(ctx, query, id, actorID, includeManaged).Scan(&restored)
		if errors.Is(err, sql.ErrNoRows) {
			return p.restoreFailure(ctx, exec, id, actorID, includeManaged)
		}
		if err != nil {
			return err
		}
		_, err = exec.ExecContext(
			ctx,
			`INSERT INTO resource_lifecycle_events(actor_id, resource_type, resource_id, action)
			 VALUES ($1, $2, $3, 'restore')`,
			actorID, p.resource, rawID,
		)
		return err
	})
}

func (p *trashProvider) restoreFailure(ctx context.Context, exec database.Executor, id, actorID int64, includeManaged bool) error {
	if p.resource != "product" {
		return trash.ErrNotFound
	}
	var authorized bool
	var parentActive bool
	err := exec.QueryRowContext(
		ctx,
		`SELECT COALESCE($3 OR p.owner_id=$2 OR p.deleted_by=$2, FALSE),
		        c.deleted_at IS NULL
		 FROM products p
		 JOIN store_categories c ON c.id=p.category_id
		 WHERE p.id=$1 AND p.deleted_at IS NOT NULL`,
		id, actorID, includeManaged,
	).Scan(&authorized, &parentActive)
	if errors.Is(err, sql.ErrNoRows) || !authorized {
		return trash.ErrNotFound
	}
	if err != nil {
		return err
	}
	if !parentActive {
		return trash.ErrConflict
	}
	return trash.ErrNotFound
}
