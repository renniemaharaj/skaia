package grengo

import (
	"context"
	"net"
	"net/url"
	"strings"
	"sync"

	"github.com/skaia/backend/internal/ws"
	pb "github.com/skaia/grpc/grengo"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

// Service communicates with the internal grengo API server over gRPC.
type Service struct {
	grpcURL    string
	conn       *grpc.ClientConn
	client     pb.GrengoServiceClient
	passcodeMu sync.RWMutex
	passcode   string // "p1:p2" for X-Grengo-Passcode header; empty = no auth
	hub        *ws.Hub
}

// passcodeInterceptor injects X-Grengo-Passcode on every outgoing gRPC request.
type passcodeInterceptor struct {
	passcode func() string
}

func (t *passcodeInterceptor) UnaryClientInterceptor(ctx context.Context, method string, req, reply interface{}, cc *grpc.ClientConn, invoker grpc.UnaryInvoker, opts ...grpc.CallOption) error {
	if passcode := t.passcode(); passcode != "" {
		ctx = metadata.AppendToOutgoingContext(ctx, "x-grengo-passcode", passcode)
	}
	return invoker(ctx, method, req, reply, cc, opts...)
}

func (t *passcodeInterceptor) StreamClientInterceptor(ctx context.Context, desc *grpc.StreamDesc, cc *grpc.ClientConn, method string, streamer grpc.Streamer, opts ...grpc.CallOption) (grpc.ClientStream, error) {
	if passcode := t.passcode(); passcode != "" {
		ctx = metadata.AppendToOutgoingContext(ctx, "x-grengo-passcode", passcode)
	}
	return streamer(ctx, desc, cc, method, opts...)
}

// NewService creates a grengo service that talks to the internal API.
func NewService(apiURL string, hub *ws.Hub) *Service {
	grpcURL := normalizeGRPCTarget(apiURL)
	svc := &Service{
		grpcURL: grpcURL,
		hub:     hub,
	}
	interceptor := &passcodeInterceptor{passcode: svc.currentPasscode}

	conn, _ := grpc.NewClient(grpcURL,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithUnaryInterceptor(interceptor.UnaryClientInterceptor),
		grpc.WithStreamInterceptor(interceptor.StreamClientInterceptor),
	)
	client := pb.NewGrengoServiceClient(conn)
	svc.conn = conn
	svc.client = client

	return svc
}

func normalizeGRPCTarget(apiURL string) string {
	target := strings.TrimSpace(apiURL)
	if parsed, err := url.Parse(target); err == nil && parsed.Host != "" {
		target = parsed.Host
	} else {
		target = strings.TrimPrefix(target, "http://")
		target = strings.TrimPrefix(target, "https://")
		if host, _, ok := strings.Cut(target, "/"); ok {
			target = host
		}
		if host, _, ok := strings.Cut(target, "?"); ok {
			target = host
		}
	}

	if _, _, err := net.SplitHostPort(target); err == nil {
		return target
	}
	if strings.HasPrefix(target, "[") || !strings.Contains(target, ":") {
		return target + ":9100"
	}
	return target
}

// WithPasscode returns a new Service that authenticates with the given passcode pair.
func (s *Service) WithPasscode(p1, p2 string) *Service {
	svc := NewService(s.grpcURL, s.hub)
	svc.SetPasscode(p1, p2)
	return svc
}

// SetPasscode updates the passcode used by future unary calls and newly-opened
// streams on this service.
func (s *Service) SetPasscode(p1, p2 string) {
	s.passcodeMu.Lock()
	defer s.passcodeMu.Unlock()
	if p1 == "" || p2 == "" {
		s.passcode = ""
		return
	}
	s.passcode = p1 + ":" + p2
}

func (s *Service) currentPasscode() string {
	s.passcodeMu.RLock()
	defer s.passcodeMu.RUnlock()
	return s.passcode
}

// Close gracefully closes the underlying gRPC connection
func (s *Service) Close() {
	if s.conn != nil {
		s.conn.Close()
	}
}
