package datasource

import (
	"database/sql"
	"encoding/json"

	"github.com/skaia/backend/models"
)

type sqlRepository struct{ db *sql.DB }

// NewRepository returns a Repository backed by Postgres.
func NewRepository(db *sql.DB) Repository { return &sqlRepository{db: db} }

func (r *sqlRepository) GetByID(id int64) (*models.DataSource, error) {
	ds := &models.DataSource{}
	var createdBy sql.NullInt64
	var filesRaw []byte
	err := r.db.QueryRow(
		`SELECT id, name, description, code, files, env_data, cache_ttl, created_by, created_at, updated_at
		 FROM data_sources WHERE id = $1`, id,
	).Scan(&ds.ID, &ds.Name, &ds.Description, &ds.Code, &filesRaw, &ds.EnvData, &ds.CacheTTL, &createdBy, &ds.CreatedAt, &ds.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if createdBy.Valid {
		ds.CreatedBy = &createdBy.Int64
	}
	ds.Files = normalizeFiles(filesRaw, ds.Code)
	return ds, nil
}

func (r *sqlRepository) List() ([]*models.DataSource, error) {
	rows, err := r.db.Query(
		`SELECT id, name, description, code, files, env_data, cache_ttl, created_by, created_at, updated_at
		 FROM data_sources ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*models.DataSource
	for rows.Next() {
		ds := &models.DataSource{}
		var createdBy sql.NullInt64
		var filesRaw []byte
		if err := rows.Scan(&ds.ID, &ds.Name, &ds.Description, &ds.Code, &filesRaw, &ds.EnvData, &ds.CacheTTL, &createdBy, &ds.CreatedAt, &ds.UpdatedAt); err != nil {
			return nil, err
		}
		if createdBy.Valid {
			ds.CreatedBy = &createdBy.Int64
		}
		ds.Files = normalizeFiles(filesRaw, ds.Code)
		list = append(list, ds)
	}
	return list, rows.Err()
}

func (r *sqlRepository) Create(ds *models.DataSource) error {
	syncCodeFromFiles(ds)
	return r.db.QueryRow(
		`INSERT INTO data_sources (name, description, code, files, cache_ttl, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, created_at, updated_at`,
		ds.Name, ds.Description, ds.Code, ds.Files, ds.CacheTTL, sql.NullInt64{Int64: ptrVal(ds.CreatedBy), Valid: ds.CreatedBy != nil},
	).Scan(&ds.ID, &ds.CreatedAt, &ds.UpdatedAt)
}

func (r *sqlRepository) Update(ds *models.DataSource) error {
	syncCodeFromFiles(ds)
	_, err := r.db.Exec(
		`UPDATE data_sources SET name = $1, description = $2, code = $3, files = $4, cache_ttl = $5, updated_at = NOW()
		 WHERE id = $6`,
		ds.Name, ds.Description, ds.Code, ds.Files, ds.CacheTTL, ds.ID,
	)
	return err
}

func (r *sqlRepository) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM data_sources WHERE id = $1`, id)
	return err
}

func (r *sqlRepository) GetEnvData(id int64) (string, error) {
	var envData string
	err := r.db.QueryRow(`SELECT env_data FROM data_sources WHERE id = $1`, id).Scan(&envData)
	return envData, err
}

func (r *sqlRepository) UpdateEnvData(id int64, envData string) error {
	_, err := r.db.Exec(
		`UPDATE data_sources SET env_data = $1, updated_at = NOW() WHERE id = $2`,
		envData, id)
	return err
}

func ptrVal(p *int64) int64 {
	if p == nil {
		return 0
	}
	return *p
}

// normalizeFiles ensures legacy datasources (files={} but code!="") get a
// synthetic files map with main.ts.
func normalizeFiles(raw []byte, code string) json.RawMessage {
	if len(raw) > 2 { // not empty "{}"
		return json.RawMessage(raw)
	}
	if code != "" {
		b, _ := json.Marshal(map[string]string{"main.ts": code})
		return json.RawMessage(b)
	}
	return json.RawMessage(`{}`)
}

// syncCodeFromFiles keeps the legacy `code` column in sync with main.ts.
func syncCodeFromFiles(ds *models.DataSource) {
	if len(ds.Files) > 2 {
		var m map[string]string
		if json.Unmarshal(ds.Files, &m) == nil {
			if main, ok := m["main.ts"]; ok {
				ds.Code = main
			}
		}
	}
	if ds.Files == nil || len(ds.Files) == 0 {
		ds.Files = json.RawMessage(`{}`)
	}
}
