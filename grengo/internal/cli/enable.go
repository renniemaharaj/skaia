package cli

func runEnable(rest []string, c Commands) {
	c.Enable(requireArg(rest, "enable <name>", c))
}
