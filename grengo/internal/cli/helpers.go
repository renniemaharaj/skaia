package cli

func requireArg(args []string, usage string, c Commands) string {
	if len(args) == 0 {
		c.Die("Usage: grengo %s", usage)
	}
	return args[0]
}
