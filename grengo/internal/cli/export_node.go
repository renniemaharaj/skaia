package cli

func runExportNode(rest []string, c Commands) {
	c.ExportNode(outputFlag(rest))
}
