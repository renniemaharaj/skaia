package store

import (
	"github.com/skaia/backend/database"
	"github.com/skaia/backend/models"
)

type sqlWalletRepository struct {
	db database.Executor
}

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

func (r *sqlWalletRepository) GetTransactions(userID int64, limit, offset int) ([]*models.WalletTransaction, error) {
	query := `
		SELECT id, user_id, amount, type, description, created_at
		FROM user_wallet_transactions
		WHERE user_id = $1
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
		cards = append(cards, &c)
	}
	return cards, nil
}

func (r *sqlWalletRepository) UpdateCard(card *models.UserCard) (*models.UserCard, error) {
	query := `
		UPDATE user_cards
		SET card_name = $1, card_description = $2, card_type = $3, is_credit = $4, card_number = $5, cvv = $6, expiry_month = $7, expiry_year = $8
		WHERE id = $9 AND user_id = $10
	`
	_, err := r.db.Exec(query, card.CardName, card.CardDescription, card.CardType, card.IsCredit, card.CardNumber, card.CVV, card.ExpiryMonth, card.ExpiryYear, card.ID, card.UserID)
	return card, err
}

func (r *sqlWalletRepository) DeleteCard(cardID, userID int64) error {
	_, err := r.db.Exec(`DELETE FROM user_cards WHERE id = $1 AND user_id = $2`, cardID, userID)
	return err
}
