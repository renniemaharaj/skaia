package events

import (
	"net/http"

	"github.com/skaia/backend/internal/utils"
)

// ClientIP extracts the client's real IP address from an HTTP request.
// It delegates to utils.RealIP which checks CF-Connecting-IP, X-Forwarded-For,
// X-Real-IP, and RemoteAddr in that order.
func ClientIP(r *http.Request) string {
	return utils.RealIP(r)
}
