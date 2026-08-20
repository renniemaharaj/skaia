package security

import "testing"

func TestSafeguardTelemetryUsesBoundedCounters(t *testing.T) {
	var telemetry safeguardTelemetry
	telemetry.RecordDecision(TierGuest)
	telemetry.RecordDecision(TierProvisional)
	telemetry.RecordDecision(TierEstablished)
	telemetry.RecordProvisionalDenial()
	telemetry.RecordGuestException()
	telemetry.RecordRateDenial()
	telemetry.RecordLimiterFailure()
	got := telemetry.Snapshot()
	if got.GuestDecisions != 1 || got.ProvisionalDecisions != 1 || got.EstablishedDecisions != 1 ||
		got.ProvisionalDenials != 1 || got.GuestExceptions != 1 || got.RateDenials != 1 || got.LimiterFailures != 1 {
		t.Fatalf("snapshot = %#v", got)
	}
}
