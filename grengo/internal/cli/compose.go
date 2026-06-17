package cli

func runCompose(rest []string, c Commands) {
	sub := requireArg(rest, "compose <up|down>", c)
	switch sub {
	case "up":
		follow := false
		build := false
		for i := 1; i < len(rest); i++ {
			switch rest[i] {
			case "--follow", "--no-detach":
				follow = true
			case "--build":
				build = true
			case "-d", "--detach":
				follow = false
			default:
				c.Die("Unknown compose up option: %s", rest[i])
			}
		}
		c.ComposeUp(follow, build)
	case "down":
		c.ComposeDown()
	default:
		c.Die("Unknown compose subcommand: %s", sub)
	}
}
