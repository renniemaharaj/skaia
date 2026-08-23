package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/skaia/backend/database"
	"github.com/skaia/backend/models"
)

const maxFulfilmentAttempts = 8

func (r *sqlOrderRepository) ClaimFulfilments(orderID int64, owner string, lease time.Duration, limit int) ([]*models.OrderFulfilment, error) {
	if orderID <= 0 || owner == "" || len(owner) > 100 || lease <= 0 {
		return nil, errors.New("fulfilment claim requires an order, bounded owner, and positive lease")
	}
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	var claimed []*models.OrderFulfilment
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		rows, err := exec.Query(`
			WITH candidates AS (
				SELECT id FROM store_order_fulfilments
				WHERE order_id=$1 AND attempts < $2 AND (
					(status IN ('pending','failed') AND available_at <= CURRENT_TIMESTAMP) OR
					(status='processing' AND lease_expires_at <= CURRENT_TIMESTAMP)
				)
				ORDER BY id FOR UPDATE SKIP LOCKED LIMIT $3
			)
			UPDATE store_order_fulfilments f
			SET status='processing', attempts=f.attempts+1, lease_owner=$4,
				lease_expires_at=CURRENT_TIMESTAMP + ($5 * INTERVAL '1 millisecond'),
				last_error=NULL, updated_at=CURRENT_TIMESTAMP
			FROM candidates c WHERE f.id=c.id
			RETURNING f.id, f.order_id, f.order_item_id, f.user_id, f.action_index,
				f.action_type, f.action_value, f.quantity, f.payload_hash, f.status,
				f.attempts, f.lease_owner, f.lease_expires_at
		`, orderID, maxFulfilmentAttempts, limit, owner, lease.Milliseconds())
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			job := &models.OrderFulfilment{}
			if err := rows.Scan(
				&job.ID, &job.OrderID, &job.OrderItemID, &job.UserID, &job.ActionIndex,
				&job.ActionType, &job.ActionValue, &job.Quantity, &job.PayloadHash,
				&job.Status, &job.Attempts, &job.LeaseOwner, &job.LeaseExpiresAt,
			); err != nil {
				return err
			}
			claimed = append(claimed, job)
		}
		return rows.Err()
	})
	return claimed, err
}

func (r *sqlOrderRepository) MarkFulfilmentSucceeded(id int64, owner string) error {
	result, err := r.db.Exec(`
		UPDATE store_order_fulfilments
		SET status='succeeded', delivered_at=CURRENT_TIMESTAMP, lease_owner=NULL,
			lease_expires_at=NULL, last_error=NULL, updated_at=CURRENT_TIMESTAMP
		WHERE id=$1 AND status='processing' AND lease_owner=$2 AND lease_expires_at > CURRENT_TIMESTAMP
	`, id, owner)
	return requireOneFulfilmentLease(result, err)
}

func (r *sqlOrderRepository) MarkFulfilmentFailed(id int64, owner, reason string, retryAfter time.Duration) error {
	if len(reason) > 500 {
		reason = reason[:500]
	}
	if retryAfter < 0 {
		retryAfter = 0
	}
	result, err := r.db.Exec(`
		UPDATE store_order_fulfilments
		SET status='failed', available_at=CURRENT_TIMESTAMP + ($3 * INTERVAL '1 millisecond'),
			lease_owner=NULL, lease_expires_at=NULL, last_error=$4, updated_at=CURRENT_TIMESTAMP
		WHERE id=$1 AND status='processing' AND lease_owner=$2
	`, id, owner, retryAfter.Milliseconds(), reason)
	return requireOneFulfilmentLease(result, err)
}

// RetryExhaustedFulfilments returns terminally failed jobs to the pending queue.
// It never disrupts a live lease or replays a job that already succeeded.
func (r *sqlOrderRepository) RetryExhaustedFulfilments(orderID int64) (int64, error) {
	if orderID <= 0 {
		return 0, errors.New("fulfilment retry requires an order")
	}
	result, err := r.db.Exec(`
		UPDATE store_order_fulfilments
		SET status='pending', attempts=0, available_at=CURRENT_TIMESTAMP,
			lease_owner=NULL, lease_expires_at=NULL, updated_at=CURRENT_TIMESTAMP
		WHERE order_id=$1 AND status='failed' AND attempts >= $2
	`, orderID, maxFulfilmentAttempts)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func requireOneFulfilmentLease(result sql.Result, err error) error {
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows != 1 {
		return errors.New("fulfilment lease is no longer owned")
	}
	return nil
}

func (r *sqlOrderRepository) OrderFulfilmentsSucceeded(orderID int64) (bool, error) {
	var incomplete int
	err := r.db.QueryRow(`
		SELECT COUNT(*) FROM store_order_fulfilments
		WHERE order_id=$1 AND status <> 'succeeded'
	`, orderID).Scan(&incomplete)
	return incomplete == 0, err
}

func (r *sqlOrderRepository) OrderHasFulfilments(orderID int64) (bool, error) {
	var exists bool
	err := r.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM store_order_fulfilments WHERE order_id=$1)`, orderID).Scan(&exists)
	return exists, err
}
