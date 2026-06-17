package cli

func runWipe(rest []string, c Commands) {
	sub := requireArg(rest, "wipe <all>", c)
	if sub != "all" {
		c.Die("Unknown wipe subcommand: %s", sub)
	}
	c.WipeAll()
}
