package middleware

import (
	"testing"
	"time"
)

func TestDatasourcePreviewUsesExecutionBudget(t *testing.T) {
	scope, limit, window, cost := mutationBudgetClass("/api/config/datasources/preview")
	if scope != "datasource-execute" || limit != 10 || window != time.Minute || cost != 1 {
		t.Fatalf("unexpected preview budget: scope=%q limit=%d window=%s cost=%d", scope, limit, window, cost)
	}
}
