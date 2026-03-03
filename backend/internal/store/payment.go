package store

import (
	"fmt"
	"log"
	"math/rand"
	"os"
	"time"
)

// ── Demo provider ─────────────────────────────────────────────────────────────
// Fully simulated — no real charges, no external API calls.
// Always succeeds unless the environment variable DEMO_PAYMENT_FAIL=true.

type DemoPaymentProvider struct{}

func NewDemoPaymentProvider() PaymentProvider { return &DemoPaymentProvider{} }

func (p *DemoPaymentProvider) Charge(userID int64, amount float64, currency, _ string) (ref, status, clientSecret string, err error) {
	// Simulate a tiny network latency
	time.Sleep(time.Duration(10+rand.Intn(30)) * time.Millisecond)

	if os.Getenv("DEMO_PAYMENT_FAIL") == "true" {
		return "", "failed", "", nil
	}

	ref = fmt.Sprintf("demo_%d_%d", userID, time.Now().UnixNano())
	log.Printf("payment[demo]: charged %.2f %s for userID=%d ref=%s", amount, currency, userID, ref)
	return ref, "succeeded", "", nil
}

// ── Stripe skeleton ───────────────────────────────────────────────────────────
// Set PAYMENT_PROVIDER=stripe and STRIPE_SECRET_KEY to enable.
// The full stripe-go implementation would live here; this skeleton provides
// the correct interface so the rest of the code compiles and tests pass.

type StripePaymentProvider struct {
	secretKey string
}

func NewStripePaymentProvider(secretKey string) PaymentProvider {
	return &StripePaymentProvider{secretKey: secretKey}
}

func (p *StripePaymentProvider) Charge(userID int64, amount float64, currency, paymentMethodID string) (ref, status, clientSecret string, err error) {
	// TODO: integrate stripe-go
	//   params := &stripe.PaymentIntentParams{
	//       Amount:             stripe.Int64(int64(amount * 100)),
	//       Currency:           stripe.String(currency),
	//       PaymentMethod:      stripe.String(paymentMethodID),
	//       Confirm:            stripe.Bool(true),
	//       ReturnURL:          stripe.String(os.Getenv("STRIPE_RETURN_URL")),
	//   }
	//   pi, err := paymentintent.New(params)
	//   ...
	return "", "failed", "", fmt.Errorf("stripe provider not yet configured (set STRIPE_SECRET_KEY)")
}

// ── Factory ───────────────────────────────────────────────────────────────────

// NewPaymentProvider returns the configured provider based on environment.
func NewPaymentProvider() PaymentProvider {
	switch os.Getenv("PAYMENT_PROVIDER") {
	case "stripe":
		key := os.Getenv("STRIPE_SECRET_KEY")
		if key == "" {
			log.Println("payment: STRIPE_SECRET_KEY not set, falling back to demo provider")
			return NewDemoPaymentProvider()
		}
		return NewStripePaymentProvider(key)
	default:
		return NewDemoPaymentProvider()
	}
}
