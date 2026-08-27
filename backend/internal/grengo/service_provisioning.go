package grengo

import (
	"context"
	"fmt"
	"io"
	"strings"

	pb "github.com/skaia/grpc/grengo"
)

// FrappeProvisionResult is the bounded provisioning result consumed by the
// backend deployment service. Browser-facing Grengo administration is not
// exposed by this package.
type FrappeProvisionResult struct {
	Version  string
	Cluster  string
	HTTPPort int
	GRPCPort int
}

// ProvisionFrappeVersion provisions one deployment through the internal Grengo
// gRPC connection. The caller owns authorization, job bounds, and log delivery.
func (s *Service) ProvisionFrappeVersion(siteName, version string, onLog func(string)) (*FrappeProvisionResult, error) {
	if version == "" {
		version = "16"
	}

	output, err := s.provisionFrappeStream(siteName, version, onLog)
	if err != nil {
		return nil, err
	}

	result := &FrappeProvisionResult{Version: version}
	for _, line := range strings.Split(output, "\n") {
		key, value, ok := strings.Cut(strings.TrimSpace(line), "=")
		if !ok {
			continue
		}
		switch key {
		case "FRAPPE_CLUSTER_VERSION":
			result.Version = value
		case "FRAPPE_CLUSTER_ID":
			result.Cluster = value
		case "FRAPPE_HTTP_PORT":
			_, _ = fmt.Sscanf(value, "%d", &result.HTTPPort)
		case "FRAPPE_GRPC_PORT":
			_, _ = fmt.Sscanf(value, "%d", &result.GRPCPort)
		}
	}

	if result.Cluster == "" {
		result.Cluster = "1"
	}
	if result.GRPCPort == 0 {
		result.GRPCPort = 3001
	}
	if result.HTTPPort == 0 {
		result.HTTPPort = 8000
	}
	return result, nil
}

func (s *Service) provisionFrappeStream(siteName, version string, onLog func(string)) (string, error) {
	stream, err := s.client.ProvisionFrappe(context.Background(), &pb.ProvisionFrappeRequest{
		SiteName: siteName,
		Version:  version,
	})
	if err != nil {
		return "", fmt.Errorf("grengo API: %w", err)
	}

	var output strings.Builder
	var pending string
	emit := func(line string) error {
		line = strings.TrimRight(line, "\r")
		output.WriteString(line)
		output.WriteByte('\n')
		if strings.HasPrefix(line, "ERROR: exit code") {
			return fmt.Errorf("grengo frappe-provision failed: %s", line)
		}
		if strings.HasPrefix(line, "ERROR: ") {
			return fmt.Errorf("grengo API: %s", line)
		}
		if onLog != nil {
			onLog(line)
		}
		return nil
	}

	for {
		response, recvErr := stream.Recv()
		if recvErr == io.EOF {
			break
		}
		if recvErr != nil {
			return output.String(), fmt.Errorf("reading stream: %w", recvErr)
		}

		pending += strings.ReplaceAll(response.Output, "\r", "\n")
		parts := strings.Split(pending, "\n")
		pending = parts[len(parts)-1]
		for _, line := range parts[:len(parts)-1] {
			if err := emit(line); err != nil {
				return output.String(), err
			}
		}
	}
	if strings.TrimSpace(pending) != "" {
		if err := emit(pending); err != nil {
			return output.String(), err
		}
	}
	return output.String(), nil
}
