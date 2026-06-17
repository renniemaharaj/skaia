package cli

func runImportNode(rest []string, c Commands) {
	c.ImportNode(requireArg(rest, "import-node <file.tar.gz>", c))
}
