package page

import (
	"database/sql"

	"github.com/skaia/backend/models"
)

type sqlRepository struct{ db *sql.DB }

// NewRepository returns a Repository backed by Postgres.
func NewRepository(db *sql.DB) Repository { return &sqlRepository{db: db} }

// ── reads ───────────────────────────────────────────────────────────────────

func (r *sqlRepository) GetBySlug(slug string) (*models.Page, error) {
	p := &models.Page{}
	err := r.db.QueryRow(
		`SELECT id, slug, title, description, is_index, content::text,
		        created_at, updated_at
		 FROM pages WHERE slug = $1`, slug,
	).Scan(&p.ID, &p.Slug, &p.Title, &p.Description, &p.IsIndex,
		&p.Content, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (r *sqlRepository) GetIndex() (*models.Page, error) {
	p := &models.Page{}
	err := r.db.QueryRow(
		`SELECT id, slug, title, description, is_index, content::text,
		        created_at, updated_at
		 FROM pages WHERE is_index = TRUE LIMIT 1`,
	).Scan(&p.ID, &p.Slug, &p.Title, &p.Description, &p.IsIndex,
		&p.Content, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (r *sqlRepository) GetByID(id int64) (*models.Page, error) {
	p := &models.Page{}
	err := r.db.QueryRow(
		`SELECT id, slug, title, description, is_index, content::text,
		        created_at, updated_at
		 FROM pages WHERE id = $1`, id,
	).Scan(&p.ID, &p.Slug, &p.Title, &p.Description, &p.IsIndex,
		&p.Content, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (r *sqlRepository) List() ([]*models.Page, error) {
	rows, err := r.db.Query(
		`SELECT id, slug, title, description, is_index, content::text,
		        created_at, updated_at
		 FROM pages ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pages []*models.Page
	for rows.Next() {
		p := &models.Page{}
		if err := rows.Scan(&p.ID, &p.Slug, &p.Title, &p.Description,
			&p.IsIndex, &p.Content, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		pages = append(pages, p)
	}
	return pages, nil
}

// ── writes ──────────────────────────────────────────────────────────────────

func (r *sqlRepository) Create(p *models.Page) error {
	return r.db.QueryRow(
		`INSERT INTO pages (slug, title, description, is_index, content)
		 VALUES ($1, $2, $3, $4, $5::jsonb)
		 RETURNING id, created_at, updated_at`,
		p.Slug, p.Title, p.Description, p.IsIndex, p.Content,
	).Scan(&p.ID, &p.CreatedAt, &p.UpdatedAt)
}

func (r *sqlRepository) Update(p *models.Page) error {
	return r.db.QueryRow(
		`UPDATE pages
		 SET slug = $2, title = $3, description = $4, is_index = $5,
		     content = $6::jsonb, updated_at = CURRENT_TIMESTAMP
		 WHERE id = $1
		 RETURNING updated_at`,
		p.ID, p.Slug, p.Title, p.Description, p.IsIndex, p.Content,
	).Scan(&p.UpdatedAt)
}

func (r *sqlRepository) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM pages WHERE id = $1`, id)
	return err
}
