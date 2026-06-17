package cli

type commandEntry struct {
	names []string
	run   func(args []string, c Commands)
}

func Run(args []string, c Commands) {
	if len(args) == 0 {
		Usage()
		return
	}

	registry := commandRegistry()
	for _, entry := range registry {
		if matchesCommand(args[0], entry.names) {
			entry.run(args[1:], c)
			return
		}
	}

	c.Die("Unknown command: %s (try: grengo help)", args[0])
}

func commandRegistry() []commandEntry {
	return []commandEntry{
		{names: []string{"new"}, run: runNew},
		{names: []string{"list", "ls"}, run: runList},
		{names: []string{"enable"}, run: runEnable},
		{names: []string{"disable"}, run: runDisable},
		{names: []string{"start"}, run: runStart},
		{names: []string{"stop"}, run: runStop},
		{names: []string{"remove", "rm"}, run: runRemove},
		{names: []string{"build"}, run: runBuild},
		{names: []string{"dev"}, run: runDev},
		{names: []string{"compose"}, run: runCompose},
		{names: []string{"nginx"}, run: runNginx},
		{names: []string{"db"}, run: runDB},
		{names: []string{"migrate"}, run: runMigrate},
		{names: []string{"logs"}, run: runLogs},
		{names: []string{"update"}, run: runUpdate},
		{names: []string{"export"}, run: runExport},
		{names: []string{"import"}, run: runImport},
		{names: []string{"export-node"}, run: runExportNode},
		{names: []string{"wipe"}, run: runWipe},
		{names: []string{"import-node"}, run: runImportNode},
		{names: []string{"api"}, run: runAPI},
		{names: []string{"passcode"}, run: runPasscode},
		{names: []string{"help", "--help", "-h"}, run: runHelp},
	}
}

func matchesCommand(name string, aliases []string) bool {
	for _, alias := range aliases {
		if name == alias {
			return true
		}
	}
	return false
}
