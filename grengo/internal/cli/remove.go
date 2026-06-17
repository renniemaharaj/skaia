package cli

func runRemove(rest []string, c Commands) {
	c.Remove(requireArg(rest, "remove <name>", c))
}
