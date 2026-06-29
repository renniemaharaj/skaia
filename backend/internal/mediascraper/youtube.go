package mediascraper

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-rod/rod/lib/proto"
)

var youtubeHTTPClient = &http.Client{
	Timeout: 10 * time.Second,
}

type YouTubeSearchResult struct {
	URL   string `json:"url"`
	Title string `json:"title,omitempty"`
}

func getYouTubeCacheKey(query string) string {
	normalized := strings.ToLower(strings.TrimSpace(query))
	return "mediascraper:yt_cache:" + normalized
}

func getCachedYouTubeResults(query string) []YouTubeSearchResult {
	client := getRedis()
	if client == nil {
		return nil
	}
	
	key := getYouTubeCacheKey(query)
	val, err := client.Get(context.Background(), key).Result()
	if err != nil {
		return nil
	}
	
	var res []YouTubeSearchResult
	if json.Unmarshal([]byte(val), &res) == nil {
		return res
	}
	return nil
}

func cacheYouTubeResults(query string, results []YouTubeSearchResult) {
	client := getRedis()
	if client == nil || len(results) == 0 {
		return
	}
	
	key := getYouTubeCacheKey(query)
	data, err := json.Marshal(results)
	if err == nil {
		client.Set(context.Background(), key, string(data), 24*time.Hour)
	}
}

func searchYouTubeAPI(ctx context.Context, query string) ([]YouTubeSearchResult, error) {
	instances := []string{
		"https://api.piped.private.coffee",
		"https://pipedapi.smnz.de",
		"https://pipedapi.kavin.rocks",
	}

	for _, instance := range instances {
		reqURL := fmt.Sprintf("%s/search?q=%s&filter=videos", instance, url.QueryEscape(query))
		req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
		if err != nil {
			continue
		}
		
		resp, err := youtubeHTTPClient.Do(req)
		if err != nil {
			continue
		}
		
		results := func() []YouTubeSearchResult {
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				return nil
			}
			
			var rawData interface{}
			if err := json.NewDecoder(resp.Body).Decode(&rawData); err != nil {
				return nil
			}

			// Piped instances might return { "items": [...] } or just [...]
			var items []interface{}
			if m, ok := rawData.(map[string]interface{}); ok {
				if v, exists := m["items"]; exists {
					if arr, isArr := v.([]interface{}); isArr {
						items = arr
					}
				}
			} else if arr, isArr := rawData.([]interface{}); isArr {
				items = arr
			}

			var parsedResults []YouTubeSearchResult
			for _, itemRaw := range items {
				item, ok := itemRaw.(map[string]interface{})
				if !ok {
					continue
				}
				
				itemURL, _ := item["url"].(string)
				itemTitle, _ := item["title"].(string)

				if itemURL == "" || itemTitle == "" {
					continue
				}

				id := ""
				if strings.Contains(itemURL, "?v=") {
					id = strings.Split(itemURL, "?v=")[1]
				} else if strings.Contains(itemURL, "/watch?v=") {
					id = strings.Split(itemURL, "/watch?v=")[1]
				}
				if id != "" {
					parsedResults = append(parsedResults, YouTubeSearchResult{
						URL:   "https://www.youtube.com/watch?v=" + id,
						Title: itemTitle,
					})
				}
			}
			return parsedResults
		}()
		
		if len(results) > 0 {
			return results, nil
		}
	}
	return nil, fmt.Errorf("all api instances failed")
}

func SearchYouTube(ctx context.Context, query string) ([]YouTubeSearchResult, error) {
	if cached := getCachedYouTubeResults(query); cached != nil {
		return cached, nil
	}

	searchURL := "https://www.youtube.com/results?search_query=" + url.QueryEscape(query)

	ctxRod, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	b := Get().Context(ctxRod)
	page, err := b.Page(proto.TargetCreateTarget{URL: searchURL})
	
	if err != nil {
		ResetBrowser()
		// fallback to API
		if res, apiErr := searchYouTubeAPI(ctx, query); apiErr == nil {
			cacheYouTubeResults(query, res)
			return res, nil
		}
		return nil, fmt.Errorf("failed to create page: %w", err)
	}
	defer page.Close()

	_ = page.Timeout(10 * time.Second).WaitLoad()

	links, err := page.Timeout(5 * time.Second).Elements("a")
	if err != nil || len(links) == 0 {
		if res, apiErr := searchYouTubeAPI(ctx, query); apiErr == nil {
			cacheYouTubeResults(query, res)
			return res, nil
		}
		if err != nil {
			return nil, err
		}
	}

	results := make([]YouTubeSearchResult, 0)
	seen := make(map[string]bool)

	for _, link := range links {
		href, err := link.Attribute("href")
		if err != nil || href == nil {
			continue
		}

		actualURL := *href
		if !strings.HasPrefix(actualURL, "/watch?v=") && !strings.Contains(actualURL, "youtube.com/watch?v=") {
			continue
		}

		if strings.HasPrefix(actualURL, "/watch?v=") {
			actualURL = "https://www.youtube.com" + actualURL
		}

		if strings.Contains(actualURL, "/shorts/") {
			continue
		}

		if idx := strings.Index(actualURL, "&"); idx != -1 {
			actualURL = actualURL[:idx]
		}

		if !seen[actualURL] {
			seen[actualURL] = true
			
			titleAttr, _ := link.Attribute("title")
			title := ""
			if titleAttr != nil && *titleAttr != "" {
				title = *titleAttr
			} else {
				text, _ := link.Text()
				title = strings.TrimSpace(text)
			}
			
			if title == "" {
				continue
			}

			results = append(results, YouTubeSearchResult{
				URL:   actualURL,
				Title: title,
			})
		}
	}

	if len(results) == 0 {
		if res, apiErr := searchYouTubeAPI(ctx, query); apiErr == nil {
			cacheYouTubeResults(query, res)
			return res, nil
		}
	} else {
		cacheYouTubeResults(query, results)
	}

	return results, nil
}
