package store

import (
	"fmt"
	"log"
	"math/rand"
	"os"
	"time"

	"github.com/skaia/backend/models"
	"github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/checkout/session"
	"github.com/stripe/stripe-go/v82/customer"
	"github.com/stripe/stripe-go/v82/paymentintent"
	"github.com/stripe/stripe-go/v82/price"
	"github.com/stripe/stripe-go/v82/product"
	sub "github.com/stripe/stripe-go/v82/subscription"
)

// DemoPaymentProvider simulates payment operations without external calls.
type DemoPaymentProvider struct{}

// NewDemoPaymentProvider returns a demo provider.
func NewDemoPaymentProvider() PaymentProvider { return &DemoPaymentProvider{} }

func (p *DemoPaymentProvider) Charge(userID, amountCents int64, currency, _ string) (ref, status, clientSecret string, err error) {
	time.Sleep(time.Duration(10+rand.Intn(30)) * time.Millisecond)

	if os.Getenv("DEMO_PAYMENT_FAIL") == "true" {
		return "", "failed", "", nil
	}

	ref = fmt.Sprintf("demo_%d_%d", userID, time.Now().UnixNano())
	log.Printf("payment[demo]: charged %d cents %s for userID=%d ref=%s", amountCents, currency, userID, ref)
	return ref, "succeeded", "", nil
}

func (p *DemoPaymentProvider) GetPaymentStatus(providerRef string) (string, error) {
	return "succeeded", nil
}

func (p *DemoPaymentProvider) CreateSubscription(userID int64, plan *models.SubscriptionPlan, email string) (*SubscriptionResult, error) {
	ref := fmt.Sprintf("demo_sub_%d_%d", userID, time.Now().UnixNano())
	custRef := fmt.Sprintf("demo_cus_%d", userID)
	now := time.Now()
	end := now.AddDate(0, plan.IntervalCount, 0)
	if plan.IntervalUnit == "year" {
		end = now.AddDate(plan.IntervalCount, 0, 0)
	}
	log.Printf("payment[demo]: subscription created for userID=%d plan=%s ref=%s", userID, plan.Name, ref)
	return &SubscriptionResult{
		ProviderSubscriptionID: ref,
		ProviderCustomerID:     custRef,
		Status:                 "active",
		CurrentPeriodStart:     now,
		CurrentPeriodEnd:       end,
	}, nil
}

func (p *DemoPaymentProvider) CancelSubscription(providerSubID string, atPeriodEnd bool) error {
	log.Printf("payment[demo]: subscription cancelled ref=%s atPeriodEnd=%v", providerSubID, atPeriodEnd)
	return nil
}

func (p *DemoPaymentProvider) GetSubscriptionStatus(providerSubID string) (string, error) {
	return "active", nil
}

func (p *DemoPaymentProvider) CreateCheckoutSession(plan *models.SubscriptionPlan, customerEmail, successURL, cancelURL string) (string, error) {
	return fmt.Sprintf("https://demo-checkout.local/session/%d", time.Now().UnixNano()), nil
}

// StripePaymentProvider integrates with the Stripe API.
type StripePaymentProvider struct {
	secretKey string
}

// NewStripePaymentProvider returns a configured Stripe provider.
func NewStripePaymentProvider(secretKey string) PaymentProvider {
	stripe.Key = secretKey
	return &StripePaymentProvider{secretKey: secretKey}
}

// Charge creates a PaymentIntent and confirms it immediately.
func (p *StripePaymentProvider) Charge(userID, amountCents int64, currency, paymentMethodID string) (ref, status, clientSecret string, err error) {
	params := &stripe.PaymentIntentParams{
		Amount:   stripe.Int64(amountCents),
		Currency: stripe.String(currency),
		Metadata: map[string]string{
			"user_id": fmt.Sprintf("%d", userID),
		},
	}
	if paymentMethodID != "" {
		params.PaymentMethod = stripe.String(paymentMethodID)
		params.Confirm = stripe.Bool(true)
		params.AutomaticPaymentMethods = &stripe.PaymentIntentAutomaticPaymentMethodsParams{
			Enabled:        stripe.Bool(true),
			AllowRedirects: stripe.String("never"),
		}
	} else {
		params.AutomaticPaymentMethods = &stripe.PaymentIntentAutomaticPaymentMethodsParams{
			Enabled: stripe.Bool(true),
		}
	}

	pi, err := paymentintent.New(params)
	if err != nil {
		return "", "failed", "", fmt.Errorf("stripe PaymentIntent: %w", err)
	}

	return pi.ID, string(pi.Status), pi.ClientSecret, nil
}

// GetPaymentStatus retrieves the current status of a PaymentIntent.
func (p *StripePaymentProvider) GetPaymentStatus(providerRef string) (string, error) {
	pi, err := paymentintent.Get(providerRef, nil)
	if err != nil {
		return "", fmt.Errorf("stripe get PaymentIntent: %w", err)
	}
	return string(pi.Status), nil
}

// CreateSubscription creates a Stripe customer and subscription.
func (p *StripePaymentProvider) CreateSubscription(userID int64, plan *models.SubscriptionPlan, email string) (*SubscriptionResult, error) {
	if plan.StripePriceID == "" {
		return nil, fmt.Errorf("plan %q has no stripe_price_id configured", plan.Name)
	}

	// create or retrieve customer
	cust, err := customer.New(&stripe.CustomerParams{
		Email: stripe.String(email),
		Metadata: map[string]string{
			"user_id": fmt.Sprintf("%d", userID),
		},
	})
	if err != nil {
		return nil, fmt.Errorf("stripe create customer: %w", err)
	}

	// create subscription
	subParams := &stripe.SubscriptionParams{
		Customer: stripe.String(cust.ID),
		Items: []*stripe.SubscriptionItemsParams{
			{Price: stripe.String(plan.StripePriceID)},
		},
		PaymentBehavior: stripe.String("default_incomplete"),
	}
	subParams.AddExpand("latest_invoice.confirmation_secret")
	subParams.AddExpand("items.data.current_period_start")
	subParams.AddExpand("items.data.current_period_end")

	if plan.TrialDays > 0 {
		subParams.TrialPeriodDays = stripe.Int64(int64(plan.TrialDays))
	}

	s, err := sub.New(subParams)
	if err != nil {
		return nil, fmt.Errorf("stripe create subscription: %w", err)
	}

	// period is on the first subscription item in v82
	var periodStart, periodEnd int64
	if s.Items != nil && len(s.Items.Data) > 0 {
		periodStart = s.Items.Data[0].CurrentPeriodStart
		periodEnd = s.Items.Data[0].CurrentPeriodEnd
	}

	return &SubscriptionResult{
		ProviderSubscriptionID: s.ID,
		ProviderCustomerID:     cust.ID,
		Status:                 string(s.Status),
		CurrentPeriodStart:     time.Unix(periodStart, 0),
		CurrentPeriodEnd:       time.Unix(periodEnd, 0),
		ClientSecret:           extractClientSecret(s),
	}, nil
}

// CancelSubscription cancels a Stripe subscription.
func (p *StripePaymentProvider) CancelSubscription(providerSubID string, atPeriodEnd bool) error {
	if atPeriodEnd {
		_, err := sub.Update(providerSubID, &stripe.SubscriptionParams{
			CancelAtPeriodEnd: stripe.Bool(true),
		})
		return err
	}
	_, err := sub.Cancel(providerSubID, nil)
	return err
}

// GetSubscriptionStatus retrieves the current subscription status.
func (p *StripePaymentProvider) GetSubscriptionStatus(providerSubID string) (string, error) {
	s, err := sub.Get(providerSubID, nil)
	if err != nil {
		return "", fmt.Errorf("stripe get subscription: %w", err)
	}
	return string(s.Status), nil
}

// CreateCheckoutSession creates a Stripe Checkout Session for a plan.
func (p *StripePaymentProvider) CreateCheckoutSession(plan *models.SubscriptionPlan, customerEmail, successURL, cancelURL string) (string, error) {
	if plan.StripePriceID == "" {
		return "", fmt.Errorf("plan %q has no stripe_price_id", plan.Name)
	}

	params := &stripe.CheckoutSessionParams{
		Mode:          stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		CustomerEmail: stripe.String(customerEmail),
		SuccessURL:    stripe.String(successURL),
		CancelURL:     stripe.String(cancelURL),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(plan.StripePriceID),
				Quantity: stripe.Int64(1),
			},
		},
	}

	sess, err := session.New(params)
	if err != nil {
		return "", fmt.Errorf("stripe checkout session: %w", err)
	}
	return sess.URL, nil
}

// CreateStripePriceForPlan creates a Stripe Product and Price for a plan.
func CreateStripePriceForPlan(plan *models.SubscriptionPlan) (string, error) {
	prod, err := product.New(&stripe.ProductParams{
		Name:        stripe.String(plan.Name),
		Description: stripe.String(plan.Description),
	})
	if err != nil {
		return "", fmt.Errorf("stripe create product: %w", err)
	}

	interval := string(stripe.PriceRecurringIntervalMonth)
	if plan.IntervalUnit == "year" {
		interval = string(stripe.PriceRecurringIntervalYear)
	} else if plan.IntervalUnit == "week" {
		interval = string(stripe.PriceRecurringIntervalWeek)
	} else if plan.IntervalUnit == "day" {
		interval = string(stripe.PriceRecurringIntervalDay)
	}

	p, err := price.New(&stripe.PriceParams{
		Product:    stripe.String(prod.ID),
		UnitAmount: stripe.Int64(plan.PriceCents),
		Currency:   stripe.String(plan.Currency),
		Recurring: &stripe.PriceRecurringParams{
			Interval:      stripe.String(interval),
			IntervalCount: stripe.Int64(int64(plan.IntervalCount)),
		},
	})
	if err != nil {
		return "", fmt.Errorf("stripe create price: %w", err)
	}
	return p.ID, nil
}

// SubscriptionResult is returned by CreateSubscription.
type SubscriptionResult struct {
	ProviderSubscriptionID string
	ProviderCustomerID     string
	Status                 string
	CurrentPeriodStart     time.Time
	CurrentPeriodEnd       time.Time
	ClientSecret           string
}

// extractClientSecret pulls the client_secret from a subscription's latest invoice.
func extractClientSecret(s *stripe.Subscription) string {
	if s.LatestInvoice == nil {
		return ""
	}
	if s.LatestInvoice.ConfirmationSecret == nil {
		return ""
	}
	return s.LatestInvoice.ConfirmationSecret.ClientSecret
}

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
