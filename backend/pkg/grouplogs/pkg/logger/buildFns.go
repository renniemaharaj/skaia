package logger

// Builder functions
func (l *Logger) Prefix(p string) *Logger {
	l.prefix = p
	return l
}

// MaxLines sets the maximum number of lines allowed for a file
func (l *Logger) MaxLines(m int) *Logger {
	l.maxLines = m
	return l
}

// Should out to std out also?
func (l *Logger) STDOUT(b bool) *Logger {
	l.toStdout = b
	return l
}

// Whether to output in json format
func (l *Logger) JsonMode(b bool) *Logger {
	l.jsonMode = b
	return l
}

// Will only out debugs to stdout if stdout and debug mode
func (l *Logger) DebugMode(b bool) *Logger {
	l.debugging = b
	return l
}

// Enable or disable subscribable mode
func (l *Logger) Subscribable(b bool) *Logger {
	l.subscribable = b
	if l.subscribable {
		l.Subscribers = &Subscribers{}
	}

	return l
}
