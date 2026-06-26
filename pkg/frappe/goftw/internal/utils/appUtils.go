package utils

import "goftw/internal/entity"

// extractAppNames extracts only the Name field from []AppInfo
func ExtractAppNames(apps []entity.App) []string {
	names := make([]string, 0, len(apps))
	for _, app := range apps {
		names = append(names, app.Name)
	}
	return names
}
