package cli

func runExport(rest []string, c Commands) {
	name := requireArg(rest, "export <name> [-o <file.tar.gz>]", c)
	c.ExportClient(name, outputFlag(rest[1:]))
}

func outputFlag(args []string) string {
	var outFile string
	for i := 0; i < len(args); i++ {
		if (args[i] == "-o" || args[i] == "--output") && i+1 < len(args) {
			i++
			outFile = args[i]
		}
	}
	return outFile
}
