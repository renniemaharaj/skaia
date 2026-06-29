package mediascraper

import (
	"sync"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
)

var (
	singleton  *rod.Browser
	singletonMu sync.Mutex
)

func Get() *rod.Browser {
	singletonMu.Lock()
	defer singletonMu.Unlock()
	if singleton == nil {
		path := launcher.New().
			Bin("/usr/bin/chromium-browser").
			Headless(true).
			Leakless(true).
			Set("disable-blink-features", "AutomationControlled").
			Set("no-sandbox", "true").
			MustLaunch()

		singleton = rod.New().ControlURL(path).MustConnect()
	}
	return singleton
}

func ResetBrowser() {
	singletonMu.Lock()
	defer singletonMu.Unlock()
	if singleton != nil {
		_ = singleton.Close()
		singleton = nil
	}
}
