package app

import "github.com/skaia/grengo/internal/cli"

func CLICommands() cli.Commands {
	return cli.Commands{
		DefaultAPIPort: DefaultAPIPort,
		Die:            die,
		New:            cmdNew,
		List:           cmdList,
		Enable:         cmdEnable,
		Disable:        cmdDisable,
		Start:          cmdStart,
		Stop:           cmdStop,
		Remove:         cmdRemove,
		Build:          cmdBuild,
		GlobalStart:    cmdGlobalStart,
		GlobalStop:     cmdGlobalStop,
		GlobalRestart:  cmdGlobalRestart,
		ShipFrontend:   cmdShipFrontend,
		Dev:            cmdDev,
		ComposeUp:      cmdComposeUp,
		ComposeDown:    cmdComposeDown,
		NginxReload:    cmdNginxReload,
		DBInit:         cmdDBInit,
		Migrate:        cmdMigrate,
		MigrateAll:     cmdMigrateAll,
		Logs:           cmdLogs,
		UpdateClient:   cmdUpdateClient,
		UpdateAll:      cmdUpdateAll,
		ExportClient:   cmdExportClient,
		ImportClient:   cmdImportClient,
		ExportNode:     cmdExportNode,
		ImportNode:     cmdImportNode,
		WipeAll:        cmdWipeAll,
		APIStart:       cmdAPIStart,
		APIStop:        cmdAPIStop,
		APIStatus:      cmdAPIStatus,
		PasscodeSet:    cmdPasscodeSet,
		PasscodeVerify: cmdPasscodeVerify,
		PasscodeClear:  cmdPasscodeClear,
		PasscodeStatus: cmdPasscodeStatus,
		FrappeProvision: func(siteName, version string) {
			cmdFrappeProvision(siteName, version)
		},
		FrappeRebuild: func() {
			cmdFrappeRebuild()
		},
	}
}
