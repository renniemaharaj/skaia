package cli

func runStop(rest []string, c Commands) {
	c.Stop(requireArg(rest, "stop <name>", c))
}
