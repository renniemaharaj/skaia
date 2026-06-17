package database

import (
	"context"
	"database/sql"
	"errors"
)

type txContextKey struct{}

// Executor is the subset of database/sql used by repositories.
type Executor interface {
	Exec(query string, args ...any) (sql.Result, error)
	Query(query string, args ...any) (*sql.Rows, error)
	QueryRow(query string, args ...any) *sql.Row
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// TransactionFunc runs f in a transaction, exposing that transaction through ctx.
type TransactionFunc func(ctx context.Context, f func(ctx context.Context) error) error

// Transactor coordinates transactions across repositories that use context-aware SQL calls.
type Transactor struct {
	db *sql.DB
}

func NewTransactor(db *sql.DB) *Transactor {
	return &Transactor{db: db}
}

func ExecutorFromContext(ctx context.Context, db Executor) Executor {
	if tx, ok := ctx.Value(txContextKey{}).(*sql.Tx); ok {
		return tx
	}
	return db
}

func (t *Transactor) Transactional(ctx context.Context, f func(ctx context.Context) error) error {
	if _, ok := ctx.Value(txContextKey{}).(*sql.Tx); ok {
		return f(ctx)
	}

	tx, err := t.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	txCtx := context.WithValue(ctx, txContextKey{}, tx)
	if err := f(txCtx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil && !errors.Is(rbErr, sql.ErrTxDone) {
			return errors.Join(err, rbErr)
		}
		return err
	}

	return tx.Commit()
}

// TransactionalExecutor runs f with a transaction-backed executor unless exec is already a transaction.
func TransactionalExecutor(ctx context.Context, exec Executor, f func(Executor) error) error {
	if _, ok := exec.(*sql.Tx); ok {
		return f(exec)
	}

	db, ok := exec.(interface {
		BeginTx(context.Context, *sql.TxOptions) (*sql.Tx, error)
	})
	if !ok {
		return f(exec)
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	if err := f(tx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil && !errors.Is(rbErr, sql.ErrTxDone) {
			return errors.Join(err, rbErr)
		}
		return err
	}

	return tx.Commit()
}
