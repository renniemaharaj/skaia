package cli

func runUpdate(rest []string, c Commands) {
	sub := requireArg(rest, "update <name|all>", c)
	if sub == "all" {
		c.UpdateAll()
		return
	}
	c.UpdateClient(sub)
}
