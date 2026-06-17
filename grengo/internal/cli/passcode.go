package cli

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
