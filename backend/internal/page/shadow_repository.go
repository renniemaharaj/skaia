package page

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/skaia/backend/database"
	"github.com/skaia/backend/models"
)

const shadowSourceIndexOffset = 1_000_000_000

type ShadowSyncReport struct {
	PageID          int64    `json:"page_id"`
	Status          string   `json:"status"`
	SourceHash      string   `json:"source_hash"`
	ProjectionHash  string   `json:"projection_hash"`
	SectionCount    int      `json:"section_count"`
	ItemCount       int      `json:"item_count"`
	QuarantineCount int      `json:"quarantine_count"`
	MismatchCodes   []string `json:"mismatch_codes"`
}

type ShadowBackfillResult struct {
	AfterID     int64 `json:"after_id"`
	NextAfterID int64 `json:"next_after_id"`
	Scanned     int   `json:"scanned"`
	Matched     int   `json:"matched"`
	Quarantined int   `json:"quarantined"`
	Mismatched  int   `json:"mismatched"`
	Done        bool  `json:"done"`
}

// SyncPageSectionShadow transactionally refreshes one page's normalized shadow
// rows and stores content-free parity telemetry. pages.content remains the read
// authority and any caller-supplied interactive runtime values are excluded.
func SyncPageSectionShadow(ctx context.Context, exec database.Executor, source *models.Page) (ShadowSyncReport, error) {
	var report ShadowSyncReport
	err := database.TransactionalExecutor(ctx, exec, func(tx database.Executor) error {
		var err error
		report, err = syncPageSectionShadow(tx, source)
		return err
	})
	return report, err
}

func syncPageSectionShadow(exec database.Executor, source *models.Page) (ShadowSyncReport, error) {
	document, err := NormalizeLegacyPageContent(source.Content)
	if err != nil {
		return ShadowSyncReport{}, err
	}
	if _, err := exec.Exec(
		`INSERT INTO page_themes (page_id, schema_version, revision)
		 VALUES ($1, 1, 1) ON CONFLICT (page_id) DO NOTHING`, source.ID,
	); err != nil {
		return ShadowSyncReport{}, fmt.Errorf("ensure page shadow theme: %w", err)
	}
	if _, err := exec.Exec(
		`UPDATE page_section_instances
		 SET source_index = source_index + $2
		 WHERE page_id = $1 AND source_index < $2`, source.ID, shadowSourceIndexOffset,
	); err != nil {
		return ShadowSyncReport{}, fmt.Errorf("stage page shadow sections: %w", err)
	}

	quarantine := append([]ShadowQuarantine(nil), document.Quarantine...)
	itemCount := 0
	for i := range document.Sections {
		section := &document.Sections[i]
		if len(section.QuarantinedConfig) > 0 || len(section.QuarantinedSection) > 0 {
			quarantine = append(quarantine, ShadowQuarantine{
				SourceIndex: section.SourceIndex, LegacyKey: &section.LegacyKey,
				ReasonCode: "section_fields_quarantined", SafePayload: map[string]any{
					"config_fields":  sortedMapKeys(section.QuarantinedConfig),
					"section_fields": sortedMapKeys(section.QuarantinedSection),
				},
			})
		}
		sectionID, err := upsertShadowSection(exec, source, *section)
		if err != nil {
			return ShadowSyncReport{}, err
		}
		section.ID = sectionID
		if _, err := exec.Exec(
			`UPDATE page_section_instance_items
			 SET source_index = source_index + $2
			 WHERE section_id = $1 AND source_index < $2`, sectionID, shadowSourceIndexOffset,
		); err != nil {
			return ShadowSyncReport{}, fmt.Errorf("stage page shadow items: %w", err)
		}
		for itemIndex := range section.Items {
			if len(section.Items[itemIndex].QuarantinedItem) > 0 {
				quarantine = append(quarantine, ShadowQuarantine{
					SourceIndex: section.SourceIndex, LegacyKey: &section.LegacyKey,
					ReasonCode: "item_fields_quarantined", SafePayload: map[string]any{
						"item_source_index": section.Items[itemIndex].SourceIndex,
						"item_fields":       sortedMapKeys(section.Items[itemIndex].QuarantinedItem),
					},
				})
			}
			itemID, err := upsertShadowItem(exec, sectionID, section.Items[itemIndex])
			if err != nil {
				return ShadowSyncReport{}, err
			}
			section.Items[itemIndex].ID = itemID
			itemCount++
		}
		if _, err := exec.Exec(
			`DELETE FROM page_section_instance_items WHERE section_id = $1 AND source_index >= $2`,
			sectionID, shadowSourceIndexOffset,
		); err != nil {
			return ShadowSyncReport{}, fmt.Errorf("delete stale page shadow items: %w", err)
		}
		missingRefs, err := replaceShadowColorReferences(exec, source.ID, sectionID, section.Shell)
		if err != nil {
			return ShadowSyncReport{}, err
		}
		for _, role := range missingRefs {
			quarantine = append(quarantine, ShadowQuarantine{
				SourceIndex: section.SourceIndex, LegacyKey: &section.LegacyKey,
				ReasonCode: "missing_palette_token", SafePayload: map[string]any{"color_role": role},
			})
		}
	}
	if _, err := exec.Exec(
		`DELETE FROM page_section_instances WHERE page_id = $1 AND source_index >= $2`,
		source.ID, shadowSourceIndexOffset,
	); err != nil {
		return ShadowSyncReport{}, fmt.Errorf("delete stale page shadow sections: %w", err)
	}
	if err := replaceShadowQuarantine(exec, source.ID, quarantine); err != nil {
		return ShadowSyncReport{}, err
	}

	loaded, err := loadPageSectionShadow(exec, source.ID)
	if err != nil {
		return ShadowSyncReport{}, err
	}
	sourceHash, err := shadowDocumentHash(document)
	if err != nil {
		return ShadowSyncReport{}, err
	}
	projected, err := ProjectNormalizedPageContent(loaded)
	if err != nil {
		return ShadowSyncReport{}, err
	}
	projectedDocument, err := NormalizeLegacyPageContent(projected)
	if err != nil {
		return ShadowSyncReport{}, err
	}
	projectionHash, err := shadowDocumentHash(projectedDocument)
	if err != nil {
		return ShadowSyncReport{}, err
	}
	status := "matched"
	mismatchCodes := []string{}
	if sourceHash != projectionHash && len(quarantine) == 0 {
		status = "mismatch"
		mismatchCodes = append(mismatchCodes, "definition_projection_diff")
	} else if len(quarantine) > 0 {
		status = "quarantined"
		if sourceHash != projectionHash {
			mismatchCodes = append(mismatchCodes, "quarantined_projection_diff")
		}
	}
	report := ShadowSyncReport{
		PageID: source.ID, Status: status, SourceHash: sourceHash, ProjectionHash: projectionHash,
		SectionCount: len(document.Sections), ItemCount: itemCount, QuarantineCount: len(quarantine),
		MismatchCodes: mismatchCodes,
	}
	if err := upsertShadowRun(exec, source, document, report); err != nil {
		return ShadowSyncReport{}, err
	}
	return report, nil
}

func upsertShadowSection(exec database.Executor, source *models.Page, section ShadowSection) (int64, error) {
	background, _ := json.Marshal(section.Shell.BackgroundColor)
	textColor, _ := json.Marshal(section.Shell.TextColor)
	h1Color, _ := json.Marshal(section.Shell.H1Color)
	h2Color, _ := json.Marshal(section.Shell.H2Color)
	h3Color, _ := json.Marshal(section.Shell.H3Color)
	config, _ := json.Marshal(section.Config)
	quarantinedConfig, _ := json.Marshal(section.QuarantinedConfig)
	quarantinedSection, _ := json.Marshal(section.QuarantinedSection)
	aliases, _ := json.Marshal(section.AliasRepairs)
	var id int64
	err := exec.QueryRow(
		`INSERT INTO page_section_instances (
			page_id, source_index, legacy_key_kind, legacy_key, original_section_type, section_type,
			display_order, heading, subheading, shell_version, layout, container_width,
			margin_top, margin_right, margin_bottom, margin_left,
			padding_top, padding_right, padding_bottom, padding_left,
			animation, animation_intensity, background_color, text_color, h1_color, h2_color, h3_color,
			content_scale, collapsible, default_collapsed, config_version, config, config_encoding,
			quarantined_config, quarantined_section, alias_repairs, revision, created_at, updated_at
		 ) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
			$20,$21,$22::jsonb,$23::jsonb,$24::jsonb,$25::jsonb,$26::jsonb,$27,$28,$29,$30,$31::jsonb,$32,
			$33::jsonb,$34::jsonb,$35::jsonb,$36,COALESCE(NULLIF($37, '0001-01-01'::timestamp), CURRENT_TIMESTAMP),CURRENT_TIMESTAMP
		 )
		 ON CONFLICT (page_id, legacy_key_kind, legacy_key) DO UPDATE SET
			source_index=EXCLUDED.source_index, original_section_type=EXCLUDED.original_section_type,
			section_type=EXCLUDED.section_type, display_order=EXCLUDED.display_order, heading=EXCLUDED.heading,
			subheading=EXCLUDED.subheading, layout=EXCLUDED.layout, container_width=EXCLUDED.container_width,
			margin_top=EXCLUDED.margin_top, margin_right=EXCLUDED.margin_right, margin_bottom=EXCLUDED.margin_bottom,
			margin_left=EXCLUDED.margin_left, padding_top=EXCLUDED.padding_top, padding_right=EXCLUDED.padding_right,
			padding_bottom=EXCLUDED.padding_bottom, padding_left=EXCLUDED.padding_left, animation=EXCLUDED.animation,
			animation_intensity=EXCLUDED.animation_intensity, background_color=EXCLUDED.background_color,
			text_color=EXCLUDED.text_color, h1_color=EXCLUDED.h1_color, h2_color=EXCLUDED.h2_color,
			h3_color=EXCLUDED.h3_color, content_scale=EXCLUDED.content_scale, collapsible=EXCLUDED.collapsible,
			default_collapsed=EXCLUDED.default_collapsed, config_version=EXCLUDED.config_version,
			config=EXCLUDED.config, config_encoding=EXCLUDED.config_encoding,
			quarantined_config=EXCLUDED.quarantined_config, quarantined_section=EXCLUDED.quarantined_section,
			alias_repairs=EXCLUDED.alias_repairs, revision=EXCLUDED.revision, updated_at=CURRENT_TIMESTAMP
		 RETURNING id`,
		source.ID, section.SourceIndex, section.LegacyKey.Kind, section.LegacyKey.Value,
		section.OriginalSectionType, section.SectionType, section.DisplayOrder, section.Heading, section.Subheading,
		section.Shell.Layout, section.Shell.ContainerWidth,
		section.Shell.MarginTop, section.Shell.MarginRight, section.Shell.MarginBottom, section.Shell.MarginLeft,
		section.Shell.PaddingTop, section.Shell.PaddingRight, section.Shell.PaddingBottom, section.Shell.PaddingLeft,
		section.Shell.Animation, section.Shell.AnimationIntensity, background, textColor, h1Color, h2Color, h3Color,
		section.Shell.ContentScale, section.Shell.Collapsible, section.Shell.DefaultCollapsed,
		section.ConfigVersion, config, section.ConfigEncoding, quarantinedConfig, quarantinedSection, aliases,
		section.Revision, source.CreatedAt,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("upsert page shadow section: %w", err)
	}
	return id, nil
}

func upsertShadowItem(exec database.Executor, sectionID int64, item ShadowItem) (int64, error) {
	config, _ := json.Marshal(item.Config)
	quarantine, _ := json.Marshal(item.QuarantinedItem)
	var id int64
	err := exec.QueryRow(
		`INSERT INTO page_section_instance_items (
			section_id, source_index, legacy_key_kind, legacy_key, display_order, icon, heading, subheading,
			image_url, link_url, config_version, config, config_encoding, quarantined_item, revision
		 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14::jsonb,$15)
		 ON CONFLICT (section_id, legacy_key_kind, legacy_key) DO UPDATE SET
			source_index=EXCLUDED.source_index, display_order=EXCLUDED.display_order, icon=EXCLUDED.icon,
			heading=EXCLUDED.heading, subheading=EXCLUDED.subheading, image_url=EXCLUDED.image_url,
			link_url=EXCLUDED.link_url, config_version=EXCLUDED.config_version, config=EXCLUDED.config,
			config_encoding=EXCLUDED.config_encoding, quarantined_item=EXCLUDED.quarantined_item,
			revision=EXCLUDED.revision, updated_at=CURRENT_TIMESTAMP
		 RETURNING id`,
		sectionID, item.SourceIndex, item.LegacyKey.Kind, item.LegacyKey.Value, item.DisplayOrder,
		item.Icon, item.Heading, item.Subheading, item.ImageURL, item.LinkURL, item.ConfigVersion,
		config, item.ConfigEncoding, quarantine, item.Revision,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("upsert page shadow item: %w", err)
	}
	return id, nil
}

func replaceShadowColorReferences(exec database.Executor, pageID, sectionID int64, shell ShadowSectionShell) ([]string, error) {
	if _, err := exec.Exec(`DELETE FROM page_section_color_references WHERE section_id = $1`, sectionID); err != nil {
		return nil, fmt.Errorf("clear page shadow color references: %w", err)
	}
	colors := map[string]ShadowColorSource{
		"background": shell.BackgroundColor, "text": shell.TextColor, "h1": shell.H1Color,
		"h2": shell.H2Color, "h3": shell.H3Color,
	}
	missing := []string{}
	for role, color := range colors {
		if color.Mode != "palette" {
			continue
		}
		result, err := exec.Exec(
			`INSERT INTO page_section_color_references (section_id, page_id, color_role, token_key)
			 SELECT $1::bigint, $2::bigint, $3::varchar, $4::varchar
			 WHERE EXISTS (SELECT 1 FROM page_theme_tokens WHERE page_id = $2::bigint AND token_key = $4::varchar)`,
			sectionID, pageID, role, color.Token,
		)
		if err != nil {
			return nil, fmt.Errorf("insert page shadow color reference: %w", err)
		}
		count, _ := result.RowsAffected()
		if count == 0 {
			missing = append(missing, role)
		}
	}
	return missing, nil
}

func replaceShadowQuarantine(exec database.Executor, pageID int64, entries []ShadowQuarantine) error {
	if _, err := exec.Exec(`DELETE FROM page_section_quarantine WHERE page_id = $1`, pageID); err != nil {
		return fmt.Errorf("clear page shadow quarantine: %w", err)
	}
	for _, entry := range entries {
		var kind, value any
		if entry.LegacyKey != nil {
			kind, value = entry.LegacyKey.Kind, entry.LegacyKey.Value
		}
		payload, _ := json.Marshal(entry.SafePayload)
		if _, err := exec.Exec(
			`INSERT INTO page_section_quarantine
			 (page_id, source_index, legacy_key_kind, legacy_key, reason_code, safe_payload)
			 VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
			pageID, entry.SourceIndex, kind, value, entry.ReasonCode, payload,
		); err != nil {
			return fmt.Errorf("insert page shadow quarantine: %w", err)
		}
	}
	return nil
}

func upsertShadowRun(exec database.Executor, source *models.Page, document NormalizedShadowDocument, report ShadowSyncReport) error {
	aliases, _ := json.Marshal(document.AliasRepairs)
	defaults, _ := json.Marshal(document.DefaultRepairs)
	mismatches, _ := json.Marshal(report.MismatchCodes)
	_, err := exec.Exec(
		`INSERT INTO page_section_shadow_runs (
			page_id, source_hash, projection_hash, status, section_count, item_count, quarantine_count,
			alias_repairs, default_repairs, mismatch_codes, last_source_updated
		 ) VALUES ($1,$2,$3,$4::varchar,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11)
		 ON CONFLICT (page_id) DO UPDATE SET
			source_hash=EXCLUDED.source_hash, projection_hash=EXCLUDED.projection_hash, status=EXCLUDED.status,
			section_count=EXCLUDED.section_count, item_count=EXCLUDED.item_count,
			quarantine_count=EXCLUDED.quarantine_count, alias_repairs=EXCLUDED.alias_repairs,
			default_repairs=EXCLUDED.default_repairs, mismatch_codes=EXCLUDED.mismatch_codes,
			last_source_updated=EXCLUDED.last_source_updated,
			consecutive_matched_runs=CASE
				WHEN EXCLUDED.status<>'matched' THEN 0
				ELSE page_section_shadow_runs.consecutive_matched_runs END,
			matched_since=CASE
				WHEN EXCLUDED.status<>'matched' THEN NULL
				ELSE page_section_shadow_runs.matched_since END,
			rollback_status=CASE WHEN EXCLUDED.status='matched' THEN page_section_shadow_runs.rollback_status ELSE 'pending' END,
			rollback_drilled_at=CASE WHEN EXCLUDED.status='matched' THEN page_section_shadow_runs.rollback_drilled_at ELSE NULL END,
			cutover_ready_at=CASE WHEN EXCLUDED.status='matched' THEN page_section_shadow_runs.cutover_ready_at ELSE NULL END,
			run_count=page_section_shadow_runs.run_count + 1, last_run_at=CURRENT_TIMESTAMP`,
		source.ID, report.SourceHash, report.ProjectionHash, report.Status, report.SectionCount,
		report.ItemCount, report.QuarantineCount, aliases, defaults, mismatches, source.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert page shadow run: %w", err)
	}
	return nil
}

func loadPageSectionShadow(exec database.Executor, pageID int64) (NormalizedShadowDocument, error) {
	document := NormalizedShadowDocument{}
	rows, err := exec.Query(
		`SELECT id, source_index, legacy_key_kind, legacy_key, original_section_type, section_type,
		        display_order, heading, subheading, layout, container_width,
		        margin_top, margin_right, margin_bottom, margin_left,
		        padding_top, padding_right, padding_bottom, padding_left,
		        animation, animation_intensity, background_color, text_color, h1_color, h2_color, h3_color,
		        content_scale, collapsible, default_collapsed, config_version, config, config_encoding,
		        quarantined_config, quarantined_section, alias_repairs, revision
		 FROM page_section_instances WHERE page_id = $1 ORDER BY source_index`, pageID,
	)
	if err != nil {
		return document, fmt.Errorf("load page shadow sections: %w", err)
	}
	defer rows.Close()
	byID := map[int64]int{}
	for rows.Next() {
		var section ShadowSection
		var background, textColor, h1Color, h2Color, h3Color []byte
		var config, quarantinedConfig, quarantinedSection, aliases []byte
		section.ShellVersion = 1
		if err := rows.Scan(
			&section.ID, &section.SourceIndex, &section.LegacyKey.Kind, &section.LegacyKey.Value,
			&section.OriginalSectionType, &section.SectionType, &section.DisplayOrder, &section.Heading,
			&section.Subheading, &section.Shell.Layout, &section.Shell.ContainerWidth,
			&section.Shell.MarginTop, &section.Shell.MarginRight, &section.Shell.MarginBottom, &section.Shell.MarginLeft,
			&section.Shell.PaddingTop, &section.Shell.PaddingRight, &section.Shell.PaddingBottom, &section.Shell.PaddingLeft,
			&section.Shell.Animation, &section.Shell.AnimationIntensity, &background, &textColor, &h1Color, &h2Color, &h3Color,
			&section.Shell.ContentScale, &section.Shell.Collapsible, &section.Shell.DefaultCollapsed,
			&section.ConfigVersion, &config, &section.ConfigEncoding, &quarantinedConfig, &quarantinedSection,
			&aliases, &section.Revision,
		); err != nil {
			return document, fmt.Errorf("scan page shadow section: %w", err)
		}
		_ = json.Unmarshal(background, &section.Shell.BackgroundColor)
		_ = json.Unmarshal(textColor, &section.Shell.TextColor)
		_ = json.Unmarshal(h1Color, &section.Shell.H1Color)
		_ = json.Unmarshal(h2Color, &section.Shell.H2Color)
		_ = json.Unmarshal(h3Color, &section.Shell.H3Color)
		_ = decodeJSONValue(config, &section.Config)
		_ = decodeJSONValue(quarantinedConfig, &section.QuarantinedConfig)
		_ = decodeJSONValue(quarantinedSection, &section.QuarantinedSection)
		_ = json.Unmarshal(aliases, &section.AliasRepairs)
		byID[section.ID] = len(document.Sections)
		document.Sections = append(document.Sections, section)
	}
	if err := rows.Err(); err != nil {
		return document, err
	}

	itemRows, err := exec.Query(
		`SELECT i.id, i.section_id, i.source_index, i.legacy_key_kind, i.legacy_key,
		        i.display_order, i.icon, i.heading, i.subheading, i.image_url, i.link_url,
		        i.config_version, i.config, i.config_encoding, i.quarantined_item, i.revision
		 FROM page_section_instance_items i
		 JOIN page_section_instances s ON s.id = i.section_id
		 WHERE s.page_id = $1 ORDER BY s.source_index, i.source_index`, pageID,
	)
	if err != nil {
		return document, fmt.Errorf("load page shadow items: %w", err)
	}
	defer itemRows.Close()
	for itemRows.Next() {
		var item ShadowItem
		var sectionID int64
		var config, quarantined []byte
		if err := itemRows.Scan(
			&item.ID, &sectionID, &item.SourceIndex, &item.LegacyKey.Kind, &item.LegacyKey.Value,
			&item.DisplayOrder, &item.Icon, &item.Heading, &item.Subheading, &item.ImageURL, &item.LinkURL,
			&item.ConfigVersion, &config, &item.ConfigEncoding, &quarantined, &item.Revision,
		); err != nil {
			return document, fmt.Errorf("scan page shadow item: %w", err)
		}
		_ = decodeJSONValue(config, &item.Config)
		_ = decodeJSONValue(quarantined, &item.QuarantinedItem)
		if index, ok := byID[sectionID]; ok {
			document.Sections[index].Items = append(document.Sections[index].Items, item)
		}
	}
	return document, itemRows.Err()
}

// BackfillPageSectionShadow processes a bounded ID-ordered page batch. A caller
// can safely resume with NextAfterID; row upserts retain normalized IDs and each
// rerun increments only the content-free run counter.
func BackfillPageSectionShadow(ctx context.Context, exec database.Executor, afterID int64, limit int) (ShadowBackfillResult, error) {
	if limit < 1 || limit > 500 {
		return ShadowBackfillResult{}, fmt.Errorf("shadow backfill limit must be between 1 and 500")
	}
	result := ShadowBackfillResult{AfterID: afterID, NextAfterID: afterID}
	rows, err := exec.QueryContext(ctx,
		`SELECT id FROM pages WHERE id > $1 ORDER BY id LIMIT $2`, afterID, limit,
	)
	if err != nil {
		return result, err
	}
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			_ = rows.Close()
			return result, err
		}
		ids = append(ids, id)
	}
	if err := rows.Close(); err != nil {
		return result, err
	}
	for _, id := range ids {
		var report ShadowSyncReport
		err := database.TransactionalExecutor(ctx, exec, func(tx database.Executor) error {
			page := &models.Page{ID: id}
			if err := tx.QueryRowContext(ctx,
				`SELECT content::text, created_at, updated_at FROM pages WHERE id = $1 FOR UPDATE`, id,
			).Scan(&page.Content, &page.CreatedAt, &page.UpdatedAt); err != nil {
				return err
			}
			var syncErr error
			report, syncErr = syncPageSectionShadow(tx, page)
			return syncErr
		})
		if err != nil {
			return result, fmt.Errorf("backfill page %d shadow: %w", id, err)
		}
		result.Scanned++
		result.NextAfterID = id
		switch report.Status {
		case "matched":
			result.Matched++
		case "quarantined":
			result.Quarantined++
		case "mismatch":
			result.Mismatched++
		}
	}
	result.Done = len(ids) < limit
	return result, nil
}
