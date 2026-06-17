package cli

func runStart(rest []string, c Commands) {
	c.Start(requireArg(rest, "start <name>", c))
}
