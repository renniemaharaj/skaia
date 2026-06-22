package app

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	"github.com/skaia/grengo/internal/hardware"
	"github.com/skaia/grengo/internal/repo"
	"github.com/skaia/grengo/internal/services"
	pb "github.com/skaia/grpc/grengo"
)

type GrengoServer struct {
	pb.UnimplementedGrengoServiceServer
}

func (s *GrengoServer) PasscodeStatus(ctx context.Context, req *pb.EmptyRequest) (*pb.PasscodeStatusResponse, error) {
	return &pb.PasscodeStatusResponse{Configured: passcodeConfigured()}, nil
}

func (s *GrengoServer) VerifyPasscode(ctx context.Context, req *pb.VerifyPasscodeRequest) (*pb.VerifyPasscodeResponse, error) {
	return &pb.VerifyPasscodeResponse{Valid: verifyPasscode(req.P1, req.P2)}, nil
}

func (s *GrengoServer) ListSites(ctx context.Context, req *pb.ListSitesRequest) (*pb.ListSitesResponse, error) {
	// Replicate the logic of apiListSites without http response
	store := repo.New(ProjectRoot())
	entries, err := store.BackendEntries()
	if err != nil {
		if os.IsNotExist(err) {
			return &pb.ListSitesResponse{SitesJson: "[]"}, nil
		}
		return nil, err
	}

	sites := []apiSiteInfo{}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		ef := store.SiteEnvFile(e.Name())
		if _, serr := os.Stat(ef); serr != nil {
			continue
		}

		name := envVal(ef, "CLIENT_NAME")
		port := envVal(ef, "PORT")
		domainsStr := envVal(ef, "DOMAINS")
		dbName := envVal(ef, "POSTGRES_DB")
		features := envVal(ef, "FEATURES_ENABLED")

		status := "enabled"
		if store.IsSiteDisabled(e.Name()) {
			status = "disabled"
		}

		running := clientRunning(name)
		armed := store.IsSiteArmed(e.Name())

		var domains []string
		if domainsStr != "" {
			domains = strings.Fields(domainsStr)
		}

		sites = append(sites, apiSiteInfo{
			Name:     name,
			Port:     port,
			Status:   status,
			Running:  running,
			Armed:    armed,
			Domains:  domains,
			DBName:   dbName,
			Features: features,
		})
	}
	b, _ := json.Marshal(sites)
	return &pb.ListSitesResponse{SitesJson: string(b)}, nil
}

func (s *GrengoServer) Exec(ctx context.Context, req *pb.ExecRequest) (*pb.ExecResponse, error) {
	blocked := map[string]bool{
		"api":      true,
		"wipe":     true,
		"remove":   true,
		"rm":       true,
		"passcode": true,
	}
	if blocked[req.Command] {
		return &pb.ExecResponse{Ok: false, Error: "command not allowed"}, nil
	}
	args := append([]string{req.Command}, req.Args...)
	result, err := services.NewCommandRunner(ProjectRoot()).RunSelf(args...)
	if err != nil {
		return nil, err
	}
	return &pb.ExecResponse{
		Ok:       result.ExitCode == 0,
		Output:   result.Output,
		ExitCode: int32(result.ExitCode),
	}, nil
}

func (s *GrengoServer) CreateSite(ctx context.Context, req *pb.CreateSiteRequest) (*pb.CreateSiteResponse, error) {
	// Not fully used in backend, but scaffolded
	return &pb.CreateSiteResponse{}, nil
}

// Implement ProvisionFrappe which streams logs
type grpcLogWriter struct {
	stream pb.GrengoService_ProvisionFrappeServer
}

func (w *grpcLogWriter) Write(p []byte) (n int, err error) {
	w.stream.Send(&pb.LogStreamResponse{Output: string(p)})
	return len(p), nil
}

func (s *GrengoServer) ProvisionFrappe(req *pb.ProvisionFrappeRequest, stream pb.GrengoService_ProvisionFrappeServer) error {
	writer := &grpcLogWriter{stream: stream}
	result, err := services.NewCommandRunner(ProjectRoot()).RunSelfStream(writer, "frappe-provision", req.SiteName)
	if err != nil {
		stream.Send(&pb.LogStreamResponse{Output: fmt.Sprintf("ERROR: %v\n", err)})
	} else if result.ExitCode != 0 {
		stream.Send(&pb.LogStreamResponse{Output: fmt.Sprintf("ERROR: exit code %d\n", result.ExitCode)})
	}
	return nil
}

func (s *GrengoServer) DeleteSite(ctx context.Context, req *pb.SiteRequest) (*pb.EmptyResponse, error) {
	_, err := services.NewCommandRunner(ProjectRoot()).RunSelf("remove", req.Name)
	return &pb.EmptyResponse{}, err
}

func (s *GrengoServer) StartSite(ctx context.Context, req *pb.SiteRequest) (*pb.EmptyResponse, error) {
	_, err := services.NewCommandRunner(ProjectRoot()).RunSelf("start", req.Name)
	return &pb.EmptyResponse{}, err
}

func (s *GrengoServer) StopSite(ctx context.Context, req *pb.SiteRequest) (*pb.EmptyResponse, error) {
	_, err := services.NewCommandRunner(ProjectRoot()).RunSelf("stop", req.Name)
	return &pb.EmptyResponse{}, err
}

func (s *GrengoServer) EnableSite(ctx context.Context, req *pb.SiteRequest) (*pb.EmptyResponse, error) {
	_, err := services.NewCommandRunner(ProjectRoot()).RunSelf("enable", req.Name)
	return &pb.EmptyResponse{}, err
}

func (s *GrengoServer) DisableSite(ctx context.Context, req *pb.SiteRequest) (*pb.EmptyResponse, error) {
	_, err := services.NewCommandRunner(ProjectRoot()).RunSelf("disable", req.Name)
	return &pb.EmptyResponse{}, err
}

func (s *GrengoServer) ArmSite(ctx context.Context, req *pb.SiteRequest) (*pb.EmptyResponse, error) {
	_, err := services.NewCommandRunner(ProjectRoot()).RunSelf("arm", req.Name)
	return &pb.EmptyResponse{}, err
}

func (s *GrengoServer) DisarmSite(ctx context.Context, req *pb.SiteRequest) (*pb.EmptyResponse, error) {
	_, err := services.NewCommandRunner(ProjectRoot()).RunSelf("disarm", req.Name)
	return &pb.EmptyResponse{}, err
}

func (s *GrengoServer) GetSiteEnv(ctx context.Context, req *pb.SiteRequest) (*pb.GetSiteEnvResponse, error) {
	data, err := repo.New(ProjectRoot()).ReadSiteEnv(req.Name)
	content := string(data)
	return &pb.GetSiteEnvResponse{Content: content}, err
}

func (s *GrengoServer) UpdateSiteEnv(ctx context.Context, req *pb.UpdateSiteEnvRequest) (*pb.EmptyResponse, error) {
	err := repo.New(ProjectRoot()).WriteSiteEnv(req.Name, req.Content)
	return &pb.EmptyResponse{}, err
}

func (s *GrengoServer) Stats(ctx context.Context, req *pb.EmptyRequest) (*pb.StatsResponse, error) {
	stats := gatherStats()
	b, _ := json.Marshal(stats)
	return &pb.StatsResponse{StatsJson: string(b)}, nil
}

func (s *GrengoServer) Storage(ctx context.Context, req *pb.EmptyRequest) (*pb.StorageResponse, error) {
	info := gatherStorage()
	b, _ := json.Marshal(info)
	return &pb.StorageResponse{StorageJson: string(b)}, nil
}

func (s *GrengoServer) GetSysInfo(ctx context.Context, req *pb.EmptyRequest) (*pb.SysInfoResponse, error) {
	info := hardware.GetPayload().Static
	b, _ := json.Marshal(info)
	return &pb.SysInfoResponse{SysinfoJson: string(b)}, nil
}

func (s *GrengoServer) ExportSite(ctx context.Context, req *pb.SiteRequest) (*pb.ExportSiteResponse, error) {
	jobID := startSiteCommand(req.Name, "export", nil)
	return &pb.ExportSiteResponse{Filename: jobID}, nil
}

func (s *GrengoServer) ImportSite(ctx context.Context, req *pb.ImportSiteRequest) (*pb.ImportSiteResponse, error) {
	args := []string{req.ArchivePath, "--name", req.NewName, "--port", req.NewPort}
	jobID := startGlobalCommand("import", args)
	return &pb.ImportSiteResponse{Filename: jobID}, nil
}

func (s *GrengoServer) MigrateSite(ctx context.Context, req *pb.MigrateSiteRequest) (*pb.MigrateSiteResponse, error) {
	args := []string{"migrate", req.Name}
	if req.Rebuild {
		args = append(args, "--rebuild")
	}
	result, err := services.NewCommandRunner(ProjectRoot()).RunSelf(args...)
	if err != nil {
		return nil, err
	}
	b, _ := json.Marshal(map[string]any{
		"ok": result.ExitCode == 0, "output": result.Output, "exit_code": result.ExitCode,
	})
	return &pb.MigrateSiteResponse{ResultJson: string(b)}, nil
}

func (s *GrengoServer) MigrateAll(ctx context.Context, req *pb.MigrateAllRequest) (*pb.MigrateAllResponse, error) {
	args := []string{"migrate", "all"}
	if req.Rebuild {
		args = append(args, "--rebuild")
	}
	result, err := services.NewCommandRunner(ProjectRoot()).RunSelf(args...)
	if err != nil {
		return nil, err
	}
	b, _ := json.Marshal(map[string]any{
		"ok": result.ExitCode == 0, "output": result.Output, "exit_code": result.ExitCode,
	})
	return &pb.MigrateAllResponse{ResultJson: string(b)}, nil
}

func (s *GrengoServer) ExportNode(ctx context.Context, req *pb.EmptyRequest) (*pb.ExportNodeResponse, error) {
	jobID := startGlobalCommand("export-node", nil)
	return &pb.ExportNodeResponse{Filename: jobID}, nil
}

func (s *GrengoServer) ImportNode(ctx context.Context, req *pb.ImportNodeRequest) (*pb.ImportNodeResponse, error) {
	jobID := startGlobalCommand("import-node", []string{req.ArchivePath})
	return &pb.ImportNodeResponse{Filename: jobID}, nil
}

func (s *GrengoServer) ListExports(ctx context.Context, req *pb.EmptyRequest) (*pb.ListExportsResponse, error) {
	exportsDir := filepath.Join(ProjectRoot(), "exports")
	os.MkdirAll(exportsDir, 0755)

	entries, err := os.ReadDir(exportsDir)
	if err != nil {
		return nil, fmt.Errorf("cannot read exports directory")
	}

	type ExportFile struct {
		Name      string    `json:"name"`
		Size      int64     `json:"size"`
		CreatedAt time.Time `json:"created_at"`
	}
	var files []ExportFile
	for _, e := range entries {
		if !e.IsDir() {
			if info, err := e.Info(); err == nil {
				files = append(files, ExportFile{
					Name:      e.Name(),
					Size:      info.Size(),
					CreatedAt: info.ModTime(),
				})
			}
		}
	}
	if files == nil {
		files = []ExportFile{}
	}
	b, _ := json.Marshal(files)
	return &pb.ListExportsResponse{ExportsJson: string(b)}, nil
}

func (s *GrengoServer) ListJobs(ctx context.Context, req *pb.EmptyRequest) (*pb.ListJobsResponse, error) {
	jobsMu.Lock()
	var list []*jobStatus
	for _, j := range jobs {
		list = append(list, j)
	}
	jobsMu.Unlock()
	b, _ := json.Marshal(list)
	return &pb.ListJobsResponse{JobsJson: string(b)}, nil
}

func (s *GrengoServer) GetJob(ctx context.Context, req *pb.GetJobRequest) (*pb.GetJobResponse, error) {
	jobsMu.Lock()
	j := jobs[req.Id]
	jobsMu.Unlock()
	if j == nil {
		return nil, fmt.Errorf("job not found")
	}
	b, _ := json.Marshal(j)
	return &pb.GetJobResponse{JobJson: string(b)}, nil
}

func (s *GrengoServer) WatchJobs(req *pb.EmptyRequest, stream pb.GrengoService_WatchJobsServer) error {
	// For gRPC we just stream existing jobs then wait.
	// We'll emulate the stream by sending job statuses.
	ch := make(chan *jobStatus, 10)

	jobsMu.Lock()
	for _, j := range jobs {
		ch <- j
	}
	jobsMu.Unlock()

	// Simply consume the channel and stream. In a real system, broadcastJobStatus would push to this channel.
	for {
		select {
		case j := <-ch:
			b, _ := json.Marshal(j)
			if err := stream.Send(&pb.JobEvent{EventJson: string(b)}); err != nil {
				return err
			}
		case <-stream.Context().Done():
			return nil
		}
	}
}

func (s *GrengoServer) SendAction(ctx context.Context, req *pb.SendActionRequest) (*pb.EmptyResponse, error) {
	// Action handling (e.g., job cancellation) would go here
	return &pb.EmptyResponse{}, nil
}

func (s *GrengoServer) DeleteExport(ctx context.Context, req *pb.DeleteExportRequest) (*pb.EmptyResponse, error) {
	filename := req.Filename
	if filename == "" || filepath.Base(filename) != filename {
		return nil, fmt.Errorf("invalid filename")
	}

	filePath := filepath.Join(ProjectRoot(), "exports", filename)
	err := os.Remove(filePath)
	return &pb.EmptyResponse{}, err
}

func (s *GrengoServer) DownloadExport(req *pb.DownloadExportRequest, stream pb.GrengoService_DownloadExportServer) error {
	filename := req.Filename
	if filename == "" || filepath.Base(filename) != filename {
		return fmt.Errorf("invalid filename")
	}
	filePath := filepath.Join(ProjectRoot(), "exports", filename)
	f, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("file not found")
	}
	defer f.Close()

	buf := make([]byte, 64*1024)
	for {
		n, err := f.Read(buf)
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if err := stream.Send(&pb.FileChunk{Chunk: buf[:n]}); err != nil {
			return err
		}
	}
	return nil
}

func (s *GrengoServer) DownloadJob(req *pb.DownloadJobRequest, stream pb.GrengoService_DownloadJobServer) error {
	jobsMu.Lock()
	j := jobs[req.Id]
	jobsMu.Unlock()
	if j == nil {
		return fmt.Errorf("job not found")
	}
	if j.filePath == "" {
		return fmt.Errorf("job has no archive")
	}

	f, err := os.Open(j.filePath)
	if err != nil {
		return fmt.Errorf("could not open job archive: %w", err)
	}
	defer f.Close()

	buf := make([]byte, 64*1024)
	for {
		n, err := f.Read(buf)
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if err := stream.Send(&pb.FileChunk{Chunk: buf[:n]}); err != nil {
			return err
		}
	}
	return nil
}

func passcodeInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
	if passcodeExemptMethod(info.FullMethod) {
		return handler(ctx, req)
	}
	if !passcodeConfigured() {
		return handler(ctx, req)
	}
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return nil, status.Errorf(codes.Unauthenticated, "missing metadata")
	}
	vals := md.Get("x-grengo-passcode")
	if len(vals) == 0 {
		return nil, status.Errorf(codes.Unauthenticated, "missing passcode")
	}
	parts := strings.SplitN(vals[0], ":", 2)
	if len(parts) != 2 || !verifyPasscode(parts[0], parts[1]) {
		return nil, status.Errorf(codes.Unauthenticated, "invalid passcode")
	}
	return handler(ctx, req)
}

func passcodeStreamInterceptor(srv interface{}, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
	if passcodeExemptMethod(info.FullMethod) {
		return handler(srv, ss)
	}
	if !passcodeConfigured() {
		return handler(srv, ss)
	}
	md, ok := metadata.FromIncomingContext(ss.Context())
	if !ok {
		return status.Errorf(codes.Unauthenticated, "missing metadata")
	}
	vals := md.Get("x-grengo-passcode")
	if len(vals) == 0 {
		return status.Errorf(codes.Unauthenticated, "missing passcode")
	}
	parts := strings.SplitN(vals[0], ":", 2)
	if len(parts) != 2 || !verifyPasscode(parts[0], parts[1]) {
		return status.Errorf(codes.Unauthenticated, "invalid passcode")
	}
	return handler(srv, ss)
}

func passcodeExemptMethod(method string) bool {
	switch method {
	case pb.GrengoService_PasscodeStatus_FullMethodName,
		pb.GrengoService_VerifyPasscode_FullMethodName:
		return true
	default:
		return false
	}
}
