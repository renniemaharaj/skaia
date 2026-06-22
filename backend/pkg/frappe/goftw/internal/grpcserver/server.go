package grpcserver

import (
	"fmt"
	"log"
	"net"

	"goftw/internal/bench"
	pb "github.com/skaia/grpc/skaia"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

type GoFTWServer struct {
	pb.UnimplementedGoFTWServiceServer
	Bench *bench.Bench
}

type grpcStreamWriter struct {
	stream pb.GoFTWService_SetupInitServer // specific to this method, but we can type cast
}

func (w *grpcStreamWriter) Write(p []byte) (n int, err error) {
	err = w.stream.Send(&pb.LogStreamResponse{
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
	// Dummy stream implementation, needs to replicate CheckoutSitesHandler
	stream.Send(&pb.LogStreamResponse{Output: "[API] Checking out sites...\n"})
	return nil
}

func (s *GoFTWServer) StartDeployment(req *pb.StartDeploymentRequest, stream pb.GoFTWService_StartDeploymentServer) error {
	stream.Send(&pb.LogStreamResponse{Output: "[API] Starting deployment...\n"})
	return nil
}

func (s *GoFTWServer) InstallApps(req *pb.InstallAppsRequest, stream pb.GoFTWService_InstallAppsServer) error {
	stream.Send(&pb.LogStreamResponse{Output: fmt.Sprintf("[API] Installing apps on site: %s\n", req.SiteName)})
	return nil
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
