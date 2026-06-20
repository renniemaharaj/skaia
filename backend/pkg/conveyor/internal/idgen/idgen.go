package idgen

import "sync"

// Structure of a unique ID generator
type IDGenerator struct {
	m       sync.Mutex
	uniqeID int
}

// Multi-thread safe unique id generator
func (id *IDGenerator) NewUniqueID() int {
	id.m.Lock()
	defer id.m.Unlock()
	id.uniqeID++

	return id.uniqeID
}
