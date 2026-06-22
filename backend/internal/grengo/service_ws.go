package grengo

import (
	"context"
	"encoding/json"
	"errors"
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

// WatchStats polls grengo for Docker container stats every 5 seconds and broadcasts
// the results to all connected WebSocket clients as grengo:stats_update events.
func (s *Service) WatchStats() {
	for {
		time.Sleep(5 * time.Second)
		if s.hub == nil {
			continue
		}

		stats, err := s.Stats()
		if err != nil {
			fmt.Printf("grengo gRPC: WatchStats poll error: %v\n", err)
			continue
		}

		data, err := json.Marshal(stats)
		if err != nil {
			continue
		}
		s.hub.Broadcast(&ws.Message{
			Type:    ws.GrengoStatsUpdate,
			Payload: json.RawMessage(data),
		})
	}
}

// WatchStorage polls grengo for upload storage usage every 60 seconds and broadcasts
// the results to all connected WebSocket clients as grengo:storage_update events.
func (s *Service) WatchStorage() {
	// Start immediately then repeat every 60s.
	for {
		time.Sleep(60 * time.Second)
		if s.hub == nil {
			continue
		}

		info, err := s.Storage()
		if err != nil {
			fmt.Printf("grengo gRPC: WatchStorage poll error: %v\n", err)
			continue
		}

		data, err := json.Marshal(info)
		if err != nil {
			continue
		}
		s.hub.Broadcast(&ws.Message{
			Type:    ws.GrengoStorageUpdate,
			Payload: json.RawMessage(data),
		})
	}
}

// WatchHardware polls grengo for hardware metrics every 5 seconds and broadcasts
// the results to all connected WebSocket clients as grengo:hardware_update events.
// This drives the CPU cores, RAM, temperature, and disk I/O panels in the dashboard.
func (s *Service) WatchHardware() {
	for {
		time.Sleep(5 * time.Second)
		if s.hub == nil {
			continue
		}

		payload, err := s.GetHardware()
		if err != nil {
			fmt.Printf("grengo gRPC: WatchHardware poll error: %v\n", err)
			continue
		}

		data, err := json.Marshal(payload)
		if err != nil {
			continue
		}
		s.hub.Broadcast(&ws.Message{
			Type:    ws.GrengoHardwareUpdate,
			Payload: json.RawMessage(data),
		})
	}
}

// WatchLogs connects to the grengo gRPC log stream and broadcasts lines to the
// frontend using the existing logs:stream websocket event shape.
func (s *Service) WatchLogs() {
	for {
		stream, err := s.client.WatchLogs(context.Background(), &pb.EmptyRequest{})
		if err != nil {
			fmt.Printf("grengo gRPC: failed to open WatchLogs stream: %v, retrying in 5s...\n", err)
			time.Sleep(5 * time.Second)
			continue
		}
		fmt.Printf("grengo gRPC: opened WatchLogs stream\n")

		for {
			resp, err := stream.Recv()
			if err == io.EOF {
				break
			}
			if err != nil {
				if status.Code(err) == codes.Unimplemented {
					fmt.Printf("grengo gRPC: WatchLogs is not implemented by %s; check GRENGO_API_URL and restart grengo api.\n", s.grpcURL)
				}
				if status.Code(err) == codes.Unauthenticated {
					fmt.Printf("grengo gRPC: WatchLogs requires GRENGO_API_PASSCODE for background updates; stopping watcher.\n")
					return
				}
				fmt.Printf("grengo gRPC: WatchLogs disconnected: %v\n", err)
				break
			}

			if s.hub == nil {
				continue
			}
			line := json.RawMessage(resp.Output)
			if !json.Valid(line) {
				fallback, _ := json.Marshal(map[string]string{
					"level":  "INFO",
					"prefix": "grengo",
					"msg":    resp.Output,
				})
				line = json.RawMessage(fallback)
			}
			var data any
			if err := json.Unmarshal(line, &data); err != nil {
				continue
			}
			s.hub.PropagateLog(data)
		}

		time.Sleep(5 * time.Second)
	}
}

func (s *Service) SendAction(action []byte) (string, error) {
	resp, err := s.client.SendAction(context.Background(), &pb.SendActionRequest{
		Action: action,
	})
	if err != nil {
		return "", err
	}
	if !resp.Accepted {
		return "", errors.New(resp.Error)
	}
	return resp.JobId, nil
}
