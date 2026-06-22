package grpcserver

import (
	"context"
	"log"
	"net"

	pb "github.com/skaia/grpc/skaia"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

type GrengoServer struct {
	pb.UnimplementedGrengoServiceServer
}

func (s *GrengoServer) ReportStatus(ctx context.Context, req *pb.ReportStatusRequest) (*pb.ReportStatusResponse, error) {
	log.Printf("[gRPC] Node %s reported status: %s", req.NodeId, req.Status)
	return &pb.ReportStatusResponse{Success: true}, nil
}

func StartServer(port string) {
	lis, err := net.Listen("tcp", port)
	if err != nil {
		log.Fatalf("failed to listen on gRPC port %s: %v", port, err)
	}

	grpcServer := grpc.NewServer()
	pb.RegisterGrengoServiceServer(grpcServer, &GrengoServer{})
	
	reflection.Register(grpcServer)

	log.Printf("Starting gRPC GrengoService server on %s", port)
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("failed to serve gRPC: %v", err)
	}
}
