package environ

import "os"

var (
	frappeHome        = os.Getenv("FRAPPE_HOME")
	instanceFile      = os.Getenv("INSTANCE_JSON_SOURCE")
	commonSitesConfig = os.Getenv("COMMON_CONFIG_SOURCE")
)

// Helper to read env with default
func GetEnv(key, def string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return def
}

// GetFrappeHome returns the home directory of the frappe user, defaulting to /home/frappe.
func GetFrappeHome() string {

	if frappeHome == "" {
		frappeHome = "/home/frappe"
	}
	return frappeHome
}

// GetBenchName returns the name of the frappe bench directory, defaulting to "frappe-bench".
func GetBenchName() string {
	return "frappe-bench"
}

// GetBenchAppPath returns the full path to a specific app within the bench's apps directory.
func GetBenchAppPath(app string) string {
	return GetBenchPath() + "/apps/" + app
}

// GetBenchPath returns the full path to the frappe bench directory.
func GetBenchPath() string {
	return GetFrappeHome() + "/" + GetBenchName()
}

// GetInstanceFile returns the path to the instance.json file, defaulting to /instance.json.
func GetInstanceFile() string {
	if instanceFile == "" {
		instanceFile = "/instance.json"
	}
	return instanceFile
}

// GetCommonSitesConfigPath returns the path to the common_site_config.json file, defaulting to /common_site_config.json.
func GetCommonSitesConfigPath() string {
	if commonSitesConfig == "" {
		commonSitesConfig = "/common_site_config.json"
	}
	return commonSitesConfig
}
