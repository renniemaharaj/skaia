package cli

func runDisable(rest []string, c Commands) {
	c.Disable(requireArg(rest, "disable <name>", c))
}
