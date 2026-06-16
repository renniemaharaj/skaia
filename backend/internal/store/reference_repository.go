package store

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/skaia/backend/models"
)

type sqlReferenceCodeRepository struct {
	db *sql.DB
}

func NewReferenceCodeRepository(db *sql.DB) ReferenceCodeRepository {
	return &sqlReferenceCodeRepository{db: db}
}

func normalizeReferenceCode(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}

func (r *sqlReferenceCodeRepository) Create(code *models.ReferenceCode) (*models.ReferenceCode, error) {
	code.Code = normalizeReferenceCode(code.Code)
	err := r.db.QueryRow(
		`INSERT INTO store_reference_codes (code, user_id, incentive_amount, is_active)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, code, user_id, incentive_amount, is_active, created_at, updated_at`,
		code.Code, code.UserID, code.IncentiveAmount, code.IsActive,
	).Scan(&code.ID, &code.Code, &code.UserID, &code.IncentiveAmount, &code.IsActive, &code.CreatedAt, &code.UpdatedAt)
	return code, err
}

func (r *sqlReferenceCodeRepository) Update(code *models.ReferenceCode) (*models.ReferenceCode, error) {
	code.Code = normalizeReferenceCode(code.Code)
	err := r.db.QueryRow(
		`UPDATE store_reference_codes
		 SET code=$1, user_id=$2, incentive_amount=$3, is_active=$4, updated_at=CURRENT_TIMESTAMP
		 WHERE id=$5
		 RETURNING id, code, user_id, incentive_amount, is_active, created_at, updated_at`,
		code.Code, code.UserID, code.IncentiveAmount, code.IsActive, code.ID,
	).Scan(&code.ID, &code.Code, &code.UserID, &code.IncentiveAmount, &code.IsActive, &code.CreatedAt, &code.UpdatedAt)
	return code, err
}

func (r *sqlReferenceCodeRepository) GetByID(id int64) (*models.ReferenceCode, error) {
	code := &models.ReferenceCode{}
	err := r.db.QueryRow(
		`SELECT id, code, user_id, incentive_amount, is_active, created_at, updated_at
		 FROM store_reference_codes WHERE id=$1`,
		id,
	).Scan(&code.ID, &code.Code, &code.UserID, &code.IncentiveAmount, &code.IsActive, &code.CreatedAt, &code.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("reference code not found")
	}
	return code, err
}

func (r *sqlReferenceCodeRepository) GetByCode(rawCode string) (*models.ReferenceCode, error) {
	code := &models.ReferenceCode{}
	err := r.db.QueryRow(
		`SELECT id, code, user_id, incentive_amount, is_active, created_at, updated_at
		 FROM store_reference_codes WHERE code=$1`,
		normalizeReferenceCode(rawCode),
	).Scan(&code.ID, &code.Code, &code.UserID, &code.IncentiveAmount, &code.IsActive, &code.CreatedAt, &code.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("reference code not found")
	}
	return code, err
}

func (r *sqlReferenceCodeRepository) List(limit, offset int) ([]*models.ReferenceCode, error) {
	rows, err := r.db.Query(
		`SELECT id, code, user_id, incentive_amount, is_active, created_at, updated_at
		 FROM store_reference_codes
		 ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
		limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var codes []*models.ReferenceCode
	for rows.Next() {
		code := &models.ReferenceCode{}
		if err := rows.Scan(&code.ID, &code.Code, &code.UserID, &code.IncentiveAmount, &code.IsActive, &code.CreatedAt, &code.UpdatedAt); err != nil {
			return nil, err
		}
		codes = append(codes, code)
	}
	return codes, rows.Err()
}

func (r *sqlReferenceCodeRepository) CreatePayout(payout *models.ReferenceCodePayout) (*models.ReferenceCodePayout, error) {
	err := r.db.QueryRow(
		`INSERT INTO store_reference_code_payouts (reference_code_id, order_id, user_id, amount)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, reference_code_id, order_id, user_id, amount, created_at`,
		payout.ReferenceCodeID, payout.OrderID, payout.UserID, payout.Amount,
	).Scan(&payout.ID, &payout.ReferenceCodeID, &payout.OrderID, &payout.UserID, &payout.Amount, &payout.CreatedAt)
	return payout, err
}

func (r *sqlReferenceCodeRepository) CreatePayoutWithWalletCredit(payout *models.ReferenceCodePayout, description string) (*models.ReferenceCodePayout, error) {
	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback() //nolint:errcheck

	err = tx.QueryRow(
		`INSERT INTO store_reference_code_payouts (reference_code_id, order_id, user_id, amount)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, reference_code_id, order_id, user_id, amount, created_at`,
		payout.ReferenceCodeID, payout.OrderID, payout.UserID, payout.Amount,
	).Scan(&payout.ID, &payout.ReferenceCodeID, &payout.OrderID, &payout.UserID, &payout.Amount, &payout.CreatedAt)
	if err != nil {
		return nil, err
	}

	if _, err := tx.Exec(
		`INSERT INTO user_wallet_transactions (user_id, amount, type, description)
		 VALUES ($1, $2, 'credit', $3)`,
		payout.UserID, payout.Amount, description,
	); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return payout, nil
}

func (r *sqlReferenceCodeRepository) GetPayoutByOrderID(orderID int64) (*models.ReferenceCodePayout, error) {
	payout := &models.ReferenceCodePayout{}
	err := r.db.QueryRow(
		`SELECT id, reference_code_id, order_id, user_id, amount, created_at
		 FROM store_reference_code_payouts WHERE order_id=$1`,
		orderID,
	).Scan(&payout.ID, &payout.ReferenceCodeID, &payout.OrderID, &payout.UserID, &payout.Amount, &payout.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("reference code payout not found")
	}
	return payout, err
}
