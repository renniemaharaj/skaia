package cli

import "strconv"

func runAPI(rest []string, c Commands) {
	sub := requireArg(rest, "api <start|stop|status>", c)
	switch sub {
	case "start":
		port := c.DefaultAPIPort
		for i := 1; i < len(rest); i++ {
			if rest[i] == "--port" && i+1 < len(rest) {
				i++
				p, err := strconv.Atoi(rest[i])
				if err != nil {
					c.Die("Invalid port: %s", rest[i])
				}
				port = p
			}
		}
		c.APIStart(port)
	case "stop":
		c.APIStop()
	case "status":
		c.APIStatus()
	default:
		c.Die("Unknown api subcommand: %s", sub)
	}
}
