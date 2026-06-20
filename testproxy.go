package main
import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
)
func main() {
	targetURL, _ := url.Parse("http://127.0.0.1:80017/")
	proxy := httputil.NewSingleHostReverseProxy(targetURL)
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		proxy.ServeHTTP(w, r)
	})
	go http.ListenAndServe(":9999", nil)
	
	resp, err := http.Get("http://127.0.0.1:9999/")
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	fmt.Println("Status:", resp.StatusCode)
}
