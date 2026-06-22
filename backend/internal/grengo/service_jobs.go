package grengo

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"time"

	pb "github.com/skaia/grpc/grengo"
)

// JobStatus represents the state of an asynchronous grengo job.
type JobStatus struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Target    string    `json:"target,omitempty"`
	Status    string    `json:"status"` // "running", "completed", "failed"
	Message   string    `json:"message,omitempty"`
	Error     string    `json:"error,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

func (s *Service) ListJobs() ([]*JobStatus, error) {
	resp, err := s.client.ListJobs(context.Background(), &pb.EmptyRequest{})
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	var jobs []*JobStatus
	if err := json.Unmarshal([]byte(resp.JobsJson), &jobs); err != nil {
		return nil, fmt.Errorf("decode list jobs: %w", err)
	}
	if jobs == nil {
		jobs = []*JobStatus{}
	}
	return jobs, nil
}

func (s *Service) GetJob(id string) (*JobStatus, error) {
	resp, err := s.client.GetJob(context.Background(), &pb.GetJobRequest{Id: id})
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	var j JobStatus
	if err := json.Unmarshal([]byte(resp.JobJson), &j); err != nil {
		return nil, fmt.Errorf("decode job: %w", err)
	}
	return &j, nil
}

func (s *Service) DownloadJob(id string) (string, error) {
	stream, err := s.client.DownloadJob(context.Background(), &pb.DownloadJobRequest{Id: id})
	if err != nil {
		return "", fmt.Errorf("grengo API: %w", err)
	}

	tmpFile, err := os.CreateTemp("", "grengo-job-*.tar.gz")
	if err != nil {
		return "", fmt.Errorf("create temp file: %w", err)
	}
	
	for {
		chunk, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			tmpFile.Close()
			os.Remove(tmpFile.Name())
			return "", err
		}
		if _, err := tmpFile.Write(chunk.Chunk); err != nil {
			tmpFile.Close()
			os.Remove(tmpFile.Name())
			return "", err
		}
	}
	tmpFile.Close()
	return tmpFile.Name(), nil
}
