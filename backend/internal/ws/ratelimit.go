package ws

import "time"

// rateBucket implements a simple token-bucket rate limiter.
// NOT goroutine-safe — designed for single-goroutine use in Client.ReadPump.
type rateBucket struct {
	tokens float64
	last   time.Time
	rate   float64 // tokens refilled per second
	burst  float64 // maximum tokens (also initial count)
}

// newRateBucket creates a full bucket that allows rate events per second
// with an initial burst capacity.
func newRateBucket(rate, burst float64) rateBucket {
	return rateBucket{
		tokens: burst,
		last:   time.Now(),
		rate:   rate,
		burst:  burst,
	}
}

// allow consumes one token, returning true if the request is permitted.
func (b *rateBucket) allow() bool {
	now := time.Now()
	elapsed := now.Sub(b.last).Seconds()
	b.last = now
	b.tokens += elapsed * b.rate
	if b.tokens > b.burst {
		b.tokens = b.burst
	}
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func (b *rateBucket) nextAvailable() time.Duration {
	now := time.Now()
	elapsed := now.Sub(b.last).Seconds()
	tokens := b.tokens + elapsed*b.rate
	if tokens >= 1 {
		return 0
	}
	remaining := 1 - tokens
	return time.Duration(remaining / b.rate * float64(time.Second))
}
