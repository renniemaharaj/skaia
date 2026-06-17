package cli

func runImport(rest []string, c Commands) {
	archivePath := requireArg(rest, "import <file.tar.gz> [--name <n>] [--port <p>]", c)
	var newName, newPort string
	for i := 1; i < len(rest); i++ {
		switch rest[i] {
		case "--name":
			if i+1 < len(rest) {
				i++
				newName = rest[i]
			}
		case "--port":
			if i+1 < len(rest) {
				i++
				newPort = rest[i]
			}
		}
	}
	c.ImportClient(archivePath, newName, newPort)
}
