package grengo

// ComposeUp starts all infrastructure and enabled backends via the grengo API.
func (s *Service) ComposeUp(build bool) error {
	args := []string{"up"}
	if build {
		args = append(args, "--build")
	}
	return s.execOK("compose", args...)
}

// ComposeDown stops all client backends and shared infrastructure.
func (s *Service) ComposeDown() error {
	return s.execOK("compose", "down")
}
