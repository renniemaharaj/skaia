package integration

import (
	"database/sql"
	"fmt"
	"sync/atomic"
)

// counter generates unique suffixes for test data so concurrent / repeated
// runs never collide on unique-constrained columns.
var counter int64

func uniq(prefix string) string {
	return fmt.Sprintf("%s_%d", prefix, atomic.AddInt64(&counter, 1))
}

// grantAdminRole directly grants the "admin" role to the given user ID.
// The admin role is expected to exist from the initial migration seed.
func grantAdminRole(db *sql.DB, userID int64) error {
	_, err := db.Exec(`
		INSERT INTO user_roles (user_id, role_id)
		SELECT $1, id FROM roles WHERE name = 'admin'
		ON CONFLICT DO NOTHING`, userID)
	return err
}
