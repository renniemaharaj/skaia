package main
import (
	"context"
	"fmt"
	"time"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	pb "github.com/skaia/grpc/skaia"
)
func main() {
	conn, err := grpc.NewClient("127.0.0.1:3001", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil { panic(err) }
	defer conn.Close()
	c := pb.NewGoFTWServiceClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := c.ListSites(ctx, &pb.ListSitesRequest{})
	fmt.Println(resp, err)
}
