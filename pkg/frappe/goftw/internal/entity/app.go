package entity

// App is a normalized representation of an app from `bench list-apps`.
type App struct {
	Name    string // e.g. "frappe"
	Version string // e.g. "15.x.x-develop"
	Commit  string // e.g. "14a68b9"
	Branch  string // e.g. "develop"
	Raw     string // original line
}

type AppForReact struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}
