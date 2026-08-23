package status

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	defaultCheckTimeout = 500 * time.Millisecond
	defaultMaxAge       = 30 * time.Second
)

type dependencyCheck struct {
	name     string
	required bool
	check    func(context.Context) error
}

type Checker struct {
	db      *sql.DB
	checks  []dependencyCheck
	timeout time.Duration
	maxAge  time.Duration
	now     func() time.Time
}

func NewChecker(db *sql.DB, rdb *redis.Client, indexPath string) *Checker {
	if indexPath == "" {
		indexPath = filepath.Join("frontend", "dist", "index.html")
	}
	return &Checker{
		db:      db,
		timeout: defaultCheckTimeout,
		maxAge:  defaultMaxAge,
		now:     time.Now,
		checks: []dependencyCheck{
			{name: "database", required: true, check: func(ctx context.Context) error {
				if db == nil {
					return errors.New("unavailable")
				}
				return db.PingContext(ctx)
			}},
			{name: "schema", required: true, check: func(ctx context.Context) error {
				if db == nil {
					return errors.New("unavailable")
				}
				var table *string
				if err := db.QueryRowContext(ctx, `SELECT to_regclass('public.service_incidents')::text`).Scan(&table); err != nil || table == nil || *table == "" {
					return errors.New("unavailable")
				}
				return nil
			}},
			{name: "cache", required: true, check: func(ctx context.Context) error {
				if rdb == nil {
					return errors.New("unavailable")
				}
				return rdb.Ping(ctx).Err()
			}},
			{name: "web", required: true, check: func(context.Context) error {
				info, err := os.Stat(indexPath)
				if err != nil || info.IsDir() || info.Size() == 0 {
					return errors.New("unavailable")
				}
				return nil
			}},
		},
	}
}

func (c *Checker) Check(ctx context.Context) []Component {
	if c == nil {
		return nil
	}
	results := make([]Component, len(c.checks))
	var wg sync.WaitGroup
	for i, check := range c.checks {
		wg.Add(1)
		go func() {
			defer wg.Done()
			started := c.now()
			checkCtx, cancel := context.WithTimeout(ctx, c.timeout)
			defer cancel()
			err := check.check(checkCtx)
			state := StateOperational
			reason := ""
			if err != nil {
				state = StateUnavailable
				reason = "dependency_unavailable"
				if errors.Is(err, context.DeadlineExceeded) || errors.Is(checkCtx.Err(), context.DeadlineExceeded) {
					reason = "dependency_timeout"
				}
			}
			results[i] = Component{Name: check.name, State: state, Required: check.required, CheckedAt: c.now().UTC(), Latency: c.now().Sub(started), ReasonCode: reason}
		}()
	}
	wg.Wait()
	return results
}

func aggregateState(components []Component) State {
	state := StateOperational
	for _, component := range components {
		if component.Required && component.State == StateUnavailable {
			return StateUnavailable
		}
		if component.State != StateOperational {
			state = StateDegraded
		}
	}
	return state
}

func (c *Checker) Diagnostics(ctx context.Context) Diagnostics {
	readiness := c.Readiness(ctx)
	out := Diagnostics{State: readiness.State, UpdatedAt: readiness.UpdatedAt, Components: make([]DiagnosticComponent, 0, len(readiness.Components))}
	for _, component := range readiness.Components {
		out.Components = append(out.Components, DiagnosticComponent{Name: component.Name, State: component.State, Required: component.Required, CheckedAt: component.CheckedAt, LatencyMS: component.Latency.Milliseconds(), ReasonCode: component.ReasonCode})
	}
	if c.db != nil {
		stats := c.db.Stats()
		out.Runtime.DBOpenConnections = stats.OpenConnections
		out.Runtime.DBInUseConnections = stats.InUse
		out.Runtime.DBMaxOpenConnections = stats.MaxOpenConnections
		out.Runtime.DBWaitCount = stats.WaitCount
		queueCtx, cancel := context.WithTimeout(ctx, c.timeout)
		defer cancel()
		_ = c.db.QueryRowContext(queueCtx, `SELECT COUNT(*), COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(available_at)))::BIGINT, 0) FROM store_order_fulfilments WHERE status = 'pending' AND available_at <= NOW()`).Scan(&out.Runtime.FulfilmentQueueReady, &out.Runtime.FulfilmentQueueOldestSeconds)
	}
	return out
}

func (c *Checker) Readiness(ctx context.Context) Readiness {
	components := c.Check(ctx)
	return Readiness{State: aggregateState(components), Components: components, UpdatedAt: c.now().UTC()}
}
