package grengo

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/skaia/backend/internal/ws"
	pb "github.com/skaia/grpc/grengo"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// WatchJobs connects to the grengo gRPC job stream and broadcasts updates to the frontend hub.
func (s *Service) WatchJobs() {
	for {
		stream, err := s.client.WatchJobs(context.Background(), &pb.EmptyRequest{})
		if err != nil {
			fmt.Printf("grengo gRPC: failed to open WatchJobs stream: %v, retrying in 5s...\n", err)
			time.Sleep(5 * time.Second)
			continue
		}
		fmt.Printf("grengo gRPC: opened WatchJobs stream\n")

		for {
			resp, err := stream.Recv()
			if err == io.EOF {
				break
			}
			if err != nil {
				if status.Code(err) == codes.Unimplemented {
					fmt.Printf("grengo gRPC: WatchJobs is not implemented by %s; expected grengo.grpc.GrengoService on port 9100. Check GRENGO_API_URL and restart grengo api.\n", s.grpcURL)
				}
				if status.Code(err) == codes.Unauthenticated {
					fmt.Printf("grengo gRPC: WatchJobs requires GRENGO_API_PASSCODE for background updates; stopping watcher.\n")
					return
				}
				fmt.Printf("grengo gRPC: WatchJobs disconnected: %v\n", err)
				break
			}

			// In gRPC, WatchJobs currently returns JobEvent which represents JobStatus.
			if s.hub != nil {
				s.hub.Broadcast(&ws.Message{
					Type:    ws.GrengoJobUpdate,
					Payload: json.RawMessage(resp.EventJson),
				})
			}
		}

		time.Sleep(5 * time.Second)
	}
}

func (s *Service) SendAction(action []byte) {
	_, _ = s.client.SendAction(context.Background(), &pb.SendActionRequest{
		Action: action,
	})
}
