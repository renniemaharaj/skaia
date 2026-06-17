package cli

func runLogs(rest []string, c Commands) {
	name := requireArg(rest, "logs <name> [-f]", c)
	c.Logs(name, rest[1:])
}
