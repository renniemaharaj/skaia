package app

import (
	"context"
	"fmt"
	"io"
	"time"

	pb "github.com/skaia/grpc/skaia"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func grpcFrappeProvision(siteName string) {
	fmt.Println("Waiting for Frappe GoFTW gRPC API to be ready on port 3001...")
	grpcURL := "127.0.0.1:3001"
	
	var conn *grpc.ClientConn
	var client pb.GoFTWServiceClient
	var err error

	for i := 0; i < 60; i++ {
		conn, err = grpc.NewClient(grpcURL, grpc.WithTransportCredentials(insecure.NewCredentials()))
		if err == nil {
			client = pb.NewGoFTWServiceClient(conn)
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			_, rpcErr := client.ListSites(ctx, &pb.ListSitesRequest{})
			cancel()
			if rpcErr == nil {
				break
			}
			err = rpcErr
		}
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		die("Timed out connecting to Frappe GoFTW gRPC API: %v", err)
	}
	defer conn.Close()
	
	fmt.Println("Orchestrating Frappe global cluster setup via gRPC API (streams logs)...")

	ctx := context.Background()

	// 1. Setup Init
	initStream, err := client.SetupInit(ctx, &pb.SetupInitRequest{Branch: "develop"})
	if err != nil {
		die("SetupInit failed: %v", err)
	}
	for {
		res, err := initStream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			die("SetupInit stream error: %v", err)
		}
		fmt.Print(res.Output)
	}

	// 2. Checkout Sites
	checkoutStream, err := client.CheckoutSites(ctx, &pb.CheckoutSitesRequest{})
	if err != nil {
		die("CheckoutSites failed: %v", err)
	}
	for {
		res, err := checkoutStream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			die("CheckoutSites stream error: %v", err)
		}
		fmt.Print(res.Output)
	}

	// 3. Deployment Start
	deployStream, err := client.StartDeployment(ctx, &pb.StartDeploymentRequest{Deployment: "production"})
	if err != nil {
		die("StartDeployment failed: %v", err)
	}
	for {
		res, err := deployStream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			die("StartDeployment stream error: %v", err)
		}
		fmt.Print(res.Output)
	}

	fmt.Printf("Orchestrating new Frappe site via API: %s\n", siteName)

	newSiteStream, err := client.NewSite(ctx, &pb.NewSiteRequest{SiteName: siteName})
	if err != nil {
		die("NewSite failed: %v", err)
	}
	for {
		res, err := newSiteStream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			die("NewSite stream error: %v", err)
		}
		fmt.Print(res.Output)
	}

	appsStream, err := client.InstallApps(ctx, &pb.InstallAppsRequest{SiteName: siteName, Apps: []string{"frappe"}})
	if err != nil {
		die("InstallApps failed: %v", err)
	}
	for {
		res, err := appsStream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			die("InstallApps stream error: %v", err)
		}
		fmt.Print(res.Output)
	}

	fmt.Println("Reloading Nginx to route to the new site...")
	_, err = client.ReloadNginx(ctx, &pb.ReloadNginxRequest{})
	if err != nil {
		die("ReloadNginx failed: %v", err)
	}

	fmt.Println("Frappe Framework multi-tenant site successfully provisioned via gRPC API and is now RUNNING.")
	StartFrappeHealthRoutine()
}
