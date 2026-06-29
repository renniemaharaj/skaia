package mediascraper

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"sync/atomic"

	"github.com/skaia/backend/internal/workers"
	"github.com/skaia/backend/internal/ws"
	"github.com/renniemaharaj/conveyor/pkg/conveyor"
)

var (
	activeJobs int32
	wsHub      *ws.Hub

	scraperManager *conveyor.Manager
	initOnce       sync.Once
)

type jobRequest struct {
	targetURL string
}

func initScraper() {
	initOnce.Do(func() {
		scraperManager = conveyor.CreateManager().
			SetMinWorkers(1).
			SetMaxWorkers(workers.Budget(workers.DomainMediaScraper)). // limit concurrent browser pages based on CPU/memory budget
			SetSafeQueueLength(200)
		scraperManager.Start()
	})
}

func SetHub(hub *ws.Hub) {
	wsHub = hub
}

func GetActiveJobs() int {
	return int(atomic.LoadInt32(&activeJobs))
}

func broadcastJobStarted(targetURL string) {
	if wsHub == nil {
		return
	}
	type payload struct {
		URL string `json:"url"`
	}
	p, _ := json.Marshal(payload{URL: targetURL})
	wsHub.Broadcast(&ws.Message{Type: ws.MediaScraperStarted, Payload: p})
}

func broadcastJobDropped(targetURL string) {
	if wsHub == nil {
		return
	}
	type payload struct {
		URL string `json:"url"`
	}
	p, _ := json.Marshal(payload{URL: targetURL})
	wsHub.Broadcast(&ws.Message{Type: ws.MediaScraperDropped, Payload: p})
}

func broadcastJobResult(targetURL string, res *ScrapeResult, err error) {
	if wsHub == nil {
		return
	}
	type payload struct {
		URL    string        `json:"url"`
		Result *ScrapeResult `json:"result,omitempty"`
		Error  string        `json:"error,omitempty"`
	}
	p := payload{URL: targetURL, Result: res}
	if err != nil {
		p.Error = err.Error()
	}
	bytes, _ := json.Marshal(p)
	wsHub.Broadcast(&ws.Message{Type: ws.MediaScraperResult, Payload: bytes})
}

func broadcastJobsUpdate() {
	if wsHub == nil {
		return
	}
	metrics := GetMetrics()
	payload, _ := json.Marshal(metrics)
	wsHub.Broadcast(&ws.Message{Type: ws.MediaScraperJobs, Payload: payload})
}

func ClearJobsAndCache() {
	initScraper()

	scraperManager.Stop()

	// Drain the queue to drop pending requests
	drained := false
	for !drained {
		select {
		case req := <-scraperManager.B.C:
			broadcastJobDropped(req.Param.(jobRequest).targetURL)
		default:
			drained = true
		}
	}

	scraperManager = conveyor.CreateManager().
		SetMinWorkers(1).
		SetMaxWorkers(workers.Budget(workers.DomainMediaScraper)).
		SetSafeQueueLength(200)
	scraperManager.Start()

	ClearCache()
	broadcastJobsUpdate()
	ResetBrowser()
}

func QueueScrape(targetURL string) error {
	initScraper()

	if cached := GetCachedImages(targetURL); cached != nil {
		recordCacheHit()
		broadcastJobResult(targetURL, cached, nil)
		return nil
	}

	job := conveyor.CreateJob(
		context.Background(),
		jobRequest{targetURL: targetURL},
		func(param any) error {
			req := param.(jobRequest)

			atomic.AddInt32(&activeJobs, 1)
			broadcastJobsUpdate()
			
			defer func() {
				atomic.AddInt32(&activeJobs, -1)
				broadcastJobsUpdate()
			}()

			broadcastJobStarted(req.targetURL)
			res, err := doScrape(req.targetURL)
			broadcastJobResult(req.targetURL, res, err)
			return err
		},
		nil,
		nil,
	)

	select {
	case scraperManager.B.C <- *job:
		return nil
	default:
		return fmt.Errorf("scraping queue is full")
	}
}
