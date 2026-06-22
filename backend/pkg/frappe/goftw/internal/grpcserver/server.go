package grpcserver

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"

	"goftw/internal/bench"
	"goftw/internal/entity"
	"goftw/internal/environ"
	pb "github.com/skaia/grpc/skaia"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

type GoFTWServer struct {
	pb.UnimplementedGoFTWServiceServer
	Bench *bench.Bench
}

type grpcLogStreamWriter struct {
	send func(*pb.LogStreamResponse) error
}

func (w *grpcLogStreamWriter) Write(p []byte) (n int, err error) {
	err = w.send(&pb.LogStreamResponse{
		Output: string(p),
	})
	return len(p), err
}

func (s *GoFTWServer) SetupInit(req *pb.SetupInitRequest, stream pb.GoFTWService_SetupInitServer) error {
	branch := req.Branch
	if branch == "" {
		branch = s.Bench.Branch
	}
	stream.Send(&pb.LogStreamResponse{Output: fmt.Sprintf("[API] Initializing bench with branch: %s\n", branch)})
	if err := s.Bench.Initialize(branch); err != nil {
		stream.Send(&pb.LogStreamResponse{Output: fmt.Sprintf("[ERROR] Bench init failed: %v\n", err)})
		return err
	}
	stream.Send(&pb.LogStreamResponse{Output: "[API] Bench initialized successfully\n"})
	return nil
}

func (s *GoFTWServer) CheckoutSites(req *pb.CheckoutSitesRequest, stream pb.GoFTWService_CheckoutSitesServer) error {
	stream.Send(&pb.LogStreamResponse{Output: "[API] Checking out sites...\n"})
	instanceCfx, err := entity.LoadInstance(environ.GetInstanceFile())
	if err != nil {
		return err
	}
	dbUser := os.Getenv("MARIADB_ROOT_USERNAME")
	dbPass := os.Getenv("MARIADB_ROOT_PASSWORD")
	if dbUser == "" { dbUser = "root" }
	if dbPass == "" { dbPass = "root" }
	
	if err := s.Bench.CheckoutSites(instanceCfx, dbUser, dbPass); err != nil {
		stream.Send(&pb.LogStreamResponse{Output: fmt.Sprintf("[ERROR] Checkout sites failed: %v\n", err)})
		return err
	}
	stream.Send(&pb.LogStreamResponse{Output: "[API] CheckoutSites completed successfully\n"})
	return nil
}

func (s *GoFTWServer) StartDeployment(req *pb.StartDeploymentRequest, stream pb.GoFTWService_StartDeploymentServer) error {
	stream.Send(&pb.LogStreamResponse{Output: fmt.Sprintf("[API] Starting deployment mode: %s\n", req.Deployment)})
	switch req.Deployment {
	case "production":
		if err := s.Bench.RunSupervisorNginx(); err != nil {
			stream.Send(&pb.LogStreamResponse{Output: fmt.Sprintf("[ERROR] Production mode failed: %v\n", err)})
			return err
		}
	default:
		if err := s.Bench.StartBench(); err != nil {
			stream.Send(&pb.LogStreamResponse{Output: fmt.Sprintf("[ERROR] Development mode failed: %v\n", err)})
			return err
		}
	}
	stream.Send(&pb.LogStreamResponse{Output: "[API] Deployment started successfully\n"})
	return nil
}

func (s *GoFTWServer) InstallApp(req *pb.InstallAppRequest, stream pb.GoFTWService_InstallAppServer) error {
	writer := &grpcLogStreamWriter{send: stream.Send}
	if err := s.Bench.InstallAppStream(writer, req.SiteName, req.AppName); err != nil {
		stream.Send(&pb.LogStreamResponse{Output: fmt.Sprintf("[ERROR] %v\n", err)})
		return err
	}
	return nil
}

func (s *GoFTWServer) UninstallApp(req *pb.UninstallAppRequest, stream pb.GoFTWService_UninstallAppServer) error {
	// UninstallApp doesn't have a stream version in Bench currently, so we'll just run it and return
	if err := s.Bench.UninstallApp(req.SiteName, req.AppName); err != nil {
		stream.Send(&pb.LogStreamResponse{Output: fmt.Sprintf("[ERROR] %v\n", err)})
		return err
	}
	stream.Send(&pb.LogStreamResponse{Output: "App uninstalled successfully\n"})
	return nil
}

func (s *GoFTWServer) ListSites(ctx context.Context, req *pb.ListSitesRequest) (*pb.ListSitesResponse, error) {
	sites, err := s.Bench.ListSites()
	if err != nil {
		return nil, err
	}
	return &pb.ListSitesResponse{Sites: sites}, nil
}

func (s *GoFTWServer) CheckSite(ctx context.Context, req *pb.CheckSiteRequest) (*pb.CheckSiteResponse, error) {
	// In API, it just returns HTTP 200 if bench.GetSitesHandler succeeds. For now, checking if site exists.
	sites, err := s.Bench.ListSites()
	if err != nil {
		return nil, err
	}
	for _, site := range sites {
		if site == req.SiteName {
			return &pb.CheckSiteResponse{StatusJson: `{"status":"ok"}`}, nil
		}
	}
	return nil, fmt.Errorf("site not found")
}

func (s *GoFTWServer) ReloadNginx(ctx context.Context, req *pb.ReloadNginxRequest) (*pb.ReloadNginxResponse, error) {
	if err := s.Bench.ReloadNginx(); err != nil {
		return nil, err
	}
	return &pb.ReloadNginxResponse{Success: true}, nil
}

func (s *GoFTWServer) GetApps(ctx context.Context, req *pb.GetAppsRequest) (*pb.GetAppsResponse, error) {
	apps, err := s.Bench.ListApps()
	if err != nil {
		return nil, err
	}
	return &pb.GetAppsResponse{Apps: apps}, nil
}

func (s *GoFTWServer) GetSiteApps(ctx context.Context, req *pb.GetSiteAppsRequest) (*pb.GetSiteAppsResponse, error) {
	apps, err := s.Bench.ListAppsOnSite(req.SiteName)
	if err != nil {
		return nil, err
	}
	// Extract app names
	var appNames []string
	for _, a := range apps {
		appNames = append(appNames, a.Name) // Assuming entity.App has 'Name' string field
	}
	return &pb.GetSiteAppsResponse{Apps: appNames}, nil
}

func StartServer(port string, b *bench.Bench) {
	lis, err := net.Listen("tcp", port)
	if err != nil {
		log.Fatalf("failed to listen on gRPC port %s: %v", port, err)
	}

	grpcServer := grpc.NewServer()
	pb.RegisterGoFTWServiceServer(grpcServer, &GoFTWServer{Bench: b})
	
	reflection.Register(grpcServer)

	log.Printf("Starting gRPC GoFTWService server on %s", port)
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("failed to serve gRPC: %v", err)
	}
}

func (s *GoFTWServer) InstallApps(req *pb.InstallAppsRequest, stream pb.GoFTWService_InstallAppsServer) error {
	writer := &grpcLogStreamWriter{send: stream.Send}
	for _, app := range req.Apps {
		stream.Send(&pb.LogStreamResponse{Output: fmt.Sprintf("[API] Installing app %s on site: %s\n", app, req.SiteName)})
		if err := s.Bench.InstallAppStream(writer, req.SiteName, app); err != nil {
			stream.Send(&pb.LogStreamResponse{Output: fmt.Sprintf("[ERROR] %v\n", err)})
			return err
		}
	}
	return nil
}

func (s *GoFTWServer) NewSite(req *pb.NewSiteRequest, stream pb.GoFTWService_NewSiteServer) error {
	writer := &grpcLogStreamWriter{send: stream.Send}
	dbRootUser := os.Getenv("MARIADB_ROOT_USERNAME")
	dbRootPass := os.Getenv("MARIADB_ROOT_PASSWORD")
	if dbRootUser == "" {
		dbRootUser = "root"
	}
	if dbRootPass == "" {
		dbRootPass = "root"
	}
	stream.Send(&pb.LogStreamResponse{Output: fmt.Sprintf("[API] Creating new site: %s\n", req.SiteName)})
	if err := s.Bench.NewSiteStream(writer, req.SiteName, dbRootUser, dbRootPass); err != nil {
		stream.Send(&pb.LogStreamResponse{Output: fmt.Sprintf("[ERROR] NewSite failed: %v\n", err)})
		return err
	}
	stream.Send(&pb.LogStreamResponse{Output: fmt.Sprintf("[API] Successfully created site: %s\n", req.SiteName)})
	return nil
}
