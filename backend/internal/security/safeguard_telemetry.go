package security

import "sync/atomic"

type SafeguardTelemetrySnapshot struct {
	GuestDecisions       int64 `json:"guest_decisions"`
	ProvisionalDecisions int64 `json:"provisional_decisions"`
	EstablishedDecisions int64 `json:"established_decisions"`
	ProvisionalDenials   int64 `json:"provisional_denials"`
	GuestExceptions      int64 `json:"guest_exceptions"`
	RateDenials          int64 `json:"rate_denials"`
	LimiterFailures      int64 `json:"limiter_failures"`
}

type safeguardTelemetry struct {
	guestDecisions       atomic.Int64
	provisionalDecisions atomic.Int64
	establishedDecisions atomic.Int64
	provisionalDenials   atomic.Int64
	guestExceptions      atomic.Int64
	rateDenials          atomic.Int64
	limiterFailures      atomic.Int64
}

var DefaultSafeguardTelemetry safeguardTelemetry

func (t *safeguardTelemetry) RecordDecision(tier AccountTier) {
	switch tier {
	case TierGuest:
		t.guestDecisions.Add(1)
	case TierProvisional:
		t.provisionalDecisions.Add(1)
	case TierEstablished, TierPrivileged:
		t.establishedDecisions.Add(1)
	}
}

func (t *safeguardTelemetry) RecordProvisionalDenial() { t.provisionalDenials.Add(1) }
func (t *safeguardTelemetry) RecordGuestException()    { t.guestExceptions.Add(1) }
func (t *safeguardTelemetry) RecordRateDenial()        { t.rateDenials.Add(1) }
func (t *safeguardTelemetry) RecordLimiterFailure()    { t.limiterFailures.Add(1) }

func (t *safeguardTelemetry) Snapshot() SafeguardTelemetrySnapshot {
	return SafeguardTelemetrySnapshot{
		GuestDecisions: t.guestDecisions.Load(), ProvisionalDecisions: t.provisionalDecisions.Load(),
		EstablishedDecisions: t.establishedDecisions.Load(), ProvisionalDenials: t.provisionalDenials.Load(),
		GuestExceptions: t.guestExceptions.Load(), RateDenials: t.rateDenials.Load(),
		LimiterFailures: t.limiterFailures.Load(),
	}
}
