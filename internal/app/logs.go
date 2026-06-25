package app

func cmdLogs(name string, extra []string) {
	if !clientExists(name) {
		die("Client '%s' not found", name)
	}
	if err := dockerComposeLogs(clientComposeFile(name), extra...); err != nil {
		die("Failed to get logs: %v", err)
	}
}
