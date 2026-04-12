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
	var ownerID sql.NullInt64
	err := r.db.QueryRow(
		`SELECT id, slug, title, description, is_index, content::text,
		        owner_id, created_at, updated_at
		 FROM pages WHERE slug = $1`, slug,
	).Scan(&p.ID, &p.Slug, &p.Title, &p.Description, &p.IsIndex,
		&p.Content, &ownerID, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if ownerID.Valid {
		p.OwnerID = &ownerID.Int64
	}
	return p, nil
}

func (r *sqlRepository) GetIndex() (*models.Page, error) {
	p := &models.Page{}
	var ownerID sql.NullInt64
	err := r.db.QueryRow(
		`SELECT id, slug, title, description, is_index, content::text,
		        owner_id, created_at, updated_at
		 FROM pages WHERE is_index = TRUE LIMIT 1`,
	).Scan(&p.ID, &p.Slug, &p.Title, &p.Description, &p.IsIndex,
		&p.Content, &ownerID, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if ownerID.Valid {
		p.OwnerID = &ownerID.Int64
	}
	return p, nil
}

func (r *sqlRepository) GetByID(id int64) (*models.Page, error) {
	p := &models.Page{}
	var ownerID sql.NullInt64
	err := r.db.QueryRow(
		`SELECT id, slug, title, description, is_index, content::text,
		        owner_id, created_at, updated_at
		 FROM pages WHERE id = $1`, id,
	).Scan(&p.ID, &p.Slug, &p.Title, &p.Description, &p.IsIndex,
		&p.Content, &ownerID, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if ownerID.Valid {
		p.OwnerID = &ownerID.Int64
	}
	return p, nil
}

func (r *sqlRepository) List() ([]*models.Page, error) {
	rows, err := r.db.Query(
		`SELECT id, slug, title, description, is_index, content::text,
		        owner_id, created_at, updated_at
		 FROM pages ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pages []*models.Page
	for rows.Next() {
		p := &models.Page{}
		var ownerID sql.NullInt64
		if err := rows.Scan(&p.ID, &p.Slug, &p.Title, &p.Description,
			&p.IsIndex, &p.Content, &ownerID, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		if ownerID.Valid {
			p.OwnerID = &ownerID.Int64
		}
		pages = append(pages, p)
	}
	return pages, nil
}

// ── writes ──────────────────────────────────────────────────────────────────

func (r *sqlRepository) Create(p *models.Page) error {
	return r.db.QueryRow(
		`INSERT INTO pages (slug, title, description, is_index, content, owner_id)
		 VALUES ($1, $2, $3, $4, $5::jsonb, $6)
		 RETURNING id, created_at, updated_at`,
		p.Slug, p.Title, p.Description, p.IsIndex, p.Content, p.OwnerID,
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

// ── ownership & editors ─────────────────────────────────────────────────────

func (r *sqlRepository) SetOwner(pageID, ownerID int64) error {
	_, err := r.db.Exec(`UPDATE pages SET owner_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, pageID, ownerID)
	return err
}

func (r *sqlRepository) ClearOwner(pageID int64) error {
	_, err := r.db.Exec(`UPDATE pages SET owner_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, pageID)
	return err
}

func (r *sqlRepository) AddEditor(pageID, userID, grantedBy int64) error {
	_, err := r.db.Exec(
		`INSERT INTO page_editors (page_id, user_id, granted_by) VALUES ($1, $2, $3) ON CONFLICT (page_id, user_id) DO NOTHING`,
		pageID, userID, grantedBy,
	)
	return err
}

func (r *sqlRepository) RemoveEditor(pageID, userID int64) error {
	_, err := r.db.Exec(`DELETE FROM page_editors WHERE page_id = $1 AND user_id = $2`, pageID, userID)
	return err
}

func (r *sqlRepository) GetEditors(pageID int64) ([]*models.PageUser, error) {
	rows, err := r.db.Query(
		`SELECT u.id, u.username, u.display_name, COALESCE(u.avatar_url, '')
		 FROM page_editors pe JOIN users u ON u.id = pe.user_id
		 WHERE pe.page_id = $1 ORDER BY pe.granted_at`, pageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var users []*models.PageUser
	for rows.Next() {
		u := &models.PageUser{}
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (r *sqlRepository) GetOwner(pageID int64) (*models.PageUser, error) {
	u := &models.PageUser{}
	err := r.db.QueryRow(
		`SELECT u.id, u.username, u.display_name, COALESCE(u.avatar_url, '')
		 FROM pages p JOIN users u ON u.id = p.owner_id
		 WHERE p.id = $1`, pageID,
	).Scan(&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL)
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (r *sqlRepository) IsEditor(pageID, userID int64) (bool, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM page_editors WHERE page_id = $1 AND user_id = $2`, pageID, userID,
	).Scan(&count)
	return count > 0, err
}

func (r *sqlRepository) ListWithOwnership() ([]*models.Page, error) {
	rows, err := r.db.Query(
		`SELECT p.id, p.slug, p.title, p.description, p.is_index, p.content::text,
		        p.owner_id, p.created_at, p.updated_at,
		        u.id, u.username, u.display_name, COALESCE(u.avatar_url, '')
		 FROM pages p
		 LEFT JOIN users u ON u.id = p.owner_id
		 ORDER BY p.updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pages []*models.Page
	for rows.Next() {
		p := &models.Page{}
		var ownerID sql.NullInt64
		var oID sql.NullInt64
		var oUsername, oDisplayName, oAvatar sql.NullString
		if err := rows.Scan(&p.ID, &p.Slug, &p.Title, &p.Description,
			&p.IsIndex, &p.Content, &ownerID, &p.CreatedAt, &p.UpdatedAt,
			&oID, &oUsername, &oDisplayName, &oAvatar); err != nil {
			return nil, err
		}
		if ownerID.Valid {
			p.OwnerID = &ownerID.Int64
		}
		if oID.Valid {
			p.Owner = &models.PageUser{
				ID:          oID.Int64,
				Username:    oUsername.String,
				DisplayName: oDisplayName.String,
				AvatarURL:   oAvatar.String,
			}
		}
		pages = append(pages, p)
	}
	return pages, rows.Err()
}
