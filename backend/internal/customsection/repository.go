package customsection

import (
	"database/sql"

	"github.com/skaia/backend/models"
)

type sqlRepository struct{ db *sql.DB }

// NewRepository returns a Repository backed by Postgres.
func NewRepository(db *sql.DB) Repository { return &sqlRepository{db: db} }

const selectCols = `id, name, description, datasource_id, section_type, config, created_by, created_at, updated_at`

func (r *sqlRepository) scan(row interface{ Scan(...any) error }) (*models.CustomSection, error) {
	cs := &models.CustomSection{}
	var createdBy sql.NullInt64
	err := row.Scan(&cs.ID, &cs.Name, &cs.Description, &cs.DataSourceID,
		&cs.SectionType, &cs.Config, &createdBy, &cs.CreatedAt, &cs.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if createdBy.Valid {
		cs.CreatedBy = &createdBy.Int64
	}
	return cs, nil
}

func (r *sqlRepository) GetByID(id int64) (*models.CustomSection, error) {
	return r.scan(r.db.QueryRow(
		`SELECT `+selectCols+` FROM custom_sections WHERE id = $1`, id))
}

func (r *sqlRepository) List() ([]*models.CustomSection, error) {
	rows, err := r.db.Query(
		`SELECT ` + selectCols + ` FROM custom_sections ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return r.collectRows(rows)
}

func (r *sqlRepository) ListByDataSource(datasourceID int64) ([]*models.CustomSection, error) {
	rows, err := r.db.Query(
		`SELECT `+selectCols+` FROM custom_sections WHERE datasource_id = $1 ORDER BY created_at DESC`,
		datasourceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return r.collectRows(rows)
}

func (r *sqlRepository) collectRows(rows *sql.Rows) ([]*models.CustomSection, error) {
	var list []*models.CustomSection
	for rows.Next() {
		cs, err := r.scan(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, cs)
	}
	return list, rows.Err()
}

func (r *sqlRepository) Create(cs *models.CustomSection) error {
	return r.db.QueryRow(
		`INSERT INTO custom_sections (name, description, datasource_id, section_type, config, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, created_at, updated_at`,
		cs.Name, cs.Description, cs.DataSourceID, cs.SectionType, cs.Config,
		sql.NullInt64{Int64: ptrVal(cs.CreatedBy), Valid: cs.CreatedBy != nil},
	).Scan(&cs.ID, &cs.CreatedAt, &cs.UpdatedAt)
}

func (r *sqlRepository) Update(cs *models.CustomSection) error {
	_, err := r.db.Exec(
		`UPDATE custom_sections SET name = $1, description = $2, datasource_id = $3,
		        section_type = $4, config = $5, updated_at = NOW()
		 WHERE id = $6`,
		cs.Name, cs.Description, cs.DataSourceID, cs.SectionType, cs.Config, cs.ID,
	)
	return err
}

func (r *sqlRepository) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM custom_sections WHERE id = $1`, id)
	return err
}

func ptrVal(p *int64) int64 {
	if p == nil {
		return 0
	}
	return *p
}
