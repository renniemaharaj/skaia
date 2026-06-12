package main

import (
	"fmt"
	"net/http"
	"sync"
	"time"
)

func main() {
	baseURL := "http://localhost/api/"
	totalRequests := 2000
	concurrency := 4

	fmt.Printf("Starting stress test...\n")
	fmt.Printf("URL: %s\n", baseURL)
	fmt.Printf("Total Requests: %d\n", totalRequests)
	fmt.Printf("Concurrency: %d threads\n\n", concurrency)

	// Channel to feed jobs
	jobs := make(chan int, totalRequests)
	// Channel to collect results (HTTP status codes)
	results := make(chan int, totalRequests)

	var wg sync.WaitGroup

	// Start worker pool (exactly 4 threads)
	for w := 1; w <= concurrency; w++ {
		wg.Add(1)
		go worker(&wg, baseURL, jobs, results)
	}

	// Queue up all the jobs
	for j := 1; j <= totalRequests; j++ {
		jobs <- j
	}
	close(jobs)

	// Wait for all workers to finish processing the jobs
	wg.Wait()
	close(results)

	// Tally up the results
	tally := make(map[int]int)
	for code := range results {
		tally[code]++
	}

	// Print results exactly like `sort | uniq -c`
	fmt.Printf("--- Results ---\n")
	for code, count := range tally {
		if code == 0 {
			fmt.Printf("%5d %s (Connection Failed/Timeout)\n", count, "000")
		} else {
			fmt.Printf("%5d %d\n", count, code)
		}
	}
}

func worker(wg *sync.WaitGroup, baseURL string, jobs <-chan int, results chan<- int) {
	defer wg.Done()

	// Set a reasonable timeout so hanging requests don't block a thread forever
	client := &http.Client{Timeout: 10 * time.Second}

	for j := range jobs {
		// Cache buster
		reqURL := fmt.Sprintf("%s?nocache=%d", baseURL, j)

		resp, err := client.Get(reqURL)
		if err != nil {
			results <- 0 // 0 means the request failed entirely
			continue
		}

		results <- resp.StatusCode
		resp.Body.Close()
	}
}
