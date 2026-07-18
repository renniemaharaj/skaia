package page

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"

	"github.com/skaia/backend/database"
	"github.com/skaia/backend/models"
)

func (r *sqlRepository) TypedSectionPageReady(pageID int64) (bool, error) {
	var ready bool
	err := r.db.QueryRow(
		`SELECT EXISTS (
		   SELECT 1 FROM page_section_shadow_runs
		   WHERE page_id=$1 AND status='matched'
		 )`, pageID,
	).Scan(&ready)
	return ready, err
}

func (r *sqlRepository) ListTypedSections(pageID int64) ([]TypedSectionResource, error) {
	document, err := loadPageSectionShadow(r.db, pageID)
	if err != nil {
		return nil, err
	}
	return typedSectionResources(document), nil
}

func (r *sqlRepository) CreateTypedSection(pageID, actorID int64, section ShadowSection) ([]TypedSectionResource, error) {
	var resources []TypedSectionResource
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		current, err := lockTypedPage(exec, pageID)
		if err != nil {
			return err
		}
		document, err := lockAndLoadTypedDocument(exec, pageID)
		if err != nil {
			return err
		}
		for _, existing := range document.Sections {
			if existing.LegacyKey == section.LegacyKey {
				return ErrTypedSectionInvalid
			}
		}
		insertAt := section.DisplayOrder - 1
		if insertAt < 0 || insertAt > len(document.Sections) {
			insertAt = len(document.Sections)
		}
		if err := stageSectionSourceIndexes(exec, pageID); err != nil {
			return err
		}
		for index := range document.Sections {
			nextIndex := index
			if index >= insertAt {
				nextIndex++
			}
			if nextIndex != document.Sections[index].SourceIndex {
				document.Sections[index].Revision++
			}
			if _, err := exec.Exec(
				`UPDATE page_section_instances SET source_index=$2, display_order=$3, revision=$4,
				 updated_by=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
				document.Sections[index].ID, nextIndex, nextIndex+1, document.Sections[index].Revision, actorID,
			); err != nil {
				return fmt.Errorf("reindex typed sections: %w", err)
			}
		}
		section.SourceIndex = insertAt
		section.DisplayOrder = insertAt + 1
		section.Revision = 1
		if _, err := writeTypedSection(exec, pageID, actorID, section, nil); err != nil {
			return err
		}
		if err := persistTypedPageDefinition(exec, pageID, current); err != nil {
			return err
		}
		loaded, err := loadPageSectionShadow(exec, pageID)
		if err != nil {
			return err
		}
		resources = typedSectionResources(loaded)
		return nil
	})
	return resources, sanitizedTypedError(err)
}

func (r *sqlRepository) UpdateTypedSection(pageID, sectionID, actorID, expectedRevision int64, section ShadowSection) ([]TypedSectionResource, error) {
	var resources []TypedSectionResource
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		current, err := lockTypedPage(exec, pageID)
		if err != nil {
			return err
		}
		document, err := lockAndLoadTypedDocument(exec, pageID)
		if err != nil {
			return err
		}
		var existing *ShadowSection
		for index := range document.Sections {
			if document.Sections[index].ID == sectionID {
				existing = &document.Sections[index]
				break
			}
		}
		if existing == nil {
			return ErrTypedSectionNotFound
		}
		if err := RequireExpectedSectionRevision(expectedRevision, existing.Revision); err != nil {
			return err
		}
		section.ID = existing.ID
		section.SourceIndex = existing.SourceIndex
		section.LegacyKey = existing.LegacyKey
		section.OriginalSectionType = existing.OriginalSectionType
		section.DisplayOrder = existing.DisplayOrder
		section.ConfigEncoding = existing.ConfigEncoding
		section.QuarantinedConfig = existing.QuarantinedConfig
		section.QuarantinedSection = existing.QuarantinedSection
		section.AliasRepairs = existing.AliasRepairs
		section.Revision = existing.Revision + 1
		if _, err := writeTypedSection(exec, pageID, actorID, section, existing); err != nil {
			return err
		}
		if err := persistTypedPageDefinition(exec, pageID, current); err != nil {
			return err
		}
		loaded, err := loadPageSectionShadow(exec, pageID)
		if err != nil {
			return err
		}
		resources = typedSectionResources(loaded)
		return nil
	})
	return resources, sanitizedTypedError(err)
}

func (r *sqlRepository) DeleteTypedSection(pageID, sectionID, actorID, expectedRevision int64) ([]TypedSectionResource, error) {
	var resources []TypedSectionResource
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		current, err := lockTypedPage(exec, pageID)
		if err != nil {
			return err
		}
		document, err := lockAndLoadTypedDocument(exec, pageID)
		if err != nil {
			return err
		}
		target := -1
		for index := range document.Sections {
			if document.Sections[index].ID == sectionID {
				target = index
				break
			}
		}
		if target < 0 {
			return ErrTypedSectionNotFound
		}
		if err := RequireExpectedSectionRevision(expectedRevision, document.Sections[target].Revision); err != nil {
			return err
		}
		if _, err := exec.Exec(`DELETE FROM page_section_instances WHERE id=$1 AND page_id=$2`, sectionID, pageID); err != nil {
			return err
		}
		document.Sections = append(document.Sections[:target], document.Sections[target+1:]...)
		if err := stageSectionSourceIndexes(exec, pageID); err != nil {
			return err
		}
		for index := range document.Sections {
			revision := document.Sections[index].Revision
			if document.Sections[index].SourceIndex != index {
				revision++
			}
			if _, err := exec.Exec(
				`UPDATE page_section_instances SET source_index=$2, display_order=$3, revision=$4,
				 updated_by=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
				document.Sections[index].ID, index, index+1, revision, actorID,
			); err != nil {
				return err
			}
		}
		if err := persistTypedPageDefinition(exec, pageID, current); err != nil {
			return err
		}
		loaded, err := loadPageSectionShadow(exec, pageID)
		if err != nil {
			return err
		}
		resources = typedSectionResources(loaded)
		return nil
	})
	return resources, sanitizedTypedError(err)
}

func (r *sqlRepository) ReorderTypedSections(pageID, actorID int64, order []TypedSectionOrder) ([]TypedSectionResource, error) {
	var resources []TypedSectionResource
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		current, err := lockTypedPage(exec, pageID)
		if err != nil {
			return err
		}
		document, err := lockAndLoadTypedDocument(exec, pageID)
		if err != nil {
			return err
		}
		if len(order) != len(document.Sections) {
			return ErrTypedSectionInvalid
		}
		byID := make(map[int64]ShadowSection, len(document.Sections))
		for _, section := range document.Sections {
			byID[section.ID] = section
		}
		seen := make(map[int64]struct{}, len(order))
		for _, requested := range order {
			section, ok := byID[requested.ID]
			if !ok {
				return ErrTypedSectionInvalid
			}
			if _, duplicate := seen[requested.ID]; duplicate {
				return ErrTypedSectionInvalid
			}
			seen[requested.ID] = struct{}{}
			if err := RequireExpectedSectionRevision(requested.ExpectedRevision, section.Revision); err != nil {
				return err
			}
		}
		if err := stageSectionSourceIndexes(exec, pageID); err != nil {
			return err
		}
		for index, requested := range order {
			section := byID[requested.ID]
			revision := section.Revision
			if section.SourceIndex != index {
				revision++
			}
			if _, err := exec.Exec(
				`UPDATE page_section_instances SET source_index=$2, display_order=$3, revision=$4,
				 updated_by=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
				requested.ID, index, index+1, revision, actorID,
			); err != nil {
				return err
			}
		}
		if err := persistTypedPageDefinition(exec, pageID, current); err != nil {
			return err
		}
		loaded, err := loadPageSectionShadow(exec, pageID)
		if err != nil {
			return err
		}
		resources = typedSectionResources(loaded)
		return nil
	})
	return resources, sanitizedTypedError(err)
}

func lockTypedPage(exec database.Executor, pageID int64) (string, error) {
	var content string
	if err := exec.QueryRow(`SELECT content::text FROM pages WHERE id=$1 FOR UPDATE`, pageID).Scan(&content); err != nil {
		return "", err
	}
	return content, nil
}

func lockAndLoadTypedDocument(exec database.Executor, pageID int64) (NormalizedShadowDocument, error) {
	rows, err := exec.Query(`SELECT id FROM page_section_instances WHERE page_id=$1 ORDER BY id FOR UPDATE`, pageID)
	if err != nil {
		return NormalizedShadowDocument{}, err
	}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			_ = rows.Close()
			return NormalizedShadowDocument{}, err
		}
	}
	if err := rows.Close(); err != nil {
		return NormalizedShadowDocument{}, err
	}
	return loadPageSectionShadow(exec, pageID)
}

func stageSectionSourceIndexes(exec database.Executor, pageID int64) error {
	_, err := exec.Exec(
		`UPDATE page_section_instances SET source_index=source_index+$2 WHERE page_id=$1 AND source_index<$2`,
		pageID, shadowSourceIndexOffset,
	)
	return err
}

func writeTypedSection(exec database.Executor, pageID, actorID int64, section ShadowSection, existing *ShadowSection) (int64, error) {
	sectionID, err := upsertShadowSection(exec, &models.Page{ID: pageID}, section)
	if err != nil {
		return 0, err
	}
	if _, err := exec.Exec(
		`UPDATE page_section_instances SET created_by=COALESCE(created_by,$2), updated_by=$2 WHERE id=$1`,
		sectionID, actorID,
	); err != nil {
		return 0, err
	}
	if _, err := exec.Exec(
		`UPDATE page_section_instance_items SET source_index=source_index+$2 WHERE section_id=$1 AND source_index<$2`,
		sectionID, shadowSourceIndexOffset,
	); err != nil {
		return 0, err
	}
	existingItems := map[string]ShadowItem{}
	if existing != nil {
		for _, item := range existing.Items {
			existingItems[item.LegacyKey.Kind+"\x00"+item.LegacyKey.Value] = item
		}
	}
	for index := range section.Items {
		item := section.Items[index]
		item.SourceIndex = index
		item.DisplayOrder = index + 1
		if current, ok := existingItems[item.LegacyKey.Kind+"\x00"+item.LegacyKey.Value]; ok {
			item.ConfigEncoding = current.ConfigEncoding
			item.QuarantinedItem = current.QuarantinedItem
			item.Revision = current.Revision + 1
		}
		itemID, err := upsertShadowItem(exec, sectionID, item)
		if err != nil {
			return 0, err
		}
		if _, err := exec.Exec(
			`UPDATE page_section_instance_items SET created_by=COALESCE(created_by,$2), updated_by=$2 WHERE id=$1`,
			itemID, actorID,
		); err != nil {
			return 0, err
		}
	}
	if _, err := exec.Exec(
		`DELETE FROM page_section_instance_items WHERE section_id=$1 AND source_index >= $2`,
		sectionID, shadowSourceIndexOffset,
	); err != nil {
		return 0, err
	}
	missing, err := replaceShadowColorReferences(exec, pageID, sectionID, section.Shell)
	if err != nil {
		return 0, err
	}
	if len(missing) > 0 {
		return 0, ErrPaletteTokenNotFound
	}
	return sectionID, nil
}

func persistTypedPageDefinition(exec database.Executor, pageID int64, current string) error {
	document, err := loadPageSectionShadow(exec, pageID)
	if err != nil {
		return err
	}
	projected, err := ProjectNormalizedPageContent(document)
	if err != nil {
		return err
	}
	merged, err := mergeInteractiveRecords(current, projected)
	if err != nil {
		return err
	}
	page := &models.Page{ID: pageID, Content: merged}
	if err := exec.QueryRow(
		`UPDATE pages SET content=$2::jsonb, updated_at=CURRENT_TIMESTAMP WHERE id=$1
		 RETURNING created_at, updated_at`, pageID, merged,
	).Scan(&page.CreatedAt, &page.UpdatedAt); err != nil {
		return err
	}
	_, err = syncPageSectionShadow(exec, page)
	return err
}

func (r *sqlRepository) GetPageTheme(pageID int64) (*models.PageTheme, error) {
	theme := &models.PageTheme{Version: 1, Tokens: []models.PageThemeToken{}}
	if err := r.db.QueryRow(`SELECT revision FROM page_themes WHERE page_id=$1`, pageID).Scan(&theme.Revision); err != nil {
		return nil, err
	}
	rows, err := r.db.Query(
		`SELECT token_key,label,color_value,display_order,revision FROM page_theme_tokens
		 WHERE page_id=$1 ORDER BY display_order,token_key`, pageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var token models.PageThemeToken
		if err := rows.Scan(&token.Key, &token.Label, &token.Value, &token.DisplayOrder, &token.Revision); err != nil {
			return nil, err
		}
		theme.Tokens = append(theme.Tokens, token)
	}
	return theme, rows.Err()
}

func (r *sqlRepository) UpdatePageTheme(pageID, actorID, expectedRevision int64, theme models.PageTheme) (*models.PageTheme, error) {
	var updated *models.PageTheme
	err := database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		if _, err := lockTypedPage(exec, pageID); err != nil {
			return err
		}
		var actual int64
		if err := exec.QueryRow(`SELECT revision FROM page_themes WHERE page_id=$1 FOR UPDATE`, pageID).Scan(&actual); err != nil {
			return err
		}
		if err := RequireExpectedSectionRevision(expectedRevision, actual); err != nil {
			return err
		}
		rows, err := exec.Query(
			`SELECT token_key,label,color_value,display_order,revision FROM page_theme_tokens WHERE page_id=$1 FOR UPDATE`, pageID,
		)
		if err != nil {
			return err
		}
		existing := map[string]models.PageThemeToken{}
		for rows.Next() {
			var token models.PageThemeToken
			if err := rows.Scan(&token.Key, &token.Label, &token.Value, &token.DisplayOrder, &token.Revision); err != nil {
				_ = rows.Close()
				return err
			}
			existing[token.Key] = token
		}
		if err := rows.Close(); err != nil {
			return err
		}
		referencedRows, err := exec.Query(
			`SELECT DISTINCT token_key FROM page_section_color_references WHERE page_id=$1`, pageID,
		)
		if err != nil {
			return err
		}
		referenced := map[string]struct{}{}
		for referencedRows.Next() {
			var key string
			if err := referencedRows.Scan(&key); err != nil {
				_ = referencedRows.Close()
				return err
			}
			referenced[key] = struct{}{}
		}
		_ = referencedRows.Close()
		incoming := map[string]models.PageThemeToken{}
		for _, token := range theme.Tokens {
			if _, duplicate := incoming[token.Key]; duplicate {
				return ErrTypedSectionInvalid
			}
			incoming[token.Key] = token
		}
		for key := range referenced {
			if _, retained := incoming[key]; !retained {
				return ErrPaletteTokenReferenced
			}
		}
		if _, err := exec.Exec(`SET CONSTRAINTS page_theme_tokens_page_id_display_order_key DEFERRED`); err != nil {
			return err
		}
		for _, token := range theme.Tokens {
			revision := int64(1)
			if current, ok := existing[token.Key]; ok {
				revision = current.Revision
				if current.Label != token.Label || current.Value != token.Value || current.DisplayOrder != token.DisplayOrder {
					revision++
				}
				if _, err := exec.Exec(
					`UPDATE page_theme_tokens SET label=$3,color_value=$4,display_order=$5,revision=$6,
					 updated_by=$7,updated_at=CURRENT_TIMESTAMP WHERE page_id=$1 AND token_key=$2`,
					pageID, token.Key, token.Label, token.Value, token.DisplayOrder, revision, actorID,
				); err != nil {
					return err
				}
			} else if _, err := exec.Exec(
				`INSERT INTO page_theme_tokens
				 (page_id,token_key,label,color_value,display_order,revision,created_by,updated_by)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
				pageID, token.Key, token.Label, token.Value, token.DisplayOrder, revision, actorID,
			); err != nil {
				return err
			}
		}
		for key := range existing {
			if _, retained := incoming[key]; retained {
				continue
			}
			if _, err := exec.Exec(`DELETE FROM page_theme_tokens WHERE page_id=$1 AND token_key=$2`, pageID, key); err != nil {
				return err
			}
		}
		if err := exec.QueryRow(
			`UPDATE page_themes SET revision=revision+1,updated_by=$2,updated_at=CURRENT_TIMESTAMP
			 WHERE page_id=$1 RETURNING revision`, pageID, actorID,
		).Scan(&actual); err != nil {
			return err
		}
		updated = &models.PageTheme{Version: 1, Revision: actual, Tokens: []models.PageThemeToken{}}
		for _, token := range theme.Tokens {
			if current, ok := existing[token.Key]; ok {
				token.Revision = current.Revision
				if current.Label != token.Label || current.Value != token.Value || current.DisplayOrder != token.DisplayOrder {
					token.Revision++
				}
			} else {
				token.Revision = 1
			}
			updated.Tokens = append(updated.Tokens, token)
		}
		sort.Slice(updated.Tokens, func(i, j int) bool { return updated.Tokens[i].DisplayOrder < updated.Tokens[j].DisplayOrder })
		return nil
	})
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrTypedSectionNotFound
	}
	return updated, sanitizedTypedError(err)
}

var _ TypedSectionRepository = (*sqlRepository)(nil)
