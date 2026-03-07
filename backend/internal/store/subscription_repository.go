package store

import (
	"database/sql"
	"errors"

	"github.com/skaia/backend/models"
)

// Subscription plan repository

type sqlSubscriptionPlanRepository struct{ db *sql.DB }

func NewSubscriptionPlanRepository(db *sql.DB) SubscriptionPlanRepository {
	return &sqlSubscriptionPlanRepository{db: db}
}

func (r *sqlSubscriptionPlanRepository) Create(plan *models.SubscriptionPlan) (*models.SubscriptionPlan, error) {
	err := r.db.QueryRow(
		`INSERT INTO subscription_plans (name, description, price_cents, currency, interval_unit, interval_count, trial_days, stripe_price_id, is_active)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, name, description, price_cents, currency, interval_unit, interval_count, trial_days, stripe_price_id, is_active, created_at, updated_at`,
		plan.Name, plan.Description, plan.PriceCents, plan.Currency, plan.IntervalUnit, plan.IntervalCount, plan.TrialDays, plan.StripePriceID, plan.IsActive,
	).Scan(&plan.ID, &plan.Name, &plan.Description, &plan.PriceCents, &plan.Currency, &plan.IntervalUnit, &plan.IntervalCount, &plan.TrialDays, &plan.StripePriceID, &plan.IsActive, &plan.CreatedAt, &plan.UpdatedAt)
	return plan, err
}

func (r *sqlSubscriptionPlanRepository) GetByID(id int64) (*models.SubscriptionPlan, error) {
	plan := &models.SubscriptionPlan{}
	err := r.db.QueryRow(
		`SELECT id, name, description, price_cents, currency, interval_unit, interval_count, trial_days, stripe_price_id, is_active, created_at, updated_at
		 FROM subscription_plans WHERE id = $1`, id,
	).Scan(&plan.ID, &plan.Name, &plan.Description, &plan.PriceCents, &plan.Currency, &plan.IntervalUnit, &plan.IntervalCount, &plan.TrialDays, &plan.StripePriceID, &plan.IsActive, &plan.CreatedAt, &plan.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("subscription plan not found")
	}
	return plan, err
}

func (r *sqlSubscriptionPlanRepository) Update(plan *models.SubscriptionPlan) (*models.SubscriptionPlan, error) {
	err := r.db.QueryRow(
		`UPDATE subscription_plans SET name=$1, description=$2, price_cents=$3, currency=$4, interval_unit=$5, interval_count=$6, trial_days=$7, stripe_price_id=$8, is_active=$9, updated_at=CURRENT_TIMESTAMP
		 WHERE id=$10
		 RETURNING id, name, description, price_cents, currency, interval_unit, interval_count, trial_days, stripe_price_id, is_active, created_at, updated_at`,
		plan.Name, plan.Description, plan.PriceCents, plan.Currency, plan.IntervalUnit, plan.IntervalCount, plan.TrialDays, plan.StripePriceID, plan.IsActive, plan.ID,
	).Scan(&plan.ID, &plan.Name, &plan.Description, &plan.PriceCents, &plan.Currency, &plan.IntervalUnit, &plan.IntervalCount, &plan.TrialDays, &plan.StripePriceID, &plan.IsActive, &plan.CreatedAt, &plan.UpdatedAt)
	return plan, err
}

func (r *sqlSubscriptionPlanRepository) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM subscription_plans WHERE id = $1`, id)
	return err
}

func (r *sqlSubscriptionPlanRepository) List() ([]*models.SubscriptionPlan, error) {
	rows, err := r.db.Query(
		`SELECT id, name, description, price_cents, currency, interval_unit, interval_count, trial_days, stripe_price_id, is_active, created_at, updated_at
		 FROM subscription_plans WHERE is_active = true ORDER BY price_cents ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var plans []*models.SubscriptionPlan
	for rows.Next() {
		p := &models.SubscriptionPlan{}
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.PriceCents, &p.Currency, &p.IntervalUnit, &p.IntervalCount, &p.TrialDays, &p.StripePriceID, &p.IsActive, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		plans = append(plans, p)
	}
	return plans, rows.Err()
}

// Subscription repository

type sqlSubscriptionRepository struct{ db *sql.DB }

func NewSubscriptionRepository(db *sql.DB) SubscriptionRepository {
	return &sqlSubscriptionRepository{db: db}
}

func (r *sqlSubscriptionRepository) Create(s *models.Subscription) (*models.Subscription, error) {
	err := r.db.QueryRow(
		`INSERT INTO subscriptions (user_id, plan_id, provider, provider_subscription_id, provider_customer_id, status, current_period_start, current_period_end, cancel_at_period_end)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, user_id, plan_id, provider, provider_subscription_id, provider_customer_id, status, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, created_at, updated_at`,
		s.UserID, s.PlanID, s.Provider, s.ProviderSubscriptionID, s.ProviderCustomerID, s.Status, s.CurrentPeriodStart, s.CurrentPeriodEnd, s.CancelAtPeriodEnd,
	).Scan(&s.ID, &s.UserID, &s.PlanID, &s.Provider, &s.ProviderSubscriptionID, &s.ProviderCustomerID, &s.Status, &s.CurrentPeriodStart, &s.CurrentPeriodEnd, &s.CancelAtPeriodEnd, &s.CancelledAt, &s.CreatedAt, &s.UpdatedAt)
	return s, err
}

func (r *sqlSubscriptionRepository) GetByID(id int64) (*models.Subscription, error) {
	s := &models.Subscription{}
	err := r.db.QueryRow(
		`SELECT id, user_id, plan_id, provider, provider_subscription_id, provider_customer_id, status, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, created_at, updated_at
		 FROM subscriptions WHERE id = $1`, id,
	).Scan(&s.ID, &s.UserID, &s.PlanID, &s.Provider, &s.ProviderSubscriptionID, &s.ProviderCustomerID, &s.Status, &s.CurrentPeriodStart, &s.CurrentPeriodEnd, &s.CancelAtPeriodEnd, &s.CancelledAt, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("subscription not found")
	}
	return s, err
}

func (r *sqlSubscriptionRepository) GetByUserID(userID int64) (*models.Subscription, error) {
	s := &models.Subscription{}
	err := r.db.QueryRow(
		`SELECT id, user_id, plan_id, provider, provider_subscription_id, provider_customer_id, status, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, created_at, updated_at
		 FROM subscriptions WHERE user_id = $1 AND status IN ('active','trialing','past_due')
		 ORDER BY created_at DESC LIMIT 1`, userID,
	).Scan(&s.ID, &s.UserID, &s.PlanID, &s.Provider, &s.ProviderSubscriptionID, &s.ProviderCustomerID, &s.Status, &s.CurrentPeriodStart, &s.CurrentPeriodEnd, &s.CancelAtPeriodEnd, &s.CancelledAt, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return s, err
}

func (r *sqlSubscriptionRepository) GetByProviderID(providerSubID string) (*models.Subscription, error) {
	s := &models.Subscription{}
	err := r.db.QueryRow(
		`SELECT id, user_id, plan_id, provider, provider_subscription_id, provider_customer_id, status, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, created_at, updated_at
		 FROM subscriptions WHERE provider_subscription_id = $1`, providerSubID,
	).Scan(&s.ID, &s.UserID, &s.PlanID, &s.Provider, &s.ProviderSubscriptionID, &s.ProviderCustomerID, &s.Status, &s.CurrentPeriodStart, &s.CurrentPeriodEnd, &s.CancelAtPeriodEnd, &s.CancelledAt, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("subscription not found")
	}
	return s, err
}

func (r *sqlSubscriptionRepository) Update(s *models.Subscription) (*models.Subscription, error) {
	err := r.db.QueryRow(
		`UPDATE subscriptions SET status=$1, current_period_start=$2, current_period_end=$3, cancel_at_period_end=$4, cancelled_at=$5, updated_at=CURRENT_TIMESTAMP
		 WHERE id=$6
		 RETURNING id, user_id, plan_id, provider, provider_subscription_id, provider_customer_id, status, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, created_at, updated_at`,
		s.Status, s.CurrentPeriodStart, s.CurrentPeriodEnd, s.CancelAtPeriodEnd, s.CancelledAt, s.ID,
	).Scan(&s.ID, &s.UserID, &s.PlanID, &s.Provider, &s.ProviderSubscriptionID, &s.ProviderCustomerID, &s.Status, &s.CurrentPeriodStart, &s.CurrentPeriodEnd, &s.CancelAtPeriodEnd, &s.CancelledAt, &s.CreatedAt, &s.UpdatedAt)
	return s, err
}

func (r *sqlSubscriptionRepository) ListByUser(userID int64) ([]*models.Subscription, error) {
	rows, err := r.db.Query(
		`SELECT id, user_id, plan_id, provider, provider_subscription_id, provider_customer_id, status, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, created_at, updated_at
		 FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC`, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subs []*models.Subscription
	for rows.Next() {
		s := &models.Subscription{}
		if err := rows.Scan(&s.ID, &s.UserID, &s.PlanID, &s.Provider, &s.ProviderSubscriptionID, &s.ProviderCustomerID, &s.Status, &s.CurrentPeriodStart, &s.CurrentPeriodEnd, &s.CancelAtPeriodEnd, &s.CancelledAt, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		subs = append(subs, s)
	}
	return subs, rows.Err()
}
