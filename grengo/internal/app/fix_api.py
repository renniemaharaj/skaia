with open("api.go", "r") as f:
    api = f.read()

import re

# Remove the http server start logic
api = re.sub(r'if apiHandlerFactory == nil \{.*?log\("Grengo API stopped"\)', 
"""grpcServer := grpc.NewServer(
		grpc.UnaryInterceptor(passcodeInterceptor),
		grpc.StreamInterceptor(passcodeStreamInterceptor),
	)
	pb.RegisterGrengoServiceServer(grpcServer, &GrengoServer{})

	done := make(chan os.Signal, 1)
	signal.Notify(done, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-done
		log("Shutting down grengo gRPC API…")
		grpcServer.GracefulStop()
	}()

	log("Grengo internal gRPC API listening on %s (PID %d)", addr, os.Getpid())
	info("Accessible from this host and local Docker containers")
	info("Stop with: grengo api stop  (or Ctrl-C)")

	if err := grpcServer.Serve(listener); err != nil {
		die("Server error: %v", err)
	}
	log("Grengo API stopped")""", api, flags=re.DOTALL)

if "pb \"github.com/skaia/grpc/grengo\"" not in api:
    api = api.replace('import (', 'import (\n\tpb "github.com/skaia/grpc/grengo"\n\t"google.golang.org/grpc"\n\t"google.golang.org/grpc/metadata"\n\t"google.golang.org/grpc/codes"\n\t"google.golang.org/grpc/status"\n')

with open("api.go", "w") as f:
    f.write(api)
