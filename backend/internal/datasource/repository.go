package datasource

import (
	"database/sql"

	"github.com/skaia/backend/models"
)

type sqlRepository struct{ db *sql.DB }

// NewRepository returns a Repository backed by Postgres.
func NewRepository(db *sql.DB) Repository { return &sqlRepository{db: db} }

func (r *sqlRepository) GetByID(id int64) (*models.DataSource, error) {
	ds := &models.DataSource{}
	var createdBy sql.NullInt64
	err := r.db.QueryRow(
		`SELECT id, name, description, code, created_by, created_at, updated_at
		 FROM data_sources WHERE id = $1`, id,
	).Scan(&ds.ID, &ds.Name, &ds.Description, &ds.Code, &createdBy, &ds.CreatedAt, &ds.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if createdBy.Valid {
		ds.CreatedBy = &createdBy.Int64
	}
	return ds, nil
}

func (r *sqlRepository) List() ([]*models.DataSource, error) {
	rows, err := r.db.Query(
		`SELECT id, name, description, code, created_by, created_at, updated_at
		 FROM data_sources ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*models.DataSource
	for rows.Next() {
		ds := &models.DataSource{}
		var createdBy sql.NullInt64
		if err := rows.Scan(&ds.ID, &ds.Name, &ds.Description, &ds.Code, &createdBy, &ds.CreatedAt, &ds.UpdatedAt); err != nil {
			return nil, err
		}
		if createdBy.Valid {
			ds.CreatedBy = &createdBy.Int64
		}
		list = append(list, ds)
	}
	return list, rows.Err()
}

func (r *sqlRepository) Create(ds *models.DataSource) error {
	return r.db.QueryRow(
		`INSERT INTO data_sources (name, description, code, created_by)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, created_at, updated_at`,
		ds.Name, ds.Description, ds.Code, sql.NullInt64{Int64: ptrVal(ds.CreatedBy), Valid: ds.CreatedBy != nil},
	).Scan(&ds.ID, &ds.CreatedAt, &ds.UpdatedAt)
}

func (r *sqlRepository) Update(ds *models.DataSource) error {
	_, err := r.db.Exec(
		`UPDATE data_sources SET name = $1, description = $2, code = $3, updated_at = NOW()
		 WHERE id = $4`,
		ds.Name, ds.Description, ds.Code, ds.ID,
	)
	return err
}

func (r *sqlRepository) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM data_sources WHERE id = $1`, id)
	return err
}

func ptrVal(p *int64) int64 {
	if p == nil {
		return 0
	}
	return *p
}
