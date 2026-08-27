package ws

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	wspb "github.com/skaia/grpc/ws"
	"google.golang.org/protobuf/proto"
)

func TestGrengoBrowserActionIsRejectedWithoutControlPlaneCall(t *testing.T) {
	hub := NewHub()
	client := newSecurityTestClient(hub, 7)
	client.handleMessage(Message{Type: GrengoJobAction, Payload: json.RawMessage(`{"request_id":"req-1"}`)})

	var serverMessage wspb.ServerMessage
	if err := proto.Unmarshal(<-client.Send, &serverMessage); err != nil {
		t.Fatal(err)
	}
	if serverMessage.GetType() != string(GrengoActionAck) {
		t.Fatalf("message type = %q", serverMessage.GetType())
	}
	var ack map[string]any
	if err := json.Unmarshal(serverMessage.GetPayload(), &ack); err != nil {
		t.Fatal(err)
	}
	if ack["accepted"] != false || ack["request_id"] != "req-1" {
		t.Fatalf("ack = %#v", ack)
	}
}

func TestPresenceCannotOverrideServerIdentity(t *testing.T) {
	hub := NewHub()
	client := newSecurityTestClient(hub, 7)
	client.UserName = "canonical"
	client.Avatar = "/canonical.png"
	client.handlePresence(Message{Type: Presence, Payload: json.RawMessage(`{
		"route":"/forum", "user_name":"admin", "avatar":"/spoof.png"
	}`)})
	update := <-hub.presenceUpdates
	if update.UserName != "canonical" || update.Avatar != "/canonical.png" {
		t.Fatalf("presence identity = %q %q", update.UserName, update.Avatar)
	}
}

func TestTeleportRequiresEstablishedDBPermission(t *testing.T) {
	hub := NewHub()
	hub.AccountTrustAuthorizer = func(context.Context, int64) error { return nil }
	hub.PermissionAuthorizer = func(int64, string) (bool, error) { return false, nil }
	client := newSecurityTestClient(hub, 7)
	client.handleTp(Message{Type: Tp, Payload: json.RawMessage(`{"target_user_id":8,"route":"/forum"}`)})
	if len(hub.teleport) != 0 {
		t.Fatal("teleport was queued without DB-backed permission")
	}
}

func newSecurityTestClient(hub *Hub, userID int64) *Client {
	ctx, cancel := context.WithCancel(context.Background())
	return &Client{
		Hub:        hub,
		UserID:     userID,
		Send:       make(chan []byte, 8),
		ctx:        ctx,
		cancel:     cancel,
		done:       make(chan struct{}),
		registered: make(chan bool, 1),
		apiSem:     make(chan struct{}, 1),
	}
}

func TestClientRejectsServerOnlyAndUnknownMessages(t *testing.T) {
	hub := NewHub()
	client := newSecurityTestClient(hub, 0)

	for _, messageType := range []MessageType{ApiResponse, UserUpdate, PageUpdate, "unknown"} {
		client.handleMessage(Message{Type: messageType})
		if len(hub.broadcast) != 0 {
			t.Fatalf("%q was accepted as a client broadcast", messageType)
		}
		if len(client.Send) == 0 {
			t.Fatalf("%q did not receive a fail-closed error", messageType)
		}
		<-client.Send
	}
}

func TestSubscriptionPolicyDeniesCrossUserAndPrivateResources(t *testing.T) {
	policy := SubscriptionPolicy{
		CanViewPage: func(pageID, userID int64) error {
			if pageID == 10 && userID == 7 {
				return nil
			}
			return ErrSubscriptionDenied
		},
		CanJoinConversation: func(conversationID, userID int64) error {
			if conversationID == 20 && userID == 7 {
				return nil
			}
			return ErrSubscriptionDenied
		},
		CanViewOrder: func(orderID, userID int64) error {
			if orderID == 30 && userID == 7 {
				return nil
			}
			return ErrSubscriptionDenied
		},
		CanViewProvisioning: func(instanceID, userID int64) error {
			if instanceID == 40 && userID == 7 {
				return nil
			}
			return ErrSubscriptionDenied
		},
		HasPermission: func(userID int64, permission string) (bool, error) {
			return userID == 9 && permission == "admin.general", nil
		},
	}

	owner := &Client{UserID: 7}
	admin := &Client{UserID: 9}
	guest := &Client{}
	allowed := []struct {
		client       *Client
		resourceType string
		resourceID   int64
	}{
		{owner, "user", 7},
		{owner, "inbox", 7},
		{owner, "page", 10},
		{owner, "inbox_conversation", 20},
		{owner, "order", 30},
		{owner, "provisioning_logs", 40},
		{admin, "log", 0},
		{admin, "provisioning_logs", 99},
		{guest, "thread", 1},
	}
	for _, tc := range allowed {
		if err := policy.Authorize(tc.client, tc.resourceType, tc.resourceID); err != nil {
			t.Fatalf("expected %s:%d to be allowed: %v", tc.resourceType, tc.resourceID, err)
		}
	}

	denied := []struct {
		client       *Client
		resourceType string
		resourceID   int64
	}{
		{guest, "user", 7},
		{owner, "user", 8},
		{owner, "inbox", 8},
		{guest, "page", 10},
		{guest, "inbox_conversation", 20},
		{guest, "order", 30},
		{guest, "log", 0},
		{guest, "provisioning_logs", 40},
		{owner, "unknown", 1},
	}
	for _, tc := range denied {
		if err := policy.Authorize(tc.client, tc.resourceType, tc.resourceID); !errors.Is(err, ErrSubscriptionDenied) {
			t.Fatalf("expected %s:%d to be denied, got %v", tc.resourceType, tc.resourceID, err)
		}
	}
}

func TestSubscribeFailsClosedWithoutPolicy(t *testing.T) {
	hub := NewHub()
	client := newSecurityTestClient(hub, 7)
	if hub.Subscribe(client, "user", 7) {
		t.Fatal("subscription succeeded without an authorizer")
	}
	if len(hub.subscriptions) != 0 {
		t.Fatal("denied subscription entered the hub registry")
	}
}

func TestLateSubscriptionCannotRetainDisconnectedClient(t *testing.T) {
	hub := NewHub()
	client := newSecurityTestClient(hub, 7)

	hub.handleSubscribe(ResourceSubscription{Client: client, ResourceType: "user", ResourceID: 7})
	if len(hub.subscriptions) != 0 || len(hub.clientSubs) != 0 {
		t.Fatal("disconnected client was retained by a late subscription")
	}
}

func TestSubscriptionsAreDeduplicatedAndBoundedPerClient(t *testing.T) {
	hub := NewHub()
	hub.cfg.MaxSubscriptions = 1
	hub.SubscriptionAuthorizer = func(*Client, string, int64) error { return nil }
	client := newSecurityTestClient(hub, 7)
	hub.clients[client] = true

	if !hub.Subscribe(client, "page", 1) {
		t.Fatal("initial authorized subscription failed")
	}
	if !hub.Subscribe(client, "page", 1) {
		t.Fatal("duplicate authorized subscription failed")
	}
	if got := len(hub.subscriptions[subscriptionKey("page", 1)]); got != 1 {
		t.Fatalf("duplicate subscription count = %d", got)
	}
	if hub.Subscribe(client, "page", 2) {
		t.Fatal("subscription succeeded above the per-client cap")
	}
	if got := len(hub.clientSubs[client]); got != 1 {
		t.Fatalf("client subscription count = %d", got)
	}
}

func TestPrivateUserPropagationCannotReachSubscriber(t *testing.T) {
	hub := NewHub()
	target := newSecurityTestClient(hub, 7)
	attacker := newSecurityTestClient(hub, 8)
	hub.clients[target] = true
	hub.clients[attacker] = true
	hub.subscriptions[subscriptionKey("user", 7)] = []*Client{attacker}

	hub.PropagateUser(7, map[string]any{"new_token": "secret"})
	if len(target.Send) != 1 {
		t.Fatal("target user did not receive its private update")
	}
	if len(attacker.Send) != 0 {
		t.Fatal("generic subscriber received another user's private update")
	}
}

func TestAPIBridgeBindsIdentityAndFiltersHeaders(t *testing.T) {
	hub := NewHub()
	hub.cfg.APIBridgeEnabled = true
	hub.cfg.APIRequestTimeout = time.Second
	hub.cfg.APIResponseBytes = 1024
	hub.ApiDispatcher = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer bound-token" {
			t.Errorf("authorization header = %q", got)
		}
		if got := r.Header.Get("X-Forwarded-For"); got != "" {
			t.Errorf("forwarded spoof header survived: %q", got)
		}
		if got := r.Header.Get("Idempotency-Key"); got != "safe" {
			t.Errorf("allowed header was dropped: %q", got)
		}
		w.Header().Set("Retry-After", "3")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	client := newSecurityTestClient(hub, 7)
	client.AuthToken = "bound-token"
	client.RealIP = "203.0.113.7"
	client.Host = "example.test"

	request := &wspb.ApiRequest{
		RequestId: 42,
		Route:     "/pages",
		Method:    http.MethodPost,
		Headers: map[string]string{
			"Authorization":   "Bearer attacker-token",
			"X-Forwarded-For": "127.0.0.1",
			"Idempotency-Key": "safe",
		},
	}
	raw, _ := proto.Marshal(request)
	client.handleApiRequest(Message{Type: ApiRequest, Payload: raw})
	response := readAPIResponse(t, client.Send)
	if response.RequestId != 42 || response.Status != http.StatusCreated {
		t.Fatalf("unexpected response: %#v", response)
	}
	if response.Headers["Retry-After"] != "3" {
		t.Fatalf("response headers were not preserved: %#v", response.Headers)
	}
}

func TestAPIBridgeDisabledPreservesRequestCorrelation(t *testing.T) {
	hub := NewHub()
	client := newSecurityTestClient(hub, 7)

	raw, _ := proto.Marshal(&wspb.ApiRequest{RequestId: 91, Route: "/health", Method: http.MethodGet})
	client.handleApiRequest(Message{Type: ApiRequest, Payload: raw})
	response := readAPIResponse(t, client.Send)
	if response.RequestId != 91 || response.Status != http.StatusServiceUnavailable {
		t.Fatalf("unexpected disabled response: %#v", response)
	}
}

func TestAPIBridgeRejectsOversizedResponse(t *testing.T) {
	hub := NewHub()
	hub.cfg.APIBridgeEnabled = true
	hub.cfg.APIRequestTimeout = time.Second
	hub.cfg.APIResponseBytes = 4
	hub.ApiDispatcher = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("too large"))
	})
	client := newSecurityTestClient(hub, 7)

	raw, _ := proto.Marshal(&wspb.ApiRequest{RequestId: 92, Route: "/health", Method: http.MethodGet})
	client.handleApiRequest(Message{Type: ApiRequest, Payload: raw})
	response := readAPIResponse(t, client.Send)
	if response.RequestId != 92 || response.Status != http.StatusBadGateway {
		t.Fatalf("unexpected overflow response: %#v", response)
	}
}

func TestAPIBridgeRejectsInvalidRequestAndOversizedResponseHeaders(t *testing.T) {
	t.Run("request control characters", func(t *testing.T) {
		hub := NewHub()
		hub.cfg.APIBridgeEnabled = true
		hub.cfg.APIRequestTimeout = time.Second
		hub.cfg.APIResponseBytes = 1024
		var dispatched atomic.Bool
		hub.ApiDispatcher = http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
			dispatched.Store(true)
		})
		client := newSecurityTestClient(hub, 7)

		raw, _ := proto.Marshal(&wspb.ApiRequest{
			RequestId: 97,
			Route:     "/health",
			Method:    http.MethodGet,
			Headers:   map[string]string{"Idempotency-Key": "safe\r\nX-Forged: yes"},
		})
		client.handleApiRequest(Message{Type: ApiRequest, Payload: raw})
		response := readAPIResponse(t, client.Send)
		if response.RequestId != 97 || response.Status != http.StatusBadRequest {
			t.Fatalf("unexpected invalid-header response: %#v", response)
		}
		if dispatched.Load() {
			t.Fatal("request with invalid headers reached the HTTP dispatcher")
		}
	})

	t.Run("response metadata", func(t *testing.T) {
		hub := NewHub()
		hub.cfg.APIBridgeEnabled = true
		hub.cfg.APIRequestTimeout = time.Second
		hub.cfg.APIResponseBytes = 1024
		hub.ApiDispatcher = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Location", strings.Repeat("a", maxAPIHeaderBytes+1))
			w.WriteHeader(http.StatusCreated)
		})
		client := newSecurityTestClient(hub, 7)

		raw, _ := proto.Marshal(&wspb.ApiRequest{RequestId: 98, Route: "/health", Method: http.MethodGet})
		client.handleApiRequest(Message{Type: ApiRequest, Payload: raw})
		response := readAPIResponse(t, client.Send)
		if response.RequestId != 98 || response.Status != http.StatusBadGateway {
			t.Fatalf("unexpected response-header overflow: %#v", response)
		}
	})
}

func TestAPIBridgeLimitsConcurrentRequestsPerClient(t *testing.T) {
	hub := NewHub()
	hub.cfg.APIBridgeEnabled = true
	hub.cfg.APIRequestTimeout = time.Second
	hub.cfg.APIResponseBytes = 1024
	started := make(chan struct{})
	release := make(chan struct{})
	hub.ApiDispatcher = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		close(started)
		<-release
		w.WriteHeader(http.StatusNoContent)
	})
	client := newSecurityTestClient(hub, 7)

	first, _ := proto.Marshal(&wspb.ApiRequest{RequestId: 93, Route: "/health", Method: http.MethodGet})
	second, _ := proto.Marshal(&wspb.ApiRequest{RequestId: 94, Route: "/health", Method: http.MethodGet})
	client.handleApiRequest(Message{Type: ApiRequest, Payload: first})
	<-started
	client.handleApiRequest(Message{Type: ApiRequest, Payload: second})

	rejected := readAPIResponse(t, client.Send)
	if rejected.RequestId != 94 || rejected.Status != http.StatusTooManyRequests {
		t.Fatalf("unexpected saturation response: %#v", rejected)
	}
	close(release)
	completed := readAPIResponse(t, client.Send)
	if completed.RequestId != 93 || completed.Status != http.StatusNoContent {
		t.Fatalf("unexpected completed response: %#v", completed)
	}
}

func TestAPIBridgeLimitsConcurrentRequestsGlobally(t *testing.T) {
	hub := NewHub()
	hub.cfg.APIBridgeEnabled = true
	hub.cfg.APIRequestTimeout = time.Second
	hub.cfg.APIResponseBytes = 1024
	hub.apiSem = make(chan struct{}, 1)
	started := make(chan struct{})
	release := make(chan struct{})
	hub.ApiDispatcher = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		close(started)
		<-release
		w.WriteHeader(http.StatusNoContent)
	})
	firstClient := newSecurityTestClient(hub, 7)
	secondClient := newSecurityTestClient(hub, 8)

	first, _ := proto.Marshal(&wspb.ApiRequest{RequestId: 95, Route: "/health", Method: http.MethodGet})
	second, _ := proto.Marshal(&wspb.ApiRequest{RequestId: 96, Route: "/health", Method: http.MethodGet})
	firstClient.handleApiRequest(Message{Type: ApiRequest, Payload: first})
	<-started
	secondClient.handleApiRequest(Message{Type: ApiRequest, Payload: second})

	rejected := readAPIResponse(t, secondClient.Send)
	if rejected.RequestId != 96 || rejected.Status != http.StatusServiceUnavailable {
		t.Fatalf("unexpected global saturation response: %#v", rejected)
	}
	close(release)
	completed := readAPIResponse(t, firstClient.Send)
	if completed.RequestId != 95 || completed.Status != http.StatusNoContent {
		t.Fatalf("unexpected completed response: %#v", completed)
	}
}

func TestAPIBridgeDisconnectCancelsAndDoesNotSendOnClosedQueue(t *testing.T) {
	hub := NewHub()
	hub.cfg.APIBridgeEnabled = true
	hub.cfg.APIRequestTimeout = time.Second
	hub.cfg.APIResponseBytes = 1024
	started := make(chan struct{})
	var cancelled atomic.Bool
	hub.ApiDispatcher = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		<-r.Context().Done()
		cancelled.Store(true)
	})
	client := newSecurityTestClient(hub, 7)

	raw, _ := proto.Marshal(&wspb.ApiRequest{RequestId: 5, Route: "/health", Method: http.MethodGet})
	client.handleApiRequest(Message{Type: ApiRequest, Payload: raw})
	<-started
	client.close()

	deadline := time.Now().Add(time.Second)
	for !cancelled.Load() && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if !cancelled.Load() {
		t.Fatal("disconnect did not cancel the in-flight API request")
	}
}

func TestClientLifecycleAccountingIsIdempotent(t *testing.T) {
	hub := NewHub()
	client := newSecurityTestClient(hub, 7)

	hub.handleUnregister(client)
	if got := hub.connCount.Load(); got != 0 {
		t.Fatalf("unregister-before-register count = %d", got)
	}
	if !hub.handleRegister(client) {
		t.Fatal("client registration failed")
	}
	if got := hub.connCount.Load(); got != 1 {
		t.Fatalf("registered count = %d", got)
	}
	originalClientID := client.ClientID
	if !hub.handleRegister(client) {
		t.Fatal("duplicate registration failed")
	}
	if got := hub.connCount.Load(); got != 1 {
		t.Fatalf("duplicate registration count = %d", got)
	}
	if client.ClientID != originalClientID {
		t.Fatalf("duplicate registration changed client ID from %d to %d", originalClientID, client.ClientID)
	}
	hub.handleUnregister(client)
	hub.handleUnregister(client)
	if got := hub.connCount.Load(); got != 0 {
		t.Fatalf("duplicate unregister count = %d", got)
	}
}

func TestClientRegistrationLimitDoesNotCorruptAccounting(t *testing.T) {
	hub := NewHub()
	hub.cfg.MaxConnections = 1
	first := newSecurityTestClient(hub, 7)
	second := newSecurityTestClient(hub, 8)

	if !hub.handleRegister(first) {
		t.Fatal("first registration failed")
	}
	if hub.handleRegister(second) {
		t.Fatal("over-capacity registration succeeded")
	}
	if got := hub.connCount.Load(); got != 1 {
		t.Fatalf("rejection changed connection count to %d", got)
	}
	hub.handleUnregister(first)
	if got := hub.connCount.Load(); got != 0 {
		t.Fatalf("unregister changed connection count to %d", got)
	}
}

func TestNormalizeAPIRouteRejectsTraversalAndAbsoluteURLs(t *testing.T) {
	for _, route := range []string{"", "pages", "/api/../admin", "https://example.com/api/health", `\api\health`} {
		if normalized, err := normalizeAPIRoute(route); err == nil {
			t.Fatalf("route %q normalized unexpectedly to %q", route, normalized)
		}
	}
	if normalized, err := normalizeAPIRoute("/pages/7?view=full"); err != nil || normalized != "/api/pages/7?view=full" {
		t.Fatalf("valid route normalization = %q, %v", normalized, err)
	}
}

func readAPIResponse(t *testing.T, send <-chan []byte) *wspb.ApiResponse {
	t.Helper()
	select {
	case encoded := <-send:
		message, err := decodeProtoMessage(encoded)
		if err != nil {
			t.Fatalf("decode server message: %v", err)
		}
		var response wspb.ApiResponse
		if err := proto.Unmarshal(message.Payload, &response); err != nil {
			t.Fatalf("decode API response: %v", err)
		}
		return &response
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for API response")
		return nil
	}
}
