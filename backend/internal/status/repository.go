package status

import (
	"context"
	"database/sql"
	"encoding/json"
)

type SQLRepository struct{ db *sql.DB }

func NewRepository(db *sql.DB) *SQLRepository { return &SQLRepository{db: db} }

const incidentColumns = `id, title, summary, state, severity, component, started_at, resolved_at, created_at, updated_at`

func scanIncident(scanner interface{ Scan(...any) error }) (*Incident, error) {
	var incident Incident
	if err := scanner.Scan(&incident.ID, &incident.Title, &incident.Summary, &incident.State, &incident.Severity, &incident.Component, &incident.StartedAt, &incident.ResolvedAt, &incident.CreatedAt, &incident.UpdatedAt); err != nil {
		return nil, err
	}
	return &incident, nil
}

func (r *SQLRepository) ListPublic(ctx context.Context, limit int) ([]Incident, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+incidentColumns+` FROM service_incidents WHERE state <> 'draft' ORDER BY started_at DESC, id DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	incidents := make([]Incident, 0)
	for rows.Next() {
		incident, err := scanIncident(rows)
		if err != nil {
			return nil, err
		}
		incidents = append(incidents, *incident)
	}
	return incidents, rows.Err()
}

func (r *SQLRepository) Create(ctx context.Context, actorID int64, incident Incident) (*Incident, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	created, err := scanIncident(tx.QueryRowContext(ctx, `INSERT INTO service_incidents (title, summary, state, severity, component, started_at, resolved_at, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING `+incidentColumns, incident.Title, incident.Summary, incident.State, incident.Severity, incident.Component, incident.StartedAt, incident.ResolvedAt, actorID))
	if err != nil {
		return nil, err
	}
	if err := insertIncidentAudit(ctx, tx, actorID, created.ID, "create", nil, created); err != nil {
		return nil, err
	}
	return created, tx.Commit()
}

func (r *SQLRepository) Update(ctx context.Context, actorID, incidentID int64, incident Incident) (*Incident, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	before, err := scanIncident(tx.QueryRowContext(ctx, `SELECT `+incidentColumns+` FROM service_incidents WHERE id=$1 FOR UPDATE`, incidentID))
	if err != nil {
		return nil, err
	}
	updated, err := scanIncident(tx.QueryRowContext(ctx, `UPDATE service_incidents SET title=$1, summary=$2, state=$3, severity=$4, component=$5, started_at=$6, resolved_at=$7, updated_by=$8, updated_at=NOW() WHERE id=$9 RETURNING `+incidentColumns, incident.Title, incident.Summary, incident.State, incident.Severity, incident.Component, incident.StartedAt, incident.ResolvedAt, actorID, incidentID))
	if err != nil {
		return nil, err
	}
	if err := insertIncidentAudit(ctx, tx, actorID, incidentID, "update", before, updated); err != nil {
		return nil, err
	}
	return updated, tx.Commit()
}

func insertIncidentAudit(ctx context.Context, tx *sql.Tx, actorID, incidentID int64, action string, before, after *Incident) error {
	beforeJSON, _ := json.Marshal(before)
	afterJSON, _ := json.Marshal(after)
	_, err := tx.ExecContext(ctx, `INSERT INTO service_incident_events (incident_id, actor_id, action, before_state, after_state) VALUES ($1,$2,$3,$4,$5)`, incidentID, actorID, action, beforeJSON, afterJSON)
	return err
}
