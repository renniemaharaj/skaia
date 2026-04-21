package config

import (
	"database/sql"

	"github.com/skaia/backend/models"
)

type sqlRepository struct{ db *sql.DB }

// NewRepository returns a Repository backed by Postgres.
func NewRepository(db *sql.DB) Repository { return &sqlRepository{db: db} }

// ── Site config ─────────────────────────────────────────────────────────────

func (r *sqlRepository) GetConfig(key string) (*models.SiteConfig, error) {
	sc := &models.SiteConfig{}
	err := r.db.QueryRow(
		`SELECT key, value::text, updated_at FROM site_config WHERE key=$1`, key,
	).Scan(&sc.Key, &sc.Value, &sc.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return sc, nil
}

func (r *sqlRepository) UpsertConfig(key, valueJSON string) error {
	query := `INSERT INTO site_config (key, value, updated_at)
		 VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
		 ON CONFLICT (key) DO UPDATE SET value = site_config.value || $2::jsonb, updated_at=CURRENT_TIMESTAMP`
	if key == "landing_page_slug" {
		query = `INSERT INTO site_config (key, value, updated_at)
		 VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
		 ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at=CURRENT_TIMESTAMP`
	}
	_, err := r.db.Exec(query, key, valueJSON)
	return err
}

func (r *sqlRepository) DeleteConfig(key string) error {
	_, err := r.db.Exec(`DELETE FROM site_config WHERE key = $1`, key)
	return err
}

// ── Landing sections ────────────────────────────────────────────────────────

func (r *sqlRepository) DeleteAllSections() error {
	_, err := r.db.Exec(`DELETE FROM page_sections`)
	return err
}

func (r *sqlRepository) ListSections() ([]*models.PageSection, error) {
	rows, err := r.db.Query(
		`SELECT id, display_order, section_type, heading, subheading,
			 config::text, created_at, updated_at
		 FROM page_sections ORDER BY display_order`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sections []*models.PageSection
	for rows.Next() {
		s := &models.PageSection{}
		if err := rows.Scan(&s.ID, &s.DisplayOrder, &s.SectionType,
			&s.Heading, &s.Subheading, &s.Config,
			&s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		sections = append(sections, s)
	}

	// Load items for every section in one query
	if len(sections) > 0 {
		itemRows, err := r.db.Query(
			`SELECT id, page_section_id, display_order, icon, heading, subheading,
				  image_url, link_url, config::text, created_at, updated_at
			  FROM page_items ORDER BY page_section_id, display_order`)
		if err != nil {
			return nil, err
		}
		defer itemRows.Close()

		bySection := map[int64][]*models.PageItem{}
		for itemRows.Next() {
			it := &models.PageItem{}
			if err := itemRows.Scan(&it.ID, &it.SectionID, &it.DisplayOrder,
				&it.Icon, &it.Heading, &it.Subheading,
				&it.ImageURL, &it.LinkURL, &it.Config,
				&it.CreatedAt, &it.UpdatedAt); err != nil {
				return nil, err
			}
			bySection[it.SectionID] = append(bySection[it.SectionID], it)
		}
		for _, s := range sections {
			s.Items = bySection[s.ID]
		}
	}

	return sections, rows.Err()
}

func (r *sqlRepository) GetSection(id int64) (*models.PageSection, error) {
	s := &models.PageSection{}
	err := r.db.QueryRow(
		`SELECT id, display_order, section_type, heading, subheading,
			      config::text, created_at, updated_at
		       FROM page_sections WHERE id=$1`, id,
	).Scan(&s.ID, &s.DisplayOrder, &s.SectionType,
		&s.Heading, &s.Subheading, &s.Config,
		&s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return nil, err
	}
	items, err := r.ListItems(id)
	if err != nil {
		return nil, err
	}
	s.Items = items
	return s, nil
}

func (r *sqlRepository) CreateSection(s *models.PageSection) error {
	return r.db.QueryRow(
		`INSERT INTO page_sections (display_order, section_type, heading, subheading, config)
		       VALUES ($1, $2, $3, $4, $5::jsonb)
		       RETURNING id, created_at, updated_at`,
		s.DisplayOrder, s.SectionType, s.Heading, s.Subheading, s.Config,
	).Scan(&s.ID, &s.CreatedAt, &s.UpdatedAt)
}

func (r *sqlRepository) UpdateSection(s *models.PageSection) error {
	_, err := r.db.Exec(
		`UPDATE page_sections
		       SET display_order=$2, heading=$3, subheading=$4, config=$5::jsonb, updated_at=CURRENT_TIMESTAMP
		       WHERE id=$1`,
		s.ID, s.DisplayOrder, s.Heading, s.Subheading, s.Config,
	)
	return err
}

func (r *sqlRepository) DeleteSection(id int64) error {
	_, err := r.db.Exec(`DELETE FROM page_sections WHERE id=$1`, id)
	return err
}

func (r *sqlRepository) ShiftSections(fromOrder int) error {
	_, err := r.db.Exec(
		`UPDATE page_sections SET display_order = display_order + 1, updated_at=CURRENT_TIMESTAMP WHERE display_order >= $1`,
		fromOrder,
	)
	return err
}

func (r *sqlRepository) ReorderSections(ids []int64) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	for i, id := range ids {
		if _, err := tx.Exec(
			`UPDATE page_sections SET display_order=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
			i+1, id); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// ── Landing items ───────────────────────────────────────────────────────────

func (r *sqlRepository) ListItems(sectionID int64) ([]*models.PageItem, error) {
	rows, err := r.db.Query(
		`SELECT id, page_section_id, display_order, icon, heading, subheading,
			 image_url, link_url, config::text, created_at, updated_at
		 FROM page_items WHERE page_section_id=$1 ORDER BY display_order`, sectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*models.PageItem
	for rows.Next() {
		it := &models.PageItem{}
		if err := rows.Scan(&it.ID, &it.SectionID, &it.DisplayOrder,
			&it.Icon, &it.Heading, &it.Subheading,
			&it.ImageURL, &it.LinkURL, &it.Config,
			&it.CreatedAt, &it.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return items, rows.Err()
}

func (r *sqlRepository) CreateItem(item *models.PageItem) error {
	return r.db.QueryRow(
		`INSERT INTO page_items (page_section_id, display_order, icon, heading, subheading, image_url, link_url, config)
		       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
		       RETURNING id, created_at, updated_at`,
		item.SectionID, item.DisplayOrder, item.Icon, item.Heading,
		item.Subheading, item.ImageURL, item.LinkURL, item.Config,
	).Scan(&item.ID, &item.CreatedAt, &item.UpdatedAt)
}

func (r *sqlRepository) GetItem(id int64) (*models.PageItem, error) {
	it := &models.PageItem{}
	err := r.db.QueryRow(
		`SELECT id, page_section_id, display_order, icon, heading, subheading,
			      image_url, link_url, config::text, created_at, updated_at
		       FROM page_items WHERE id=$1`, id,
	).Scan(&it.ID, &it.SectionID, &it.DisplayOrder,
		&it.Icon, &it.Heading, &it.Subheading,
		&it.ImageURL, &it.LinkURL, &it.Config,
		&it.CreatedAt, &it.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return it, nil
}

func (r *sqlRepository) UpdateItem(item *models.PageItem) error {
	_, err := r.db.Exec(
		`UPDATE page_items
				       SET icon=$2, heading=$3, subheading=$4, image_url=$5, link_url=$6,
					       config=$7::jsonb, updated_at=CURRENT_TIMESTAMP
				       WHERE id=$1`,
		item.ID, item.Icon, item.Heading, item.Subheading,
		item.ImageURL, item.LinkURL, item.Config,
	)
	return err
}

func (r *sqlRepository) DeleteItem(id int64) error {
	_, err := r.db.Exec(`DELETE FROM page_items WHERE id=$1`, id)
	return err
}

func (r *sqlRepository) ReorderItems(sectionID int64, ids []int64) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	for i, id := range ids {
		if _, err := tx.Exec(
			`UPDATE page_items SET display_order=$1, updated_at=CURRENT_TIMESTAMP
			       WHERE id=$2 AND page_section_id=$3`,
			i+1, id, sectionID); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}
