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
	_, err := r.db.Exec(
		`INSERT INTO site_config (key, value, updated_at)
		 VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
		 ON CONFLICT (key) DO UPDATE SET value = site_config.value || $2::jsonb, updated_at=CURRENT_TIMESTAMP`,
		key, valueJSON,
	)
	return err
}

// ── Landing sections ────────────────────────────────────────────────────────

func (r *sqlRepository) ListSections() ([]*models.LandingSection, error) {
	rows, err := r.db.Query(
		`SELECT id, display_order, section_type, heading, subheading,
		        config::text, created_at, updated_at
		 FROM landing_sections ORDER BY display_order`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sections []*models.LandingSection
	for rows.Next() {
		s := &models.LandingSection{}
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
			`SELECT id, section_id, display_order, icon, heading, subheading,
			        image_url, link_url, config::text, created_at, updated_at
			 FROM landing_items ORDER BY section_id, display_order`)
		if err != nil {
			return nil, err
		}
		defer itemRows.Close()

		bySection := map[int64][]*models.LandingItem{}
		for itemRows.Next() {
			it := &models.LandingItem{}
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

func (r *sqlRepository) GetSection(id int64) (*models.LandingSection, error) {
	s := &models.LandingSection{}
	err := r.db.QueryRow(
		`SELECT id, display_order, section_type, heading, subheading,
		        config::text, created_at, updated_at
		 FROM landing_sections WHERE id=$1`, id,
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

func (r *sqlRepository) CreateSection(s *models.LandingSection) error {
	return r.db.QueryRow(
		`INSERT INTO landing_sections (display_order, section_type, heading, subheading, config)
		 VALUES ($1, $2, $3, $4, $5::jsonb)
		 RETURNING id, created_at, updated_at`,
		s.DisplayOrder, s.SectionType, s.Heading, s.Subheading, s.Config,
	).Scan(&s.ID, &s.CreatedAt, &s.UpdatedAt)
}

func (r *sqlRepository) UpdateSection(s *models.LandingSection) error {
	_, err := r.db.Exec(
		`UPDATE landing_sections
		 SET display_order=$2, heading=$3, subheading=$4, config=$5::jsonb, updated_at=CURRENT_TIMESTAMP
		 WHERE id=$1`,
		s.ID, s.DisplayOrder, s.Heading, s.Subheading, s.Config,
	)
	return err
}

func (r *sqlRepository) DeleteSection(id int64) error {
	_, err := r.db.Exec(`DELETE FROM landing_sections WHERE id=$1`, id)
	return err
}

func (r *sqlRepository) ShiftSections(fromOrder int) error {
	_, err := r.db.Exec(
		`UPDATE landing_sections SET display_order = display_order + 1, updated_at=CURRENT_TIMESTAMP WHERE display_order >= $1`,
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
			`UPDATE landing_sections SET display_order=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
			i+1, id); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// ── Landing items ───────────────────────────────────────────────────────────

func (r *sqlRepository) ListItems(sectionID int64) ([]*models.LandingItem, error) {
	rows, err := r.db.Query(
		`SELECT id, section_id, display_order, icon, heading, subheading,
		        image_url, link_url, config::text, created_at, updated_at
		 FROM landing_items WHERE section_id=$1 ORDER BY display_order`, sectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*models.LandingItem
	for rows.Next() {
		it := &models.LandingItem{}
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

func (r *sqlRepository) CreateItem(item *models.LandingItem) error {
	return r.db.QueryRow(
		`INSERT INTO landing_items (section_id, display_order, icon, heading, subheading, image_url, link_url, config)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
		 RETURNING id, created_at, updated_at`,
		item.SectionID, item.DisplayOrder, item.Icon, item.Heading,
		item.Subheading, item.ImageURL, item.LinkURL, item.Config,
	).Scan(&item.ID, &item.CreatedAt, &item.UpdatedAt)
}

func (r *sqlRepository) UpdateItem(item *models.LandingItem) error {
	_, err := r.db.Exec(
		`UPDATE landing_items
		 SET icon=$2, heading=$3, subheading=$4, image_url=$5, link_url=$6,
		     config=$7::jsonb, updated_at=CURRENT_TIMESTAMP
		 WHERE id=$1`,
		item.ID, item.Icon, item.Heading, item.Subheading,
		item.ImageURL, item.LinkURL, item.Config,
	)
	return err
}

func (r *sqlRepository) DeleteItem(id int64) error {
	_, err := r.db.Exec(`DELETE FROM landing_items WHERE id=$1`, id)
	return err
}

func (r *sqlRepository) ReorderItems(sectionID int64, ids []int64) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	for i, id := range ids {
		if _, err := tx.Exec(
			`UPDATE landing_items SET display_order=$1, updated_at=CURRENT_TIMESTAMP
			 WHERE id=$2 AND section_id=$3`,
			i+1, id, sectionID); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}
