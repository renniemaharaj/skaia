package entity

type Site struct {
	SiteName string   `json:"site_name"`
	Apps     []string `json:"apps"`
}
