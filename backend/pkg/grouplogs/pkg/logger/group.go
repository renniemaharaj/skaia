package logger

import (
	"sync"
)

// Group collects log lines from multiple loggers into a single delegate channel.
type Group struct {
	mu sync.Mutex

	Delegate      *Subscribers
	subscriptions map[*Logger]*Subscription
}

// NewGroup initializes a new log group.
func NewGroup() *Group {
	return &Group{
		Delegate:      &Subscribers{},
		subscriptions: make(map[*Logger]*Subscription),
	}
}

// Join subscribes to a logger and pipes its output into the group's delegate.
func (g *Group) Join(l *Logger) {
	sub := l.Subscribable(true).Subscribers.Subscribe() // Auto set subscribable

	g.mu.Lock()
	g.subscriptions[l] = sub
	g.mu.Unlock()

	go func() {
		for line := range sub.C {
			g.Delegate.Broadcast(line)
		}
	}()
}

// Remove unsubscribes from a logger and stops forwarding its logs.
func (g *Group) Remove(l *Logger) {
	g.mu.Lock()
	sub, ok := g.subscriptions[l]
	if ok {
		delete(g.subscriptions, l)
	}
	g.mu.Unlock()

	if ok {
		l.Subscribers.Unsubscribe(sub)
	}
}
