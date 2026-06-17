package cli

func runMigrate(rest []string, c Commands) {
	target := requireArg(rest, "migrate <name|all> [--rebuild]", c)
	rebuild := false
	for _, arg := range rest[1:] {
		if arg == "--rebuild" {
			rebuild = true
		}
	}
	if target == "all" {
		c.MigrateAll(rebuild)
		return
	}
	c.Migrate(target, rebuild)
}
