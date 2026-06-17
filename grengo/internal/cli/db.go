package cli

func runDB(rest []string, c Commands) {
	sub := requireArg(rest, "db <init>", c)
	if sub != "init" {
		c.Die("Unknown db subcommand: %s", sub)
	}
	c.DBInit(requireArg(rest[1:], "db init <name>", c))
}
