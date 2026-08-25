package config

import (
	"errors"
	"testing"
	"time"

	"github.com/skaia/backend/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateLegalConfigAcceptsPageReferencesAndSelections(t *testing.T) {
	config := &models.LegalConfig{
		Policies: []models.LegalPolicy{{
			ID:          "refund_policy",
			Name:        "Refund policy",
			Description: "Store refund terms",
			PageID:      42,
			PageSlug:    "legal-refund-policy-a1b2",
			CreatedAt:   time.Now().UTC(),
		}},
		CookiePolicyIDs:   []string{},
		CheckoutPolicyIDs: []string{"refund_policy"},
	}

	require.NoError(t, validateLegalConfig(config))
}

func TestValidateLegalConfigRejectsMissingPolicySelections(t *testing.T) {
	config := &models.LegalConfig{
		Policies:          []models.LegalPolicy{},
		CookiePolicyIDs:   []string{"missing"},
		CheckoutPolicyIDs: []string{},
	}

	err := validateLegalConfig(config)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrInvalidLegalConfig))
}

func TestValidateLegalConfigNormalizesNilCollections(t *testing.T) {
	config := &models.LegalConfig{}

	require.NoError(t, validateLegalConfig(config))
	assert.NotNil(t, config.Policies)
	assert.NotNil(t, config.CookiePolicyIDs)
	assert.NotNil(t, config.CheckoutPolicyIDs)
	assert.Equal(t, "standard", config.CheckoutNoticeVariant)
	assert.Contains(t, config.CheckoutPolicyCheckboxText, "{policy}")
}

func TestValidateLegalConfigRejectsUnknownCheckoutNoticeVariant(t *testing.T) {
	config := &models.LegalConfig{CheckoutNoticeVariant: "loud"}
	err := validateLegalConfig(config)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrInvalidLegalConfig))
}
