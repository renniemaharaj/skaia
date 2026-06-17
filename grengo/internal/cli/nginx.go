package cli

func runNginx(rest []string, c Commands) {
	sub := requireArg(rest, "nginx <reload>", c)
	if sub != "reload" {
		c.Die("Unknown nginx subcommand: %s", sub)
	}
	c.NginxReload()
}
