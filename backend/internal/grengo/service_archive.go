package grengo

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	pb "github.com/skaia/grpc/grengo"
)

func (s *Service) ExportSite(name string) (string, error) {
	resp, err := s.client.ExportSite(context.Background(), &pb.SiteRequest{Name: name})
	if err != nil {
		return "", fmt.Errorf("grengo API: %w", err)
	}
	return resp.Filename, nil
}

func (s *Service) ImportSite(archivePath, newName, newPort string) (string, error) {
	resp, err := s.client.ImportSite(context.Background(), &pb.ImportSiteRequest{
		ArchivePath: archivePath,
		NewName:     newName,
		NewPort:     newPort,
	})
	if err != nil {
		return "", fmt.Errorf("grengo API: %w", err)
	}
	return resp.Filename, nil
}

func (s *Service) ExportNode() (string, error) {
	resp, err := s.client.ExportNode(context.Background(), &pb.EmptyRequest{})
	if err != nil {
		return "", fmt.Errorf("grengo API: %w", err)
	}
	return resp.Filename, nil
}

func (s *Service) ImportNode(archivePath string) (string, error) {
	resp, err := s.client.ImportNode(context.Background(), &pb.ImportNodeRequest{
		ArchivePath: archivePath,
	})
	if err != nil {
		return "", fmt.Errorf("grengo API: %w", err)
	}
	return resp.Filename, nil
}

// MigrateResult holds the output of a migration command.
type MigrateResult struct {
	OK       bool   `json:"ok"`
	Output   string `json:"output"`
	ExitCode int    `json:"exit_code"`
}

func (s *Service) MigrateSite(name string, rebuild bool) (*MigrateResult, error) {
	resp, err := s.client.MigrateSite(context.Background(), &pb.MigrateSiteRequest{
		Name:    name,
		Rebuild: rebuild,
	})
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	var res MigrateResult
	if err := json.Unmarshal([]byte(resp.ResultJson), &res); err != nil {
		return nil, fmt.Errorf("decode migrate: %w", err)
	}
	return &res, nil
}

// MigrateAll runs migrations for all sites.
func (s *Service) MigrateAll(rebuild bool) (*MigrateResult, error) {
	resp, err := s.client.MigrateAll(context.Background(), &pb.MigrateAllRequest{
		Rebuild: rebuild,
	})
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	var res MigrateResult
	if err := json.Unmarshal([]byte(resp.ResultJson), &res); err != nil {
		return nil, fmt.Errorf("decode migrate-all: %w", err)
	}
	return &res, nil
}

// ExportFile represents a completed export archive.
type ExportFile struct {
	Name      string    `json:"name"`
	Size      int64     `json:"size"`
	CreatedAt time.Time `json:"created_at"`
}

func (s *Service) ListExports() ([]ExportFile, error) {
	resp, err := s.client.ListExports(context.Background(), &pb.EmptyRequest{})
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	var files []ExportFile
	if err := json.Unmarshal([]byte(resp.ExportsJson), &files); err != nil {
		return nil, fmt.Errorf("decode exports: %w", err)
	}
	if files == nil {
		files = []ExportFile{}
	}
	return files, nil
}

func (s *Service) DeleteExport(filename string) (string, error) {
	_, err := s.client.DeleteExport(context.Background(), &pb.DeleteExportRequest{Filename: filename})
	if err != nil {
		return "", fmt.Errorf("grengo API: %w", err)
	}
	return "", nil
}

func (s *Service) DownloadExport(w http.ResponseWriter, filename string) error {
	stream, err := s.client.DownloadExport(context.Background(), &pb.DownloadExportRequest{Filename: filename})
	if err != nil {
		return fmt.Errorf("grengo API: %w", err)
	}
	
	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

	for {
		chunk, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if _, err := w.Write(chunk.Chunk); err != nil {
			return err
		}
	}
	return nil
}
