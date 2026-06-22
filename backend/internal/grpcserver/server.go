package grpcserver

import (
	"context"
	"encoding/json"
	"log"
	"net"

	"github.com/skaia/backend/internal/upload"
	pb "github.com/skaia/grpc/skaia"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

type BackendServer struct {
	pb.UnimplementedBackendServiceServer
}

func (s *BackendServer) GetStorage(ctx context.Context, req *pb.GetStorageRequest) (*pb.GetStorageResponse, error) {
	used, _ := upload.DirSize(upload.UploadsDir)
	info := struct {
		Limit int64 `json:"limit"`
		Used  int64 `json:"used"`
	}{
		Limit: upload.MaxUploadTotal,
		Used:  used,
	}
	
	data, err := json.Marshal(info)
	if err != nil {
		return nil, err
	}

	return &pb.GetStorageResponse{
		StorageJson: string(data),
	}, nil
}

func StartServer(port string) {
	lis, err := net.Listen("tcp", port)
	if err != nil {
		log.Fatalf("failed to listen on gRPC port %s: %v", port, err)
	}

	grpcServer := grpc.NewServer()
	pb.RegisterBackendServiceServer(grpcServer, &BackendServer{})
	
	// Register reflection service on gRPC server for debugging
	reflection.Register(grpcServer)

	log.Printf("Starting gRPC BackendService server on %s", port)
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("failed to serve gRPC: %v", err)
	}
}
