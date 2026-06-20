package conveyor

import (
	"time"
)

// Set the manager's debug mode
func (m *Manager) SetDebugging(b bool) *Manager {
	m.debugging = b
	return m
}

// Set the manager's min workers allowed
func (m *Manager) SetMinWorkers(mw int) *Manager {
	m.minWorkersAllowed = mw
	return m
}

// Set the manager's max workers allowed
func (m *Manager) SetMaxWorkers(mw int) *Manager {
	m.maxWorkersAllowed = mw
	return m
}

// Set the manager's stepUpAt for threshold of jobs
func (m *Manager) SetSafeQueueLength(s int) *Manager {
	m.safeQueueLength = s
	return m
}

// Set the manager's time per ticker (dynamically changing)
func (m *Manager) SetTimePerTicker(t time.Duration) *Manager {
	if m.ticker != nil {
		m.ticker.Stop()
	}
	m.ticker = time.NewTicker(t)
	return m
}
