package rankings

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

type SQLRepository struct{ db *sql.DB }

func NewRepository(db *sql.DB) *SQLRepository { return &SQLRepository{db: db} }

const datasetCols = `id,key,name,description,metric_label,direction,tie_rule,visibility,enabled`

func scanDataset(row interface{ Scan(...any) error }) (*Dataset, error) {
	v := &Dataset{}
	err := row.Scan(&v.ID, &v.Key, &v.Name, &v.Description, &v.MetricLabel, &v.Direction, &v.TieRule, &v.Visibility, &v.Enabled)
	return v, err
}
func scanSeason(row interface{ Scan(...any) error }) (*Season, error) {
	v := &Season{}
	err := row.Scan(&v.ID, &v.DatasetID, &v.Key, &v.Name, &v.StartsAt, &v.EndsAt, &v.ClosedAt)
	return v, err
}
func (r *SQLRepository) CreateDataset(ctx context.Context, id int64, v CreateDatasetRequest) (*Dataset, error) {
	return scanDataset(r.db.QueryRowContext(ctx, `INSERT INTO ranked_datasets(key,name,description,metric_label,direction,tie_rule,visibility,enabled,created_by)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)RETURNING `+datasetCols, v.Key, v.Name, v.Description, v.MetricLabel, v.Direction, v.TieRule, v.Visibility, v.Enabled, id))
}
func (r *SQLRepository) CreateSeason(ctx context.Context, id int64, dataset string, v CreateSeasonRequest) (*Season, error) {
	return scanSeason(r.db.QueryRowContext(ctx, `INSERT INTO ranked_seasons(dataset_id,key,name,starts_at,ends_at,created_by)SELECT id,$2,$3,$4,$5,$6 FROM ranked_datasets WHERE key=$1 RETURNING id,dataset_id,key,name,starts_at,ends_at,closed_at`, dataset, v.Key, v.Name, v.StartsAt, v.EndsAt, id))
}
func (r *SQLRepository) CloseSeason(ctx context.Context, dataset, season string) (*Season, error) {
	return scanSeason(r.db.QueryRowContext(ctx, `UPDATE ranked_seasons s SET closed_at=NOW() FROM ranked_datasets d WHERE s.dataset_id=d.id AND d.key=$1 AND s.key=$2 AND s.closed_at IS NULL RETURNING s.id,s.dataset_id,s.key,s.name,s.starts_at,s.ends_at,s.closed_at`, dataset, season))
}
func (r *SQLRepository) ListDatasets(ctx context.Context, member bool) ([]Dataset, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+datasetCols+` FROM ranked_datasets WHERE enabled AND (visibility='public' OR ($1 AND visibility='members')) ORDER BY name,id LIMIT 100`, member)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Dataset{}
	for rows.Next() {
		v, err := scanDataset(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *v)
	}
	return out, rows.Err()
}
func (r *SQLRepository) ListSeasons(ctx context.Context, dataset string, member bool) ([]Season, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT s.id,s.dataset_id,s.key,s.name,s.starts_at,s.ends_at,s.closed_at FROM ranked_seasons s JOIN ranked_datasets d ON d.id=s.dataset_id WHERE d.key=$1 AND d.enabled AND (d.visibility='public' OR ($2 AND d.visibility='members')) ORDER BY s.starts_at DESC,s.id DESC LIMIT 100`, dataset, member)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Season{}
	for rows.Next() {
		v, err := scanSeason(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *v)
	}
	return out, rows.Err()
}
func encodeCursor(score string, id int64) string {
	return base64.RawURLEncoding.EncodeToString([]byte(score + "|" + strconv.FormatInt(id, 10)))
}
func decodeCursor(v string) (string, int64, error) {
	if v == "" {
		return "", 0, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(v)
	if err != nil {
		return "", 0, ErrValidation
	}
	p := strings.Split(string(raw), "|")
	if len(p) != 2 {
		return "", 0, ErrValidation
	}
	id, err := strconv.ParseInt(p[1], 10, 64)
	return p[0], id, err
}
func (r *SQLRepository) Standings(ctx context.Context, datasetKey, seasonKey, cursor string, limit int, member bool) (Standings, error) {
	score, id, err := decodeCursor(cursor)
	if err != nil {
		return Standings{}, err
	}
	var out Standings
	d, err := scanDataset(r.db.QueryRowContext(ctx, `SELECT `+datasetCols+` FROM ranked_datasets WHERE key=$1 AND enabled AND (visibility='public' OR ($2 AND visibility='members'))`, datasetKey, member))
	if err != nil {
		return out, err
	}
	out.Dataset = *d
	s, err := scanSeason(r.db.QueryRowContext(ctx, `SELECT id,dataset_id,key,name,starts_at,ends_at,closed_at FROM ranked_seasons WHERE dataset_id=$1 AND key=$2`, d.ID, seasonKey))
	if err != nil {
		return out, err
	}
	out.Season = *s
	rankFn := map[string]string{"competition": "RANK()", "dense": "DENSE_RANK()", "ordinal": "ROW_NUMBER()"}[d.TieRule]
	direction := "DESC"
	compare := "<"
	if d.Direction == "asc" {
		direction = "ASC"
		compare = ">"
	}
	query := fmt.Sprintf(`WITH visible AS (SELECT e.* FROM ranked_entries e LEFT JOIN users u ON e.subject_type='user' AND u.id::text=e.subject_key WHERE e.season_id=$1 AND e.public AND (e.subject_type<>'user' OR u.deleted_at IS NULL)), ranked AS (SELECT *,%s OVER(ORDER BY score %s) AS position FROM visible) SELECT id,position,subject_type,CASE WHEN subject_type='external' THEN '' ELSE subject_key END,display_name,score::text,updated_at FROM ranked WHERE ($2='' OR (score %s $2::numeric OR (score=$2::numeric AND id>$3))) ORDER BY score %s,id LIMIT $4`, rankFn, direction, compare, direction)
	rows, err := r.db.QueryContext(ctx, query, s.ID, score, id, limit+1)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var v Entry
		if err = rows.Scan(&v.ID, &v.Rank, &v.SubjectType, &v.SubjectKey, &v.DisplayName, &v.Score, &v.UpdatedAt); err != nil {
			return out, err
		}
		out.Entries = append(out.Entries, v)
	}
	if len(out.Entries) > limit {
		last := out.Entries[limit-1]
		out.NextCursor = encodeCursor(last.Score, last.ID)
		out.Entries = out.Entries[:limit]
	}
	return out, rows.Err()
}
func (r *SQLRepository) Ingest(ctx context.Context, producer int64, dataset string, eventHash, payloadHash []byte, v IngestRequest) (*Entry, bool, error) {
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback()
	var datasetID, seasonID int64
	var closed sql.NullTime
	if err = tx.QueryRowContext(ctx, `SELECT d.id,s.id,s.closed_at FROM ranked_datasets d JOIN ranked_seasons s ON s.dataset_id=d.id AND s.key=$2 WHERE d.key=$1 AND d.enabled FOR SHARE`, dataset, v.SeasonKey).Scan(&datasetID, &seasonID, &closed); err != nil {
		return nil, false, err
	}
	if closed.Valid {
		return nil, false, ErrClosed
	}
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock($1,$2)`, datasetID, seasonID); err != nil {
		return nil, false, err
	}
	var stored []byte
	var existingID int64
	err = tx.QueryRowContext(ctx, `SELECT entry_id,payload_hash FROM ranked_ingestions WHERE dataset_id=$1 AND event_hash=$2`, datasetID, eventHash).Scan(&existingID, &stored)
	if err == nil {
		if !bytes.Equal(stored, payloadHash) {
			return nil, false, ErrConflict
		}
		entry := &Entry{}
		err = tx.QueryRowContext(ctx, `SELECT id,subject_type,subject_key,display_name,score::text,updated_at FROM ranked_entries WHERE id=$1`, existingID).Scan(&entry.ID, &entry.SubjectType, &entry.SubjectKey, &entry.DisplayName, &entry.Score, &entry.UpdatedAt)
		return entry, true, err
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	operation := "EXCLUDED.score"
	if v.Mode == "delta" {
		operation = "ranked_entries.score+EXCLUDED.score"
	}
	query := `INSERT INTO ranked_entries(dataset_id,season_id,subject_type,subject_key,display_name,public,score)VALUES($1,$2,$3,$4,$5,$6,$7::numeric) ON CONFLICT(season_id,subject_type,subject_key) DO UPDATE SET display_name=EXCLUDED.display_name,public=EXCLUDED.public,score=` + operation + `,updated_at=NOW() RETURNING id,subject_type,subject_key,display_name,score::text,updated_at`
	entry := &Entry{}
	if err = tx.QueryRowContext(ctx, query, datasetID, seasonID, v.SubjectType, v.SubjectKey, v.DisplayName, v.Public, v.Value).Scan(&entry.ID, &entry.SubjectType, &entry.SubjectKey, &entry.DisplayName, &entry.Score, &entry.UpdatedAt); err != nil {
		return nil, false, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO ranked_ingestions(dataset_id,season_id,producer_id,event_hash,payload_hash,entry_id)VALUES($1,$2,$3,$4,$5,$6)`, datasetID, seasonID, producer, eventHash, payloadHash, entry.ID); err != nil {
		return nil, false, err
	}
	return entry, false, tx.Commit()
}
