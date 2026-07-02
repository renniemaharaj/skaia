package grengo

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"sync"
	"time"

	"github.com/skaia/backend/internal/ws"
	pb "github.com/skaia/grpc/grengo"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var (
	warnWatchJobsPasscodeOnce     sync.Once
	warnWatchLogsPasscodeOnce     sync.Once
	warnWatchStatsPasscodeOnce    sync.Once
	warnWatchStoragePasscodeOnce  sync.Once
	warnWatchHardwarePasscodeOnce sync.Once
	warnUnimplementedWatchJobs    sync.Once
	warnUnimplementedWatchLogs    sync.Once
)

func isUnauthenticated(err error) bool {
	return status.Code(err) == codes.Unauthenticated || strings.Contains(err.Error(), "code = Unauthenticated")
}

// WatchJobs connects to the grengo gRPC job stream and broadcasts updates to the frontend hub.
func (s *Service) WatchJobs() {
	waitingForPasscode := false

	for {
		stream, err := s.client.WatchJobs(context.Background(), &pb.EmptyRequest{})
		if err != nil {
			if isUnauthenticated(err) {
				if !waitingForPasscode {
					warnWatchJobsPasscodeOnce.Do(func() {
						// fmt.Println("grengo gRPC: WatchJobs waiting for grengo passcode; job updates will resume after dashboard unlock or GRENGO_API_PASSCODE is set.")
					})
				}
				waitingForPasscode = true
			} else {
				waitingForPasscode = false
				// fmt.Printf("grengo gRPC: failed to open WatchJobs stream: %v, retrying in 5s...\n", err)
			}
			time.Sleep(5 * time.Second)
			continue
		}

		waitingForPasscode = false
		// fmt.Println("grengo gRPC: opened WatchJobs stream")

		for {
			resp, err := stream.Recv()
			if err == io.EOF {
				break
			}
			if err != nil {
				if status.Code(err) == codes.Unimplemented {
					warnUnimplementedWatchJobs.Do(func() {
						// fmt.Printf("grengo gRPC: WatchJobs is not implemented by %s; expected grengo.grpc.GrengoService on port 9100. Check GRENGO_API_URL and restart grengo api.\n", s.grpcURL)
					})
				} else if isUnauthenticated(err) {
					if !waitingForPasscode {
						warnWatchJobsPasscodeOnce.Do(func() {
							// fmt.Println("grengo gRPC: WatchJobs waiting for grengo passcode; job updates will resume after dashboard unlock or GRENGO_API_PASSCODE is set.")
						})
					}
					waitingForPasscode = true
				} else {
					waitingForPasscode = false
					// fmt.Printf("grengo gRPC: WatchJobs disconnected: %v\n", err)
				}
				break
			}

			waitingForPasscode = false

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
	waitingForPasscode := false

	for {
		time.Sleep(5 * time.Second)

		if s.hub == nil {
			continue
		}

		stats, err := s.Stats()
		if err != nil {
			if isUnauthenticated(err) {
				if !waitingForPasscode {
					warnWatchStatsPasscodeOnce.Do(func() {
						warnWatchStatsPasscodeOnce.Do(func() {
							// fmt.Println("grengo gRPC: WatchStats waiting for grengo passcode; telemetry will resume after dashboard unlock or GRENGO_API_PASSCODE is set.")
						})
					})
				}
				waitingForPasscode = true
				time.Sleep(25 * time.Second)
				continue
			}
			waitingForPasscode = false
			continue
		}

		waitingForPasscode = false

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
	waitingForPasscode := false

	for {
		time.Sleep(60 * time.Second)

		if s.hub == nil {
			continue
		}

		info, err := s.Storage()
		if err != nil {
			if isUnauthenticated(err) {
				if !waitingForPasscode {
					warnWatchStoragePasscodeOnce.Do(func() {
						// fmt.Println("grengo gRPC: WatchStorage waiting for grengo passcode; telemetry will resume after dashboard unlock or GRENGO_API_PASSCODE is set.")
					})
				}
				waitingForPasscode = true
				continue
			}

			waitingForPasscode = false
			// fmt.Printf("grengo gRPC: WatchStorage poll error: %v\n", err)
			continue
		}

		waitingForPasscode = false

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
	waitingForPasscode := false

	for {
		time.Sleep(5 * time.Second)

		if s.hub == nil {
			continue
		}

		payload, err := s.GetHardware()
		if err != nil {
			if isUnauthenticated(err) {
				if !waitingForPasscode {
					warnWatchHardwarePasscodeOnce.Do(func() {
						// fmt.Println("grengo gRPC: WatchHardware waiting for grengo passcode; telemetry will resume after dashboard unlock or GRENGO_API_PASSCODE is set.")
					})
				}
				waitingForPasscode = true
				time.Sleep(25 * time.Second)
				continue
			}

			waitingForPasscode = false
			// fmt.Printf("grengo gRPC: WatchHardware poll error: %v\n", err)
			continue
		}

		waitingForPasscode = false

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
	waitingForPasscode := false

	for {
		stream, err := s.client.WatchLogs(context.Background(), &pb.EmptyRequest{})
		if err != nil {
			if isUnauthenticated(err) {
				if !waitingForPasscode {
					warnWatchLogsPasscodeOnce.Do(func() {
						// fmt.Println("grengo gRPC: WatchLogs waiting for grengo passcode; log streaming will resume after dashboard unlock or GRENGO_API_PASSCODE is set.")
					})
				}
				waitingForPasscode = true
			} else {
				waitingForPasscode = false
				// fmt.Printf("grengo gRPC: failed to open WatchLogs stream: %v, retrying in 5s...\n", err)
			}

			time.Sleep(5 * time.Second)
			continue
		}

		waitingForPasscode = false
		// fmt.Println("grengo gRPC: opened WatchLogs stream")

		for {
			resp, err := stream.Recv()
			if err == io.EOF {
				break
			}
			if err != nil {
				if status.Code(err) == codes.Unimplemented {
					warnUnimplementedWatchLogs.Do(func() {
						// fmt.Printf("grengo gRPC: WatchLogs is not implemented by %s; check GRENGO_API_URL and restart grengo api.\n", s.grpcURL)
					})
				} else if isUnauthenticated(err) {
					if !waitingForPasscode {
						warnWatchLogsPasscodeOnce.Do(func() {
							// fmt.Println("grengo gRPC: WatchLogs waiting for grengo passcode; log streaming will resume after dashboard unlock or GRENGO_API_PASSCODE is set.")
						})
					}
					waitingForPasscode = true
				} else {
					waitingForPasscode = false
					// 3fmt.Printf("grengo gRPC: WatchLogs disconnected: %v\n", err)
				}
				break
			}

			waitingForPasscode = false

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
