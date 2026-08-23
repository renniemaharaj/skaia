package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"unicode"

	"github.com/skaia/backend/database"
	"github.com/skaia/backend/models"
)

type sqlWalletRepository struct {
	db database.Executor
}

// ErrIdempotencyConflict means a key was reused for a different operation.
var ErrIdempotencyConflict = errors.New("idempotency key reused with a different payload")

func NewWalletRepository(db database.Executor) WalletRepository {
	return &sqlWalletRepository{db: db}
}

func (r *sqlWalletRepository) CreateTransaction(tx *models.WalletTransaction) (*models.WalletTransaction, error) {
	query := `
		INSERT INTO user_wallet_transactions (user_id, amount, type, description)
		VALUES ($1, $2, $3, $4)
		RETURNING id, user_id, amount, type, description, created_at
	`
	err := r.db.QueryRow(query, tx.UserID, tx.Amount, tx.Type, tx.Description).Scan(
		&tx.ID,
		&tx.UserID,
		&tx.Amount,
		&tx.Type,
		&tx.Description,
		&tx.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return tx, nil
}

// CreateTransactionOnce creates one immutable wallet entry per user, scope, and
// opaque operation key. Only hashes of the key and financial payload are stored.
// A matching replay returns the original row; a mismatched replay fails closed.
func (r *sqlWalletRepository) CreateTransactionOnce(tx *models.WalletTransaction, operationScope, operationKey string) (*models.WalletTransaction, bool, error) {
	operationScope = strings.TrimSpace(operationScope)
	operationKey = strings.TrimSpace(operationKey)
	if tx == nil || tx.UserID <= 0 || tx.Amount <= 0 {
		return nil, false, errors.New("wallet operation requires a user and positive amount")
	}
	if tx.Type != "credit" && tx.Type != "debit" {
		return nil, false, errors.New("wallet operation type must be credit or debit")
	}
	if operationScope == "" || len(operationScope) > 100 || operationKey == "" || len(operationKey) > 500 {
		return nil, false, errors.New("wallet operation requires a bounded scope and key")
	}

	keyHash := hashOperationValue(operationKey)
	payload, err := json.Marshal(struct {
		UserID      int64  `json:"user_id"`
		Amount      int64  `json:"amount"`
		Type        string `json:"type"`
		Description string `json:"description"`
	}{tx.UserID, tx.Amount, tx.Type, tx.Description})
	if err != nil {
		return nil, false, err
	}
	payloadHash := hashOperationValue(string(payload))
	created := false
	result := &models.WalletTransaction{}

	err = database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		err := exec.QueryRow(`
			INSERT INTO user_wallet_transactions
				(user_id, amount, type, description, operation_scope, operation_key_hash, operation_payload_hash)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (user_id, operation_scope, operation_key_hash)
				WHERE operation_scope IS NOT NULL AND operation_key_hash IS NOT NULL
			DO NOTHING
			RETURNING id, user_id, amount, type, description, created_at
		`, tx.UserID, tx.Amount, tx.Type, tx.Description, operationScope, keyHash, payloadHash).Scan(
			&result.ID, &result.UserID, &result.Amount, &result.Type, &result.Description, &result.CreatedAt,
		)
		if err == nil {
			created = true
			return nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}

		var storedPayloadHash string
		if err := exec.QueryRow(`
			SELECT id, user_id, amount, type, description, created_at, operation_payload_hash
			FROM user_wallet_transactions
			WHERE user_id = $1 AND operation_scope = $2 AND operation_key_hash = $3
		`, tx.UserID, operationScope, keyHash).Scan(
			&result.ID, &result.UserID, &result.Amount, &result.Type, &result.Description, &result.CreatedAt, &storedPayloadHash,
		); err != nil {
			return err
		}
		if storedPayloadHash != payloadHash {
			return ErrIdempotencyConflict
		}
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	return result, created, nil
}

func hashOperationValue(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func (r *sqlWalletRepository) DebitIfSufficient(userID, amount int64, description string) (*models.WalletTransaction, error) {
	if amount <= 0 {
		return nil, errors.New("debit amount must be positive")
	}

	tx := &models.WalletTransaction{}
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		if _, err := exec.Exec(`SELECT pg_advisory_xact_lock($1)`, userID); err != nil {
			return err
		}

		var balance int64
		if err := exec.QueryRow(`
			SELECT
				COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) -
				COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0)
			FROM user_wallet_transactions
			WHERE user_id = $1
		`, userID).Scan(&balance); err != nil {
			return err
		}
		if balance < amount {
			return errors.New("insufficient wallet balance")
		}

		return exec.QueryRow(`
			INSERT INTO user_wallet_transactions (user_id, amount, type, description)
			VALUES ($1, $2, 'debit', $3)
			RETURNING id, user_id, amount, type, description, created_at
		`, userID, amount, description).Scan(
			&tx.ID,
			&tx.UserID,
			&tx.Amount,
			&tx.Type,
			&tx.Description,
			&tx.CreatedAt,
		)
	})
	if err != nil {
		return nil, err
	}
	return tx, nil
}

// DebitIfSufficientOnce atomically serializes a user's balance check with a
// retry-safe debit. Matching replays return the original debit without checking
// the now-lower balance again; conflicting payloads fail closed.
func (r *sqlWalletRepository) DebitIfSufficientOnce(userID, amount int64, description, operationScope, operationKey string) (*models.WalletTransaction, bool, error) {
	operationScope = strings.TrimSpace(operationScope)
	operationKey = strings.TrimSpace(operationKey)
	if userID <= 0 || amount <= 0 {
		return nil, false, errors.New("wallet debit requires a user and positive amount")
	}
	if operationScope == "" || len(operationScope) > 100 || operationKey == "" || len(operationKey) > 500 {
		return nil, false, errors.New("wallet debit requires a bounded scope and key")
	}

	keyHash := hashOperationValue(operationKey)
	payload, err := json.Marshal(struct {
		UserID      int64  `json:"user_id"`
		Amount      int64  `json:"amount"`
		Type        string `json:"type"`
		Description string `json:"description"`
	}{userID, amount, "debit", description})
	if err != nil {
		return nil, false, err
	}
	payloadHash := hashOperationValue(string(payload))
	result := &models.WalletTransaction{}
	created := false

	err = database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		if _, err := exec.Exec(`SELECT pg_advisory_xact_lock($1)`, userID); err != nil {
			return err
		}

		var storedPayloadHash string
		err := exec.QueryRow(`
			SELECT id, user_id, amount, type, description, created_at, operation_payload_hash
			FROM user_wallet_transactions
			WHERE user_id = $1 AND operation_scope = $2 AND operation_key_hash = $3
		`, userID, operationScope, keyHash).Scan(
			&result.ID, &result.UserID, &result.Amount, &result.Type, &result.Description, &result.CreatedAt, &storedPayloadHash,
		)
		if err == nil {
			if storedPayloadHash != payloadHash {
				return ErrIdempotencyConflict
			}
			return nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}

		var balance int64
		if err := exec.QueryRow(`
			SELECT COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) -
			       COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0)
			FROM user_wallet_transactions WHERE user_id = $1
		`, userID).Scan(&balance); err != nil {
			return err
		}
		if balance < amount {
			return errors.New("insufficient wallet balance")
		}

		if err := exec.QueryRow(`
			INSERT INTO user_wallet_transactions
				(user_id, amount, type, description, operation_scope, operation_key_hash, operation_payload_hash)
			VALUES ($1, $2, 'debit', $3, $4, $5, $6)
			RETURNING id, user_id, amount, type, description, created_at
		`, userID, amount, description, operationScope, keyHash, payloadHash).Scan(
			&result.ID, &result.UserID, &result.Amount, &result.Type, &result.Description, &result.CreatedAt,
		); err != nil {
			return err
		}
		created = true
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	return result, created, nil
}

func (r *sqlWalletRepository) GetTransactions(userID int64, limit, offset int) ([]*models.WalletTransaction, error) {
	query := `
		SELECT id, user_id, amount, type, description, created_at
		FROM user_wallet_transactions
		WHERE user_id = $1 AND deleted_at IS NULL
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := r.db.Query(query, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var txs []*models.WalletTransaction
	for rows.Next() {
		var tx models.WalletTransaction
		if err := rows.Scan(
			&tx.ID,
			&tx.UserID,
			&tx.Amount,
			&tx.Type,
			&tx.Description,
			&tx.CreatedAt,
		); err != nil {
			return nil, err
		}
		txs = append(txs, &tx)
	}

	return txs, nil
}

func (r *sqlWalletRepository) GetBalance(userID int64) (int64, error) {
	query := `
		SELECT
			COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) -
			COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0)
		FROM user_wallet_transactions
		WHERE user_id = $1
	`
	var balance int64
	err := r.db.QueryRow(query, userID).Scan(&balance)
	if err != nil {
		return 0, err
	}
	return balance, nil
}

func (r *sqlWalletRepository) AddCard(card *models.UserCard) (*models.UserCard, error) {
	card.Last4 = cardLast4(card.CardNumber)
	card.CardNumber = card.Last4
	card.CVV = ""
	query := `
		INSERT INTO user_cards (user_id, card_name, card_description, card_type, is_credit, card_number, cvv, expiry_month, expiry_year)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, created_at
	`
	err := r.db.QueryRow(query, card.UserID, card.CardName, card.CardDescription, card.CardType, card.IsCredit, card.CardNumber, card.CVV, card.ExpiryMonth, card.ExpiryYear).Scan(
		&card.ID,
		&card.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return card, nil
}

func (r *sqlWalletRepository) GetCards(userID int64) ([]*models.UserCard, error) {
	query := `
		SELECT id, user_id, card_name, card_description, card_type, is_credit, card_number, cvv, expiry_month, expiry_year, created_at
		FROM user_cards
		WHERE user_id = $1
		ORDER BY created_at ASC
	`
	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cards []*models.UserCard
	for rows.Next() {
		var c models.UserCard
		if err := rows.Scan(
			&c.ID, &c.UserID, &c.CardName, &c.CardDescription, &c.CardType, &c.IsCredit, &c.CardNumber, &c.CVV, &c.ExpiryMonth, &c.ExpiryYear, &c.CreatedAt,
		); err != nil {
			return nil, err
		}
		c.Last4 = cardLast4(c.CardNumber)
		c.CardNumber = ""
		c.CVV = ""
		cards = append(cards, &c)
	}
	return cards, nil
}

func (r *sqlWalletRepository) UpdateCard(card *models.UserCard) (*models.UserCard, error) {
	card.Last4 = cardLast4(card.CardNumber)
	if card.Last4 == "" {
		_ = r.db.QueryRow(
			`SELECT card_number FROM user_cards
			 WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
			card.ID, card.UserID,
		).Scan(&card.Last4)
		card.Last4 = cardLast4(card.Last4)
	}
	card.CardNumber = card.Last4
	card.CVV = ""
	query := `
		UPDATE user_cards
		SET card_name = $1, card_description = $2, card_type = $3, is_credit = $4, card_number = $5, cvv = $6, expiry_month = $7, expiry_year = $8
		WHERE id = $9 AND user_id = $10 AND deleted_at IS NULL
	`
	_, err := r.db.Exec(query, card.CardName, card.CardDescription, card.CardType, card.IsCredit, card.CardNumber, card.CVV, card.ExpiryMonth, card.ExpiryYear, card.ID, card.UserID)
	return card, err
}

func (r *sqlWalletRepository) DeleteCard(cardID, userID, actorID int64) error {
	_, err := r.db.Exec(
		`WITH changed AS (
		    UPDATE user_cards
		    SET deleted_at=COALESCE(deleted_at, NOW()),
		        deleted_by=COALESCE(deleted_by, $3)
		    WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL
		    RETURNING id
		 )
		 INSERT INTO resource_lifecycle_events(actor_id, resource_type, resource_id, action)
		 SELECT $3, 'user_card', id::text, 'delete' FROM changed`,
		cardID, userID, actorID,
	)
	return err
}

func cardLast4(raw string) string {
	var b strings.Builder
	for _, r := range raw {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	digits := b.String()
	if len(digits) <= 4 {
		return digits
	}
	return digits[len(digits)-4:]
}
