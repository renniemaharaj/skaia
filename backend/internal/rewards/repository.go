package rewards

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

type SQLRepository struct{ db *sql.DB }

func NewRepository(db *sql.DB) *SQLRepository { return &SQLRepository{db: db} }
func (r *SQLRepository) ProviderAdapter(ctx context.Context, key string) (string, error) {
	var adapter string
	err := r.db.QueryRowContext(ctx, `SELECT adapter_key FROM reward_event_providers WHERE key=$1 AND enabled`, key).Scan(&adapter)
	return adapter, err
}
func (r *SQLRepository) CreateProvider(ctx context.Context, actor int64, v CreateProviderRequest) (*Provider, error) {
	p := &Provider{}
	err := r.db.QueryRowContext(ctx, `INSERT INTO reward_event_providers(key,name,adapter_key,enabled,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,key,name,adapter_key,enabled`, v.Key, v.Name, v.AdapterKey, v.Enabled, actor).Scan(&p.ID, &p.Key, &p.Name, &p.AdapterKey, &p.Enabled)
	return p, err
}
func (r *SQLRepository) CreateRule(ctx context.Context, actor int64, v CreateRuleRequest) (*Rule, error) {
	rule := &Rule{}
	err := r.db.QueryRowContext(ctx, `INSERT INTO reward_rules(provider_id,event_type,version,points,enabled,created_by) SELECT id,$2,$3,$4,$5,$6 FROM reward_event_providers WHERE key=$1 RETURNING id,provider_id,event_type,version,points,enabled`, v.ProviderKey, v.EventType, v.Version, v.Points, v.Enabled, actor).Scan(&rule.ID, &rule.ProviderID, &rule.EventType, &rule.Version, &rule.Points, &rule.Enabled)
	return rule, err
}
func (r *SQLRepository) CreateReward(ctx context.Context, actor int64, v CreateRewardRequest) (*Reward, error) {
	payload, err := json.Marshal(v.DeliveryPayload)
	if err != nil {
		return nil, ErrValidation
	}
	reward := &Reward{}
	err = r.db.QueryRowContext(ctx, `INSERT INTO reward_catalog(key,name,description,cost,delivery_adapter,delivery_payload,enabled,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,key,name,description,cost,delivery_adapter,delivery_payload,enabled`, v.Key, v.Name, v.Description, v.Cost, v.DeliveryAdapter, payload, v.Enabled, actor).Scan(&reward.ID, &reward.Key, &reward.Name, &reward.Description, &reward.Cost, &reward.DeliveryAdapter, &reward.DeliveryPayload, &reward.Enabled)
	return reward, err
}
func (r *SQLRepository) Ingest(ctx context.Context, provider string, eventHash, payloadHash []byte, event ProviderEvent) (*Grant, bool, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback()
	var providerID, ruleID, userID, points int64
	var version int
	err = tx.QueryRowContext(ctx, `SELECT p.id,r.id,r.version,r.points,l.user_id FROM reward_event_providers p JOIN reward_rules r ON r.provider_id=p.id AND r.event_type=$2 AND r.enabled JOIN external_identity_providers ip ON ip.key=p.key JOIN external_identity_links l ON l.provider_id=ip.id AND l.subject=$3 AND l.unlinked_at IS NULL WHERE p.key=$1 AND p.enabled`, provider, event.Type, event.Subject).Scan(&providerID, &ruleID, &version, &points, &userID)
	if err != nil {
		return nil, false, err
	}
	subjectHash := sha256Bytes([]byte(event.Subject))
	var eventID int64
	err = tx.QueryRowContext(ctx, `INSERT INTO reward_provider_events(provider_id,provider_event_hash,payload_hash,event_type,subject_hash,occurred_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(provider_id,provider_event_hash) DO NOTHING RETURNING id`, providerID, eventHash, payloadHash, event.Type, subjectHash, event.OccurredAt).Scan(&eventID)
	if errors.Is(err, sql.ErrNoRows) {
		var stored []byte
		if err = tx.QueryRowContext(ctx, `SELECT id,payload_hash FROM reward_provider_events WHERE provider_id=$1 AND provider_event_hash=$2`, providerID, eventHash).Scan(&eventID, &stored); err != nil {
			return nil, false, err
		}
		if !bytes.Equal(stored, payloadHash) {
			return nil, false, ErrConflict
		}
		grant := &Grant{}
		err = tx.QueryRowContext(ctx, `SELECT g.id,g.event_id,g.user_id,e.event_type,g.points,g.created_at FROM reward_grants g JOIN reward_provider_events e ON e.id=g.event_id WHERE g.event_id=$1`, eventID).Scan(&grant.ID, &grant.EventID, &grant.UserID, &grant.EventType, &grant.Points, &grant.CreatedAt)
		return grant, true, err
	}
	if err != nil {
		return nil, false, err
	}
	grant := &Grant{}
	err = tx.QueryRowContext(ctx, `INSERT INTO reward_grants(event_id,rule_id,rule_version,user_id,points) VALUES($1,$2,$3,$4,$5) RETURNING id,event_id,user_id,$6,points,created_at`, eventID, ruleID, version, userID, points, event.Type).Scan(&grant.ID, &grant.EventID, &grant.UserID, &grant.EventType, &grant.Points, &grant.CreatedAt)
	if err != nil {
		return nil, false, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO reward_ledger_entries(user_id,grant_id,delta) VALUES($1,$2,$3)`, userID, grant.ID, points); err != nil {
		return nil, false, err
	}
	return grant, false, tx.Commit()
}
func sha256Bytes(v []byte) []byte { h := sha256.Sum256(v); return h[:] }
func (r *SQLRepository) ListCatalog(ctx context.Context) ([]Reward, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,key,name,description,cost,delivery_adapter,delivery_payload,enabled FROM reward_catalog WHERE enabled ORDER BY cost,id LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Reward{}
	for rows.Next() {
		var v Reward
		if err = rows.Scan(&v.ID, &v.Key, &v.Name, &v.Description, &v.Cost, &v.DeliveryAdapter, &v.DeliveryPayload, &v.Enabled); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (r *SQLRepository) Account(ctx context.Context, userID int64, limit int) (Account, error) {
	out := Account{Grants: []Grant{}, Redemptions: []Redemption{}}
	if err := r.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(delta),0) FROM reward_ledger_entries WHERE user_id=$1`, userID).Scan(&out.Balance); err != nil {
		return out, err
	}
	rows, err := r.db.QueryContext(ctx, `SELECT g.id,g.event_id,g.user_id,e.event_type,g.points,g.created_at FROM reward_grants g JOIN reward_provider_events e ON e.id=g.event_id WHERE g.user_id=$1 ORDER BY g.id DESC LIMIT $2`, userID, limit)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var v Grant
		if err = rows.Scan(&v.ID, &v.EventID, &v.UserID, &v.EventType, &v.Points, &v.CreatedAt); err != nil {
			rows.Close()
			return out, err
		}
		out.Grants = append(out.Grants, v)
	}
	rows.Close()
	rows, err = r.db.QueryContext(ctx, `SELECT x.id,x.user_id,x.reward_id,c.name,x.cost,x.status,x.created_at,x.updated_at FROM reward_redemptions x JOIN reward_catalog c ON c.id=x.reward_id WHERE x.user_id=$1 ORDER BY x.id DESC LIMIT $2`, userID, limit)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var v Redemption
		if err = rows.Scan(&v.ID, &v.UserID, &v.RewardID, &v.RewardName, &v.Cost, &v.Status, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return out, err
		}
		out.Redemptions = append(out.Redemptions, v)
	}
	return out, rows.Err()
}
func (r *SQLRepository) Redeem(ctx context.Context, userID, rewardID int64, keyHash, requestHash []byte) (*Redemption, bool, error) {
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock($1)`, userID); err != nil {
		return nil, false, err
	}
	var existing Redemption
	var stored []byte
	err = tx.QueryRowContext(ctx, `SELECT x.id,x.user_id,x.reward_id,c.name,x.cost,x.status,x.created_at,x.updated_at,x.request_hash FROM reward_redemptions x JOIN reward_catalog c ON c.id=x.reward_id WHERE x.user_id=$1 AND x.idempotency_hash=$2 FOR UPDATE`, userID, keyHash).Scan(&existing.ID, &existing.UserID, &existing.RewardID, &existing.RewardName, &existing.Cost, &existing.Status, &existing.CreatedAt, &existing.UpdatedAt, &stored)
	if err == nil {
		if !bytes.Equal(stored, requestHash) {
			return nil, false, ErrConflict
		}
		return &existing, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	var reward Reward
	if err = tx.QueryRowContext(ctx, `SELECT id,name,cost,delivery_adapter,delivery_payload FROM reward_catalog WHERE id=$1 AND enabled FOR SHARE`, rewardID).Scan(&reward.ID, &reward.Name, &reward.Cost, &reward.DeliveryAdapter, &reward.DeliveryPayload); err != nil {
		return nil, false, err
	}
	var balance int64
	if err = tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(delta),0) FROM reward_ledger_entries WHERE user_id=$1`, userID).Scan(&balance); err != nil {
		return nil, false, err
	}
	if balance < reward.Cost {
		return nil, false, ErrInsufficient
	}
	v := &Redemption{}
	err = tx.QueryRowContext(ctx, `INSERT INTO reward_redemptions(user_id,reward_id,idempotency_hash,request_hash,cost) VALUES($1,$2,$3,$4,$5) RETURNING id,user_id,reward_id,$6,cost,status,created_at,updated_at`, userID, rewardID, keyHash, requestHash, reward.Cost, reward.Name).Scan(&v.ID, &v.UserID, &v.RewardID, &v.RewardName, &v.Cost, &v.Status, &v.CreatedAt, &v.UpdatedAt)
	if err != nil {
		return nil, false, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO reward_ledger_entries(user_id,redemption_id,delta) VALUES($1,$2,$3)`, userID, v.ID, -reward.Cost); err != nil {
		return nil, false, err
	}
	hash := sha256Bytes(reward.DeliveryPayload)
	if _, err = tx.ExecContext(ctx, `INSERT INTO reward_fulfilments(redemption_id,adapter_key,payload,payload_hash) VALUES($1,$2,$3,$4)`, v.ID, reward.DeliveryAdapter, reward.DeliveryPayload, hash); err != nil {
		return nil, false, err
	}
	return v, false, tx.Commit()
}
func (r *SQLRepository) Claim(ctx context.Context, owner string, lease time.Duration, limit int) ([]Fulfilment, error) {
	if owner == "" || len(owner) > 120 || lease <= 0 || limit < 1 || limit > 100 {
		return nil, ErrValidation
	}
	rows, err := r.db.QueryContext(ctx, `WITH candidates AS (SELECT id FROM reward_fulfilments WHERE attempts<8 AND available_at<=NOW() AND (status='pending' OR (status='leased' AND lease_expires_at<NOW())) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT $1) UPDATE reward_fulfilments f SET status='leased',attempts=attempts+1,lease_owner=$2,lease_expires_at=NOW()+($3*INTERVAL '1 millisecond'),updated_at=NOW() FROM candidates c WHERE f.id=c.id RETURNING f.id,f.redemption_id,f.adapter_key,f.payload,f.attempts`, limit, owner, lease.Milliseconds())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Fulfilment{}
	for rows.Next() {
		var v Fulfilment
		if err = rows.Scan(&v.ID, &v.RedemptionID, &v.AdapterKey, &v.Payload, &v.Attempts); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (r *SQLRepository) Complete(ctx context.Context, id int64, owner string, success bool, reason string, retry time.Duration) error {
	status := "pending"
	if success {
		status = "succeeded"
	} else if retry <= 0 {
		status = "failed"
	}
	res, err := r.db.ExecContext(ctx, `WITH updated AS (UPDATE reward_fulfilments SET status=CASE WHEN $3='pending' AND attempts>=8 THEN 'failed' ELSE $3 END,available_at=NOW()+($4*INTERVAL '1 millisecond'),lease_owner=NULL,lease_expires_at=NULL,last_error=NULLIF($5,''),delivered_at=CASE WHEN $3='succeeded' THEN NOW() ELSE delivered_at END,updated_at=NOW() WHERE id=$1 AND status='leased' AND lease_owner=$2 AND lease_expires_at>NOW() RETURNING redemption_id,status) UPDATE reward_redemptions x SET status=updated.status,updated_at=NOW() FROM updated WHERE x.id=updated.redemption_id`, id, owner, status, retry.Milliseconds(), truncate(reason, 500))
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		return errors.New("reward fulfilment lease is no longer owned")
	}
	return nil
}
func truncate(v string, n int) string {
	if len(v) > n {
		return v[:n]
	}
	return v
}
func (r *SQLRepository) Retry(ctx context.Context, redemptionID int64) error {
	res, err := r.db.ExecContext(ctx, `UPDATE reward_fulfilments SET status='pending',attempts=0,available_at=NOW(),lease_owner=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=NOW() WHERE redemption_id=$1 AND status='failed'`, redemptionID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		return ErrValidation
	}
	_, err = r.db.ExecContext(ctx, `UPDATE reward_redemptions SET status='pending',updated_at=NOW() WHERE id=$1`, redemptionID)
	return err
}
