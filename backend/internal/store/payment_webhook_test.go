package store

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stripe/stripe-go/v82/webhook"
)

func TestParseStripePaymentEventVerifiesSignatureAndProjectsIntent(t *testing.T) {
	payload := []byte(`{"id":"evt_verified","api_version":"2025-08-27.basil","type":"payment_intent.succeeded","data":{"object":{"id":"pi_verified"}}}`)
	signed := webhook.GenerateTestSignedPayload(&webhook.UnsignedPayload{
		Payload: payload, Secret: "webhook-secret", Timestamp: time.Now(),
	})
	event, err := ParseStripePaymentEvent(payload, signed.Header, "webhook-secret")
	require.NoError(t, err)
	assert.Equal(t, "evt_verified", event.ID)
	assert.Equal(t, "pi_verified", event.ProviderRef)
	assert.Equal(t, "succeeded", event.Status)

	_, err = ParseStripePaymentEvent(payload, signed.Header, "wrong-secret")
	require.Error(t, err)
}

func TestParseStripePaymentEventIgnoresUnrelatedSignedEvent(t *testing.T) {
	payload := []byte(`{"id":"evt_irrelevant","api_version":"2025-08-27.basil","type":"customer.created","data":{"object":{"id":"cus_1"}}}`)
	signed := webhook.GenerateTestSignedPayload(&webhook.UnsignedPayload{Payload: payload, Secret: "webhook-secret"})
	_, err := ParseStripePaymentEvent(payload, signed.Header, "webhook-secret")
	require.ErrorIs(t, err, ErrUnsupportedPaymentEvent)
}
