package grengo

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/skaia/backend/internal/ws"
)

// Service communicates with the internal grengo API server over HTTP.
type Service struct {
	apiURL   string
	client   *http.Client
	passcode string // "p1:p2" for X-Grengo-Passcode header; empty = no auth
	hub      *ws.Hub

	wsConn   *websocket.Conn
	wsConnMu sync.Mutex
}

// NewService creates a grengo service that talks to the internal API.
func NewService(apiURL string, hub *ws.Hub) *Service {
	return &Service{
		apiURL: apiURL,
		client: &http.Client{},
		hub:    hub,
	}
}

// WithPasscode returns a new Service that authenticates with the given passcode pair.
func (s *Service) WithPasscode(p1, p2 string) *Service {
	passcode := p1 + ":" + p2
	return &Service{
		apiURL:   s.apiURL,
		passcode: passcode,
		hub:      s.hub,
		client: &http.Client{
			Transport: &passcodeTransport{
				base:     http.DefaultTransport,
				passcode: passcode,
			},
		},
	}
}

// passcodeTransport injects X-Grengo-Passcode on every outgoing request.
type passcodeTransport struct {
	base     http.RoundTripper
	passcode string
}

func (t *passcodeTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if t.passcode != "" {
		req = req.Clone(req.Context())
		req.Header.Set("X-Grengo-Passcode", t.passcode)
	}
	return t.base.RoundTrip(req)
}

func (s *Service) readAPIError(resp *http.Response) error {
	body, _ := io.ReadAll(resp.Body)
	var errResp struct {
		Error string `json:"error"`
	}
	if json.Unmarshal(body, &errResp) == nil && errResp.Error != "" {
		return fmt.Errorf("grengo API (%d): %s", resp.StatusCode, errResp.Error)
	}
	return fmt.Errorf("grengo API (%d): %s", resp.StatusCode, string(body))
}
