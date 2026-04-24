package user

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

func parseID(r *http.Request, param string) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, param), 10, 64)
}
