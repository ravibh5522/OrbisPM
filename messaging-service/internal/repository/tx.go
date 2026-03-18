package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/messaging-service/internal/pkg/tenant"
)

// DBTX abstracts a pgx connection or transaction.
type DBTX interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// TxManager wraps the pgxpool for transaction management.
type TxManager struct {
	pool *pgxpool.Pool
}

// NewTxManager creates a new TxManager.
func NewTxManager(pool *pgxpool.Pool) *TxManager {
	return &TxManager{pool: pool}
}

// WithTx executes fn inside a database transaction.
// If the context contains an org_id, SET LOCAL is called to activate RLS.
func (tm *TxManager) WithTx(ctx context.Context, fn func(tx pgx.Tx) error) error {
	tx, err := tm.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	// Set RLS tenant context if org_id is present
	if orgID := tenant.OrgID(ctx); orgID != uuid.Nil {
		if _, err := tx.Exec(ctx, "SELECT set_config('app.current_org_id', $1, true)", orgID.String()); err != nil {
			return fmt.Errorf("set rls context: %w", err)
		}
	}

	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Pool returns the underlying connection pool.
func (tm *TxManager) Pool() *pgxpool.Pool {
	return tm.pool
}

// conn returns the appropriate query executor: tx if non-nil, otherwise pool.
func conn(pool *pgxpool.Pool, tx pgx.Tx) DBTX {
	if tx != nil {
		return tx
	}
	return pool
}

// isPgUniqueViolation returns true if the error is a PostgreSQL unique_violation (23505).
func isPgUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
