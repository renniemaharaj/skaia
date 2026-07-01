package cli

import "strconv"

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
		{names: []string{"restart"}, run: runRestart},
		{names: []string{"remove", "rm"}, run: runRemove},
		{names: []string{"build"}, run: runBuild},
		{names: []string{"ship"}, run: runShip},
		{names: []string{"dev"}, run: runDev},
		{names: []string{"compose"}, run: runCompose},
		{names: []string{"livekit"}, run: runLiveKit},
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
		{names: []string{"frappe-provision"}, run: runFrappeProvision},
		{names: []string{"frappe-rebuild"}, run: runFrappeRebuild},
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

func runNew(rest []string, c Commands) {
	c.New(rest)
}

func runList(_ []string, c Commands) {
	c.List()
}

func runEnable(rest []string, c Commands) {
	c.Enable(requireArg(rest, "enable <name>", c))
}

func runDisable(rest []string, c Commands) {
	c.Disable(requireArg(rest, "disable <name>", c))
}

func runStart(rest []string, c Commands) {
	if len(rest) == 0 {
		c.GlobalStart()
		return
	}
	c.Start(rest[0])
}

func runStop(rest []string, c Commands) {
	if len(rest) == 0 {
		c.GlobalStop()
		return
	}
	c.Stop(rest[0])
}

func runRestart(rest []string, c Commands) {
	if len(rest) == 0 {
		c.GlobalRestart()
		return
	}
	name := rest[0]
	c.Stop(name)
	c.Start(name)
}

func runRemove(rest []string, c Commands) {
	c.Remove(requireArg(rest, "remove <name>", c))
}

func runBuild(_ []string, c Commands) {
	c.Build()
}

func runShip(rest []string, c Commands) {
	sub := requireArg(rest, "ship frontend", c)
	if sub == "frontend" {
		c.ShipFrontend()
	} else {
		c.Die("Unknown ship subcommand: %s", sub)
	}
}

func runDev(_ []string, c Commands) {
	c.Dev()
}

func runCompose(rest []string, c Commands) {
	sub := requireArg(rest, "compose <up|down>", c)
	switch sub {
	case "up":
		follow := false
		build := false
		forceRecreate := false
		for i := 1; i < len(rest); i++ {
			switch rest[i] {
			case "--follow", "--no-detach":
				follow = true
			case "--build":
				build = true
			case "--force-recreate":
				forceRecreate = true
			case "-d", "--detach":
				follow = false
			default:
				c.Die("Unknown compose up option: %s", rest[i])
			}
		}
		c.ComposeUp(follow, build, forceRecreate)
	case "down":
		c.ComposeDown()
	default:
		c.Die("Unknown compose subcommand: %s", sub)
	}
}

func runLiveKit(rest []string, c Commands) {
	c.LiveKit(rest)
}

func runNginx(rest []string, c Commands) {
	sub := requireArg(rest, "nginx <reload>", c)
	if sub != "reload" {
		c.Die("Unknown nginx subcommand: %s", sub)
	}
	c.NginxReload()
}

func runDB(rest []string, c Commands) {
	sub := requireArg(rest, "db <init>", c)
	if sub != "init" {
		c.Die("Unknown db subcommand: %s", sub)
	}
	c.DBInit(requireArg(rest[1:], "db init <name>", c))
}

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

func runLogs(rest []string, c Commands) {
	name := requireArg(rest, "logs <name> [-f]", c)
	c.Logs(name, rest[1:])
}

func runUpdate(rest []string, c Commands) {
	sub := requireArg(rest, "update <name|all>", c)
	if sub == "all" {
		c.UpdateAll()
		return
	}
	c.UpdateClient(sub)
}

func runExport(rest []string, c Commands) {
	name := requireArg(rest, "export <name> [-o <file.tar.gz>]", c)
	c.ExportClient(name, outputFlag(rest[1:]))
}

func runImport(rest []string, c Commands) {
	archivePath := requireArg(rest, "import <file.tar.gz> [--name <n>] [--port <p>]", c)
	var newName, newPort string
	for i := 1; i < len(rest); i++ {
		switch rest[i] {
		case "--name":
			if i+1 < len(rest) {
				i++
				newName = rest[i]
			}
		case "--port":
			if i+1 < len(rest) {
				i++
				newPort = rest[i]
			}
		}
	}
	c.ImportClient(archivePath, newName, newPort)
}

func runExportNode(rest []string, c Commands) {
	c.ExportNode(outputFlag(rest))
}

func runWipe(rest []string, c Commands) {
	sub := requireArg(rest, "wipe <all>", c)
	if sub != "all" {
		c.Die("Unknown wipe subcommand: %s", sub)
	}
	c.WipeAll()
}

func runImportNode(rest []string, c Commands) {
	c.ImportNode(requireArg(rest, "import-node <file.tar.gz>", c))
}

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

func runPasscode(rest []string, c Commands) {
	sub := requireArg(rest, "passcode <set|verify|clear|status>", c)
	switch sub {
	case "set":
		c.PasscodeSet(rest[1:])
	case "verify":
		c.PasscodeVerify(rest[1:])
	case "clear":
		c.PasscodeClear()
	case "status":
		c.PasscodeStatus()
	default:
		c.Die("Unknown passcode subcommand: %s", sub)
	}
}

func runHelp(_ []string, _ Commands) {
	Usage()
}

func requireArg(args []string, usage string, c Commands) string {
	if len(args) == 0 {
		c.Die("Usage: grengo %s", usage)
	}
	return args[0]
}

func outputFlag(args []string) string {
	var outFile string
	for i := 0; i < len(args); i++ {
		if (args[i] == "-o" || args[i] == "--output") && i+1 < len(args) {
			i++
			outFile = args[i]
		}
	}
	return outFile
}

func runFrappeProvision(rest []string, c Commands) {
	siteName := requireArg(rest, "frappe-provision <site_name>", c)
	version := "16"
	for i := 1; i < len(rest); i++ {
		if (rest[i] == "--version" || rest[i] == "--frappe-version") && i+1 < len(rest) {
			version = rest[i+1]
			i++
		}
	}
	c.FrappeProvision(siteName, version)
}

func runFrappeRebuild(_ []string, c Commands) {
	c.FrappeRebuild()
}
