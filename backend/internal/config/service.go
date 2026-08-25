package config

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/skaia/backend/internal/seocache"
	log "github.com/skaia/backend/internal/syslog"
	"github.com/skaia/backend/models"
)

var ErrInvalidLegalConfig = errors.New("invalid legal configuration")

var legalIdentifier = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
var legalSlug = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

// Service wraps the repository with business logic.
type Service struct {
	repo          Repository
	invalidateSEO func()
}

type ServiceOption func(*Service)

// WithRedisClient enables tenant-scoped cache invalidation after config writes.
func WithRedisClient(rdb *redis.Client) ServiceOption {
	return func(s *Service) {
		s.invalidateSEO = func() {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			if err := seocache.InvalidateAll(ctx, rdb); err != nil {
				log.Printf("config: invalidate SEO cache: %v", err)
			}
		}
	}
}

// WithSEOInvalidator supplies an invalidation hook for tests and alternate
// cache backends.
func WithSEOInvalidator(invalidate func()) ServiceOption {
	return func(s *Service) {
		s.invalidateSEO = invalidate
	}
}

// NewService creates a new config Service.
func NewService(repo Repository, options ...ServiceOption) *Service {
	s := &Service{repo: repo}
	for _, option := range options {
		option(s)
	}
	return s
}

// Site config
func (s *Service) GetConfig(key string) (*models.SiteConfig, error) {
	return s.repo.GetConfig(key)
}

func (s *Service) UpsertConfig(key, valueJSON string) error {
	if err := s.repo.UpsertConfig(key, valueJSON); err != nil {
		return err
	}
	if seoRelevantConfig(key) && s.invalidateSEO != nil {
		s.invalidateSEO()
	}
	return nil
}

func (s *Service) DeleteConfig(key string) error {
	if err := s.repo.DeleteConfig(key); err != nil {
		return err
	}
	if seoRelevantConfig(key) && s.invalidateSEO != nil {
		s.invalidateSEO()
	}
	return nil
}

func (s *Service) LegalConfig() (*models.LegalConfig, error) {
	siteConfig, err := s.GetConfig("legal")
	if errors.Is(err, sql.ErrNoRows) {
		return emptyLegalConfig(), nil
	}
	if err != nil {
		return nil, err
	}
	var config models.LegalConfig
	if err := json.Unmarshal([]byte(siteConfig.Value), &config); err != nil {
		return nil, err
	}
	normalizeLegalConfig(&config)
	return &config, nil
}

func (s *Service) SaveLegalConfig(config *models.LegalConfig) error {
	if err := validateLegalConfig(config); err != nil {
		return err
	}
	payload, err := json.Marshal(config)
	if err != nil {
		return err
	}
	return s.UpsertConfig("legal", string(payload))
}

func (s *Service) SaveCheckoutConfig(ids []string, variant, message, checkboxText string) (*models.LegalConfig, error) {
	config, err := s.LegalConfig()
	if err != nil {
		return nil, err
	}
	config.CheckoutPolicyIDs = ids
	config.CheckoutNoticeVariant = variant
	config.CheckoutNoticeMessage = message
	config.CheckoutPolicyCheckboxText = checkboxText
	if err := s.SaveLegalConfig(config); err != nil {
		return nil, err
	}
	return config, nil
}

func emptyLegalConfig() *models.LegalConfig {
	config := &models.LegalConfig{
		Policies:          []models.LegalPolicy{},
		CookiePolicyIDs:   []string{},
		FooterPolicyIDs:   []string{},
		CheckoutPolicyIDs: []string{},
	}
	normalizeLegalConfig(config)
	return config
}

func normalizeLegalConfig(config *models.LegalConfig) {
	if config.Policies == nil {
		config.Policies = []models.LegalPolicy{}
	}
	if config.CookiePolicyIDs == nil {
		config.CookiePolicyIDs = []string{}
	}
	if config.FooterPolicyIDs == nil {
		config.FooterPolicyIDs = []string{}
	}
	if config.CheckoutPolicyIDs == nil {
		config.CheckoutPolicyIDs = []string{}
	}
	config.CheckoutNoticeVariant = strings.TrimSpace(config.CheckoutNoticeVariant)
	if config.CheckoutNoticeVariant == "" {
		config.CheckoutNoticeVariant = "standard"
	}
	config.CheckoutNoticeMessage = strings.TrimSpace(config.CheckoutNoticeMessage)
	if config.CheckoutNoticeMessage == "" {
		config.CheckoutNoticeMessage = "Review and accept each policy before submitting your order. This browser remembers your choices."
	}
	config.CheckoutPolicyCheckboxText = strings.TrimSpace(config.CheckoutPolicyCheckboxText)
	if config.CheckoutPolicyCheckboxText == "" {
		config.CheckoutPolicyCheckboxText = "I accept {policy}"
	}
}

func invalidLegal(message string) error {
	return fmt.Errorf("%w: %s", ErrInvalidLegalConfig, message)
}

func validateLegalConfig(config *models.LegalConfig) error {
	if config == nil {
		return invalidLegal("configuration is required")
	}
	normalizeLegalConfig(config)
	if len(config.Policies) > 250 {
		return invalidLegal("too many policies")
	}
	ids := make(map[string]struct{}, len(config.Policies))
	pageIDs := make(map[int64]struct{}, len(config.Policies))
	for index := range config.Policies {
		policy := &config.Policies[index]
		policy.ID = strings.TrimSpace(policy.ID)
		policy.Name = strings.TrimSpace(policy.Name)
		policy.Description = strings.TrimSpace(policy.Description)
		policy.PageSlug = strings.TrimSpace(policy.PageSlug)
		if policy.ID == "" || len(policy.ID) > 64 || !legalIdentifier.MatchString(policy.ID) {
			return invalidLegal("policy id is invalid")
		}
		if _, exists := ids[policy.ID]; exists {
			return invalidLegal("duplicate policy id")
		}
		ids[policy.ID] = struct{}{}
		if len(policy.Name) < 2 || len(policy.Name) > 160 || len(policy.Description) > 1000 {
			return invalidLegal("policy metadata is invalid")
		}
		if policy.PageID < 1 {
			return invalidLegal("policy page is invalid")
		}
		if _, exists := pageIDs[policy.PageID]; exists {
			return invalidLegal("duplicate policy page")
		}
		pageIDs[policy.PageID] = struct{}{}
		if len(policy.PageSlug) > 120 || !legalSlug.MatchString(policy.PageSlug) || policy.CreatedAt.IsZero() {
			return invalidLegal("policy page reference is invalid")
		}
	}
	if err := validatePolicySelection(config.CookiePolicyIDs, ids, "cookie"); err != nil {
		return err
	}
	if err := validatePolicySelection(config.FooterPolicyIDs, ids, "footer"); err != nil {
		return err
	}
	if config.CheckoutNoticeVariant != "standard" && config.CheckoutNoticeVariant != "info" && config.CheckoutNoticeVariant != "attention" {
		return invalidLegal("checkout notice variant is invalid")
	}
	if len(config.CheckoutNoticeMessage) > 500 {
		return invalidLegal("checkout notice message is too long")
	}
	if len(config.CheckoutPolicyCheckboxText) > 200 {
		return invalidLegal("checkout policy checkbox text is too long")
	}
	return validatePolicySelection(config.CheckoutPolicyIDs, ids, "checkout")
}

func validatePolicySelection(selection []string, policies map[string]struct{}, label string) error {
	if len(selection) > len(policies) {
		return invalidLegal("too many " + label + " policies")
	}
	seen := make(map[string]struct{}, len(selection))
	for index, rawID := range selection {
		id := strings.TrimSpace(rawID)
		selection[index] = id
		if _, exists := policies[id]; !exists {
			return invalidLegal(label + " policy does not exist")
		}
		if _, exists := seen[id]; exists {
			return invalidLegal("duplicate " + label + " policy")
		}
		seen[id] = struct{}{}
	}
	return nil
}

func seoRelevantConfig(key string) bool {
	return key == "branding" || key == "seo" || key == "landing_page_slug"
}

func (s *Service) DeleteAllSections() error {
	return s.repo.DeleteAllSections()
}

// Landing sections
func (s *Service) ListSections() ([]*models.PageSection, error) {
	return s.repo.ListSections()
}

func (s *Service) GetSection(id int64) (*models.PageSection, error) {
	return s.repo.GetSection(id)
}

func (s *Service) CreateSection(sec *models.PageSection) error {
	if sec.Config == "" {
		sec.Config = "{}"
	}

	// Ensure a sane order (1-based), and gracefully clamp overflow/underflow.
	sections, err := s.repo.ListSections()
	if err != nil {
		return err
	}

	n := len(sections)
	if sec.DisplayOrder < 1 {
		sec.DisplayOrder = 1
	}
	if sec.DisplayOrder > n+1 {
		sec.DisplayOrder = n + 1
	}

	// Shift existing sections down from the insertion point.
	if err := s.repo.ShiftSections(sec.DisplayOrder); err != nil {
		return err
	}

	return s.repo.CreateSection(sec)
}

func (s *Service) UpdateSection(sec *models.PageSection) error {
	if sec.Config == "" {
		sec.Config = "{}"
	}
	return s.repo.UpdateSection(sec)
}

func (s *Service) DeleteSection(id int64) error {
	return s.repo.DeleteSection(id)
}

func (s *Service) ReorderSections(ids []int64) error {
	return s.repo.ReorderSections(ids)
}

// Page items
func (s *Service) ListItems(sectionID int64) ([]*models.PageItem, error) {
	return s.repo.ListItems(sectionID)
}

func (s *Service) GetItem(id int64) (*models.PageItem, error) {
	return s.repo.GetItem(id)
}

func (s *Service) CreateItem(item *models.PageItem) error {
	if item.Config == "" {
		item.Config = "{}"
	}
	return s.repo.CreateItem(item)
}

func (s *Service) UpdateItem(item *models.PageItem) error {
	if item.Config == "" {
		item.Config = "{}"
	}
	return s.repo.UpdateItem(item)
}

func (s *Service) DeleteItem(id int64) error {
	return s.repo.DeleteItem(id)
}

func (s *Service) ReorderItems(sectionID int64, ids []int64) error {
	return s.repo.ReorderItems(sectionID, ids)
}
