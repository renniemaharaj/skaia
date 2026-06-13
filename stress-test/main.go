package main

import (
	"fmt"
	"net/http"
	"sort"
	"sync"
	"time"
)

type Result struct {
	url       string
	code      int
	timestamp time.Time
	duration  time.Duration
}

func main() {
	targets := []string{
		"https://thewriterco.com/api/",
	}

	totalRequestsPerTarget := 200000
	concurrencyPerTarget := 200

	fmt.Printf("Starting dual stress test...\n")
	fmt.Printf("Targets: %v\n", targets)
	fmt.Printf("Requests per Target: %d\n", totalRequestsPerTarget)
	fmt.Printf("Concurrency per Target: %d threads\n\n", concurrencyPerTarget)

	results := make(chan Result, totalRequestsPerTarget*len(targets))
	var wg sync.WaitGroup

	for _, target := range targets {
		jobs := make(chan int, totalRequestsPerTarget)

		for w := 1; w <= concurrencyPerTarget; w++ {
			wg.Add(1)
			go worker(&wg, target, jobs, results)
		}

		go func(url string, jobChan chan<- int) {
			for j := 1; j <= totalRequestsPerTarget; j++ {
				jobChan <- j
			}
			close(jobChan)
		}(target, jobs)
	}

	wg.Wait()
	close(results)

	// Group results by URL
	resultsByUrl := make(map[string][]Result)
	for r := range results {
		resultsByUrl[r.url] = append(resultsByUrl[r.url], r)
	}

	for _, target := range targets {
		allResults := resultsByUrl[target]
		sort.Slice(allResults, func(i, j int) bool {
			return allResults[i].timestamp.Before(allResults[j].timestamp)
		})

		tally := make(map[int]int)
		for _, r := range allResults {
			tally[r.code]++
		}

		fmt.Printf("===================================================\n")
		fmt.Printf("Results for %s\n", target)
		fmt.Printf("===================================================\n")
		for code, count := range tally {
			if code == 0 {
				fmt.Printf("%5d %s (Connection Failed/Timeout)\n", count, "000")
			} else {
				fmt.Printf("%5d %d\n", count, code)
			}
		}

		fmt.Printf("\n--- Escalation Curve ---\n")
		bucketSize := 200
		for i := 0; i < len(allResults); i += bucketSize {
			end := i + bucketSize
			if end > len(allResults) {
				end = len(allResults)
			}
			bucket := allResults[i:end]
			bucketTally := make(map[int]int)
			var totalDuration time.Duration

			for _, r := range bucket {
				bucketTally[r.code]++
				totalDuration += r.duration
			}
			avgLatency := totalDuration / time.Duration(len(bucket))

			fmt.Printf("Reqs %4d - %4d | Avg Latency: %7s | ", i+1, end, avgLatency.Round(time.Millisecond))
			for code, count := range bucketTally {
				fmt.Printf("[%d: %d] ", code, count)
			}
			fmt.Println()
		}
		fmt.Println()
	}
}

func worker(wg *sync.WaitGroup, targetURL string, jobs <-chan int, results chan<- Result) {
	defer wg.Done()
	client := &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			MaxIdleConnsPerHost: 200,
		},
	}

	for j := range jobs {
		reqURL := fmt.Sprintf("%s?nocache=%d", targetURL, j)
		start := time.Now()

		resp, err := client.Get(reqURL)
		duration := time.Since(start)

		if err != nil {
			results <- Result{url: targetURL, code: 0, timestamp: time.Now(), duration: duration}
			continue
		}

		results <- Result{url: targetURL, code: resp.StatusCode, timestamp: time.Now(), duration: duration}
		resp.Body.Close()
	}
}
