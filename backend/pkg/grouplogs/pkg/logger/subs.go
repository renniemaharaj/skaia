package logger

import "sync"

// Subscription represents a single subscriber with a unique ID and a channel to receive log lines
type Subscription struct {
	K int
	C chan Line
}

// Subscribers manages multiple subscriptions with concurrency safety
type Subscribers struct {
	mu          sync.Mutex
	nextID      int
	Subscribers []*Subscription
}

// Subscribe creates a new subscription in a concurrency-safe way
func (s *Subscribers) Subscribe() *Subscription {
	s.mu.Lock()
	defer s.mu.Unlock()

	sub := &Subscription{
		K: s.nextID,
		C: make(chan Line, 100), // buffered to avoid blocking
	}

	s.nextID++
	s.Subscribers = append(s.Subscribers, sub)
	return sub
}

// Unsubscribe removes a given subscription from the list and closes its channel
func (s *Subscribers) Unsubscribe(sub *Subscription) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var updated []*Subscription
	for _, ss := range s.Subscribers {
		if ss != sub {
			updated = append(updated, ss)
		}
	}
	close(sub.C)
	s.Subscribers = updated
}

// Broadcast sends a log line to all subscribers
func (s *Subscribers) Broadcast(line Line) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, ss := range s.Subscribers {
		if ss.C != nil {
			ss.C <- line
		}
	}
}
