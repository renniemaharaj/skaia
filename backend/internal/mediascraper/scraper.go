package mediascraper

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"
	"time"

	"github.com/go-rod/rod/lib/proto"
)

type ScrapeResult struct {
	Images      []string  `json:"images"`
	LastScanned time.Time `json:"last_scanned"`
}

func isLikelyThumbnail(src string) bool {
	lower := strings.ToLower(src)
	return !strings.Contains(lower, "logo") &&
		!strings.Contains(lower, "icon") &&
		!strings.Contains(lower, "svg") &&
		!strings.Contains(lower, "placeholder") &&
		(strings.HasSuffix(lower, ".jpg") ||
			strings.HasSuffix(lower, ".jpeg") ||
			strings.HasSuffix(lower, ".png") ||
			strings.HasSuffix(lower, ".webp") ||
			strings.HasSuffix(lower, ".gif"))
}

func resolveURL(link string, base string) string {
	uri, err := url.Parse(link)
	if err != nil {
		return link
	}
	baseURL, err := url.Parse(base)
	if err != nil {
		return link
	}
	return baseURL.ResolveReference(uri).String()
}

func doScrape(targetURL string) (*ScrapeResult, error) {
	if cached := GetCachedImages(targetURL); cached != nil {
		recordCacheHit()
		return cached, nil
	}

	redisKey := getCacheKey(targetURL)
	client := getRedis()

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	b := Get().Context(ctx)
	page, err := b.Page(proto.TargetCreateTarget{URL: targetURL})
	if err != nil {
		ResetBrowser()
		return nil, err
	}
	defer page.Close()

	_ = page.Timeout(10 * time.Second).WaitLoad()

	var thumbs []string

	// Try meta tags
	metaEls, _ := page.Timeout(3 * time.Second).Elements("meta")
	for _, meta := range metaEls {
		prop, _ := meta.Attribute("property")
		name, _ := meta.Attribute("name")
		content, _ := meta.Attribute("content")
		if content != nil && *content != "" {
			if (prop != nil && *prop == "og:image") || (name != nil && *name == "twitter:image") {
				thumbs = append(thumbs, resolveURL(*content, targetURL))
			}
		}
	}

	imgEls, err := page.Timeout(5 * time.Second).Elements("img")
	if err == nil {
		for _, img := range imgEls {
			for _, attr := range []string{"src", "data-src", "srcset"} {
				val, _ := img.Attribute(attr)
				if val != nil && *val != "" {
					if attr == "srcset" {
						parts := strings.Split(*val, ",")
						if len(parts) > 0 {
							urlPart := strings.TrimSpace(strings.Split(strings.TrimSpace(parts[0]), " ")[0])
							resolved := resolveURL(urlPart, targetURL)
							if isLikelyThumbnail(resolved) || isLikelyThumbnail(urlPart) {
								thumbs = append(thumbs, resolved)
							}
						}
					} else {
						resolved := resolveURL(*val, targetURL)
						if isLikelyThumbnail(resolved) || isLikelyThumbnail(*val) {
							thumbs = append(thumbs, resolved)
						}
					}
				}
			}
		}
	}

	seen := make(map[string]bool)
	var result []string
	for _, t := range thumbs {
		if !seen[t] {
			seen[t] = true
			result = append(result, t)
		}
	}

	res := &ScrapeResult{
		Images:      result,
		LastScanned: time.Now(),
	}

	if client != nil {
		if data, err := json.Marshal(res); err == nil {
			client.Set(context.Background(), redisKey, string(data), 24*time.Hour)
		}
	}

	recordNewScrape()
	return res, nil
}
