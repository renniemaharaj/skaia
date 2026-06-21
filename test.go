package main
import (
	"fmt"
	"net/url"
)
func main() {
	u, _ := url.Parse("http://skaia_frappe_cluster_1:80")
	fmt.Printf("Host: %q, Scheme: %q\n", u.Host, u.Scheme)
}
