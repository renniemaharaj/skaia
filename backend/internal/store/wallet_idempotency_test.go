package store_test

import (
	"database/sql"
	"fmt"
	"sync"
	"testing"

	"github.com/skaia/backend/internal/store"
	"github.com/skaia/backend/internal/testutil"
	"github.com/skaia/backend/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWalletRepositoryCreateTransactionOnceReplaysOriginal(t *testing.T) {
	db := testutil.OpenTestDB(t)
	repo := store.NewWalletRepository(db)
	userID := createWalletTestUser(t, db)

	first, created, err := repo.CreateTransactionOnce(&models.WalletTransaction{
		UserID: userID, Amount: 250, Type: "credit", Description: "durable reward",
	}, "test.reward", "opaque-request-key")
	require.NoError(t, err)
	assert.True(t, created)

	replayed, created, err := repo.CreateTransactionOnce(&models.WalletTransaction{
		UserID: userID, Amount: 250, Type: "credit", Description: "durable reward",
	}, "test.reward", "opaque-request-key")
	require.NoError(t, err)
	assert.False(t, created)
	assert.Equal(t, first.ID, replayed.ID)
}

func TestWalletRepositoryCreateTransactionOnceRejectsPayloadConflict(t *testing.T) {
	db := testutil.OpenTestDB(t)
	repo := store.NewWalletRepository(db)
	userID := createWalletTestUser(t, db)

	_, _, err := repo.CreateTransactionOnce(&models.WalletTransaction{
		UserID: userID, Amount: 250, Type: "credit", Description: "durable reward",
	}, "test.reward", "reused-key")
	require.NoError(t, err)

	_, _, err = repo.CreateTransactionOnce(&models.WalletTransaction{
		UserID: userID, Amount: 500, Type: "credit", Description: "durable reward",
	}, "test.reward", "reused-key")
	assert.ErrorIs(t, err, store.ErrIdempotencyConflict)
}

func TestWalletRepositoryCreateTransactionOnceConcurrentReplay(t *testing.T) {
	db := testutil.OpenTestDB(t)
	repo := store.NewWalletRepository(db)
	userID := createWalletTestUser(t, db)

	const workers = 12
	start := make(chan struct{})
	ids := make(chan int64, workers)
	errs := make(chan error, workers)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			tx, _, err := repo.CreateTransactionOnce(&models.WalletTransaction{
				UserID: userID, Amount: 125, Type: "credit", Description: "concurrent reward",
			}, "test.concurrent_reward", "one-logical-operation")
			if err != nil {
				errs <- err
				return
			}
			ids <- tx.ID
		}()
	}
	close(start)
	wg.Wait()
	close(ids)
	close(errs)

	for err := range errs {
		require.NoError(t, err)
	}
	var expected int64
	for id := range ids {
		if expected == 0 {
			expected = id
		}
		assert.Equal(t, expected, id)
	}
	assert.NotZero(t, expected)

	var count int
	require.NoError(t, db.QueryRow(`
		SELECT COUNT(*) FROM user_wallet_transactions
		WHERE user_id = $1 AND operation_scope = 'test.concurrent_reward'
	`, userID).Scan(&count))
	assert.Equal(t, 1, count)
}

func createWalletTestUser(t *testing.T, db *sql.DB) int64 {
	t.Helper()
	var userID int64
	username := testutil.UniqueStr("wallet_once")
	err := db.QueryRow(`
		INSERT INTO users (username, email, display_name)
		VALUES ($1, $2, $3) RETURNING id
	`, username, fmt.Sprintf("%s@example.com", username), username).Scan(&userID)
	require.NoError(t, err)
	return userID
}
