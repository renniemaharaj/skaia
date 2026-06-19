package ratelimit

import (
	"testing"

	"github.com/skaia/backend/config"
	"github.com/stretchr/testify/assert"
)

func TestThreatLevelTracksAdaptiveAllowance(t *testing.T) {
	base := config.RateLimit.BaseLimitPerMin
	floor := config.RateLimit.MinFloorPerMin

	assert.Equal(t, "low", threatLevel(base))
	assert.Equal(t, "guarded", threatLevel(base*80/100))
	assert.Equal(t, "elevated", threatLevel(base*60/100))
	assert.Equal(t, "high", threatLevel(floor+1))
	assert.Equal(t, "critical", threatLevel(floor))
}
