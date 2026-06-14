package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"time"
)

var dockerAPIClient = &http.Client{
	Transport: &http.Transport{
		DialContext: func(_ context.Context, _, _ string) (net.Conn, error) {
			return net.Dial("unix", "/var/run/docker.sock")
		},
	},
	Timeout: 10 * time.Second,
}

func main() {
	url := "http://localhost/containers/skaia-postgres/stats?stream=false&one-shot=true"
	resp, err := dockerAPIClient.Get(url)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	defer resp.Body.Close()

	var raw map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&raw)
	
	b, _ := json.MarshalIndent(raw["cpu_stats"], "", "  ")
	fmt.Println("CPU STATS:", string(b))
	
	b2, _ := json.MarshalIndent(raw["precpu_stats"], "", "  ")
	fmt.Println("PRECPU STATS:", string(b2))
}
