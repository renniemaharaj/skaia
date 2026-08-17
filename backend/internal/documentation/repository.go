package docs

import (
	"context"
	"database/sql"
	"errors"
	"strconv"

	"github.com/skaia/backend/database"
	"github.com/skaia/backend/models"
)

type sqlRepository struct{ db database.Executor }

func NewRepository(db database.Executor) Repository { return &sqlRepository{db: db} }

const documentColumns = `id,slug,title,description,visibility,owner_id,revision,created_at,updated_at`
const articleColumns = `id,documentation_id,section_id,slug,title,summary,content,display_order,author_id,last_edited_by,revision,created_at,updated_at`

func scanDocument(row interface{ Scan(...any) error }) (*models.Documentation, error) {
	doc := &models.Documentation{}
	err := row.Scan(&doc.ID, &doc.Slug, &doc.Title, &doc.Description, &doc.Visibility,
		&doc.OwnerID, &doc.Revision, &doc.CreatedAt, &doc.UpdatedAt)
	return doc, err
}

func scanArticle(row interface{ Scan(...any) error }) (*models.DocumentationArticle, error) {
	article := &models.DocumentationArticle{}
	var sectionID sql.NullInt64
	err := row.Scan(&article.ID, &article.DocumentationID, &sectionID, &article.Slug,
		&article.Title, &article.Summary, &article.Content, &article.DisplayOrder,
		&article.AuthorID, &article.LastEditedBy, &article.Revision,
		&article.CreatedAt, &article.UpdatedAt)
	if sectionID.Valid {
		article.SectionID = &sectionID.Int64
	}
	return article, err
}

func (r *sqlRepository) list(where string, args ...any) ([]models.Documentation, error) {
	rows, err := r.db.Query(`SELECT `+documentColumns+` FROM documentations WHERE deleted_at IS NULL AND `+where+` ORDER BY title,id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]models.Documentation, 0)
	for rows.Next() {
		doc, err := scanDocument(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *doc)
	}
	return items, rows.Err()
}

func (r *sqlRepository) ListPublic() ([]models.Documentation, error) {
	return r.list(`visibility='public'`)
}
func (r *sqlRepository) ListAll() ([]models.Documentation, error) {
	return r.list(`TRUE`)
}
func (r *sqlRepository) ListOwned(ownerID int64) ([]models.Documentation, error) {
	return r.list(`owner_id=$1`, ownerID)
}

func (r *sqlRepository) GetByID(id int64) (*models.Documentation, error) {
	return scanDocument(r.db.QueryRow(`SELECT `+documentColumns+` FROM documentations WHERE id=$1 AND deleted_at IS NULL`, id))
}

func (r *sqlRepository) GetBySlug(slug string) (*models.Documentation, error) {
	return scanDocument(r.db.QueryRow(`SELECT `+documentColumns+` FROM documentations WHERE LOWER(slug)=LOWER($1) AND deleted_at IS NULL`, slug))
}

func (r *sqlRepository) Create(doc *models.Documentation) error {
	return r.db.QueryRow(`INSERT INTO documentations(slug,title,description,visibility,owner_id)
		VALUES($1,$2,$3,$4,$5) RETURNING `+documentColumns,
		doc.Slug, doc.Title, doc.Description, doc.Visibility, doc.OwnerID,
	).Scan(&doc.ID, &doc.Slug, &doc.Title, &doc.Description, &doc.Visibility,
		&doc.OwnerID, &doc.Revision, &doc.CreatedAt, &doc.UpdatedAt)
}

func (r *sqlRepository) Update(doc *models.Documentation, expectedRevision int64) error {
	err := r.db.QueryRow(`UPDATE documentations SET slug=$2,title=$3,description=$4,visibility=$5,
		revision=revision+1,updated_at=NOW() WHERE id=$1 AND revision=$6 AND deleted_at IS NULL
		RETURNING `+documentColumns, doc.ID, doc.Slug, doc.Title, doc.Description, doc.Visibility, expectedRevision,
	).Scan(&doc.ID, &doc.Slug, &doc.Title, &doc.Description, &doc.Visibility,
		&doc.OwnerID, &doc.Revision, &doc.CreatedAt, &doc.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrConflict
	}
	return err
}

func (r *sqlRepository) Delete(id, actorID int64) error {
	return database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		var changed int64
		if err := exec.QueryRow(`UPDATE documentations SET deleted_at=NOW(),deleted_by=$2,revision=revision+1,updated_at=NOW()
			WHERE id=$1 AND deleted_at IS NULL RETURNING id`, id, actorID).Scan(&changed); err != nil {
			return err
		}
		_, err := exec.Exec(`INSERT INTO resource_lifecycle_events(actor_id,resource_type,resource_id,action)
			VALUES($1,'documentation',$2,'delete')`, actorID, strconv.FormatInt(changed, 10))
		return err
	})
}

func (r *sqlRepository) Manifest(documentationID int64) (*models.DocumentationManifest, error) {
	doc, err := r.GetByID(documentationID)
	if err != nil {
		return nil, err
	}
	manifest := &models.DocumentationManifest{Documentation: doc, Sections: []models.DocumentationSection{}, Articles: []models.DocumentationArticle{}}
	rows, err := r.db.Query(`SELECT id,documentation_id,title,display_order,created_at,updated_at
		FROM documentation_sections WHERE documentation_id=$1 AND deleted_at IS NULL ORDER BY display_order,id`, documentationID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var section models.DocumentationSection
		if err := rows.Scan(&section.ID, &section.DocumentationID, &section.Title, &section.DisplayOrder, &section.CreatedAt, &section.UpdatedAt); err != nil {
			rows.Close()
			return nil, err
		}
		manifest.Sections = append(manifest.Sections, section)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	rows, err = r.db.Query(`SELECT `+articleColumns+` FROM documentation_articles
		WHERE documentation_id=$1 AND deleted_at IS NULL ORDER BY section_id NULLS FIRST,display_order,id`, documentationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		article, err := scanArticle(rows)
		if err != nil {
			return nil, err
		}
		article.Content = ""
		manifest.Articles = append(manifest.Articles, *article)
	}
	return manifest, rows.Err()
}

func (r *sqlRepository) GetSection(id int64) (*models.DocumentationSection, error) {
	section := &models.DocumentationSection{}
	err := r.db.QueryRow(`SELECT id,documentation_id,title,display_order,created_at,updated_at
		FROM documentation_sections WHERE id=$1 AND deleted_at IS NULL`, id).Scan(
		&section.ID, &section.DocumentationID, &section.Title, &section.DisplayOrder, &section.CreatedAt, &section.UpdatedAt)
	return section, err
}

func (r *sqlRepository) CreateSection(section *models.DocumentationSection) error {
	return r.db.QueryRow(`INSERT INTO documentation_sections(documentation_id,title,display_order)
		SELECT $1,$2,COALESCE(MAX(display_order)+1,0) FROM documentation_sections WHERE documentation_id=$1 AND deleted_at IS NULL
		RETURNING id,display_order,created_at,updated_at`, section.DocumentationID, section.Title).Scan(
		&section.ID, &section.DisplayOrder, &section.CreatedAt, &section.UpdatedAt)
}

func (r *sqlRepository) UpdateSection(section *models.DocumentationSection) error {
	return r.db.QueryRow(`UPDATE documentation_sections SET title=$2,updated_at=NOW()
		WHERE id=$1 AND deleted_at IS NULL RETURNING documentation_id,display_order,created_at,updated_at`, section.ID, section.Title).Scan(
		&section.DocumentationID, &section.DisplayOrder, &section.CreatedAt, &section.UpdatedAt)
}

func (r *sqlRepository) DeleteSection(id, actorID int64) error {
	return database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		if _, err := exec.Exec(`UPDATE documentation_articles SET section_id=NULL,updated_at=NOW()
			WHERE section_id=$1 AND deleted_at IS NULL`, id); err != nil {
			return err
		}
		var changed int64
		if err := exec.QueryRow(`UPDATE documentation_sections SET deleted_at=NOW(),deleted_by=$2,updated_at=NOW()
			WHERE id=$1 AND deleted_at IS NULL RETURNING id`, id, actorID).Scan(&changed); err != nil {
			return err
		}
		_, err := exec.Exec(`INSERT INTO resource_lifecycle_events(actor_id,resource_type,resource_id,action)
			VALUES($1,'documentation_section',$2,'delete')`, actorID, strconv.FormatInt(changed, 10))
		return err
	})
}

func (r *sqlRepository) GetArticleByID(id int64) (*models.DocumentationArticle, error) {
	return scanArticle(r.db.QueryRow(`SELECT `+articleColumns+` FROM documentation_articles
		WHERE id=$1 AND deleted_at IS NULL`, id))
}

func (r *sqlRepository) GetArticleBySlug(documentationID int64, slug string) (*models.DocumentationArticle, error) {
	return scanArticle(r.db.QueryRow(`SELECT `+articleColumns+` FROM documentation_articles
		WHERE documentation_id=$1 AND LOWER(slug)=LOWER($2) AND deleted_at IS NULL`, documentationID, slug))
}

func (r *sqlRepository) CreateArticle(article *models.DocumentationArticle) error {
	var sectionID sql.NullInt64
	err := r.db.QueryRow(`INSERT INTO documentation_articles(documentation_id,section_id,slug,title,summary,content,display_order,author_id,last_edited_by)
		SELECT $1,$2,$3,$4,$5,$6,COALESCE((SELECT MAX(a.display_order)+1 FROM documentation_articles a WHERE a.documentation_id=$1 AND a.deleted_at IS NULL),0),$7,$7
		WHERE ($2::bigint IS NULL OR EXISTS(SELECT 1 FROM documentation_sections s WHERE s.id=$2 AND s.documentation_id=$1 AND s.deleted_at IS NULL))
		RETURNING `+articleColumns, article.DocumentationID, article.SectionID, article.Slug, article.Title,
		article.Summary, article.Content, article.AuthorID).Scan(
		&article.ID, &article.DocumentationID, &sectionID, &article.Slug, &article.Title, &article.Summary, &article.Content,
		&article.DisplayOrder, &article.AuthorID, &article.LastEditedBy, &article.Revision, &article.CreatedAt, &article.UpdatedAt)
	if sectionID.Valid {
		article.SectionID = &sectionID.Int64
	} else {
		article.SectionID = nil
	}
	return err
}

func (r *sqlRepository) UpdateArticle(article *models.DocumentationArticle, expectedRevision int64) error {
	var sectionID sql.NullInt64
	err := r.db.QueryRow(`UPDATE documentation_articles a SET section_id=$2,slug=$3,title=$4,summary=$5,content=$6,
		last_edited_by=$7,revision=revision+1,updated_at=NOW()
		WHERE a.id=$1 AND a.revision=$8 AND a.deleted_at IS NULL
		AND ($2::bigint IS NULL OR EXISTS(SELECT 1 FROM documentation_sections s WHERE s.id=$2 AND s.documentation_id=a.documentation_id AND s.deleted_at IS NULL))
		RETURNING `+articleColumns, article.ID, article.SectionID, article.Slug, article.Title, article.Summary,
		article.Content, article.LastEditedBy, expectedRevision).Scan(
		&article.ID, &article.DocumentationID, &sectionID, &article.Slug, &article.Title, &article.Summary, &article.Content,
		&article.DisplayOrder, &article.AuthorID, &article.LastEditedBy, &article.Revision, &article.CreatedAt, &article.UpdatedAt)
	if sectionID.Valid {
		article.SectionID = &sectionID.Int64
	} else {
		article.SectionID = nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return ErrConflict
	}
	return err
}

func (r *sqlRepository) DeleteArticle(id, actorID int64) error {
	return database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		var changed int64
		if err := exec.QueryRow(`UPDATE documentation_articles SET deleted_at=NOW(),deleted_by=$2,revision=revision+1,updated_at=NOW()
			WHERE id=$1 AND deleted_at IS NULL RETURNING id`, id, actorID).Scan(&changed); err != nil {
			return err
		}
		_, err := exec.Exec(`INSERT INTO resource_lifecycle_events(actor_id,resource_type,resource_id,action)
			VALUES($1,'documentation_article',$2,'delete')`, actorID, strconv.FormatInt(changed, 10))
		return err
	})
}

func (r *sqlRepository) Reorder(documentationID int64, order NavigationOrder) error {
	return database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		for _, item := range order.Sections {
			result, err := exec.Exec(`UPDATE documentation_sections SET display_order=$3,updated_at=NOW()
				WHERE id=$1 AND documentation_id=$2 AND deleted_at IS NULL`, item.ID, documentationID, item.DisplayOrder)
			if err != nil {
				return err
			}
			if n, _ := result.RowsAffected(); n != 1 {
				return sql.ErrNoRows
			}
		}
		for _, item := range order.Articles {
			result, err := exec.Exec(`UPDATE documentation_articles SET display_order=$3,updated_at=NOW()
				WHERE id=$1 AND documentation_id=$2 AND deleted_at IS NULL`, item.ID, documentationID, item.DisplayOrder)
			if err != nil {
				return err
			}
			if n, _ := result.RowsAffected(); n != 1 {
				return sql.ErrNoRows
			}
		}
		_, err := exec.Exec(`UPDATE documentations SET revision=revision+1,updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`, documentationID)
		return err
	})
}

func (r *sqlRepository) Search(documentationID int64, query string, limit int) ([]models.DocumentationSearchResult, error) {
	rows, err := r.db.Query(`SELECT id,slug,title,summary,
		LEFT(REGEXP_REPLACE(content,'<[^>]*>',' ','g'),240),section_id
		FROM documentation_articles WHERE documentation_id=$1 AND deleted_at IS NULL
		AND (title ILIKE '%'||$2||'%' OR summary ILIKE '%'||$2||'%' OR content ILIKE '%'||$2||'%')
		ORDER BY CASE WHEN title ILIKE '%'||$2||'%' THEN 0 ELSE 1 END,display_order,id LIMIT $3`, documentationID, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results := make([]models.DocumentationSearchResult, 0)
	for rows.Next() {
		var result models.DocumentationSearchResult
		var sectionID sql.NullInt64
		if err := rows.Scan(&result.ArticleID, &result.Slug, &result.Title, &result.Summary, &result.Excerpt, &sectionID); err != nil {
			return nil, err
		}
		if sectionID.Valid {
			result.SectionID = &sectionID.Int64
		}
		results = append(results, result)
	}
	return results, rows.Err()
}
