-- Migration: Rename landing_sections/items to page_sections/items
-- This migration renames tables, indexes, and foreign keys as per .todo/migration

-- 1. Rename tables
ALTER TABLE landing_sections RENAME TO page_sections;
ALTER TABLE landing_items RENAME TO page_items;

-- 2. Rename indexes
ALTER INDEX idx_landing_sections_order RENAME TO idx_page_sections_order;
ALTER INDEX idx_landing_items_section RENAME TO idx_page_items_section;

-- 3. Update foreign key on page_items (was landing_items)
ALTER TABLE page_items RENAME COLUMN section_id TO page_section_id;
ALTER TABLE page_items DROP CONSTRAINT landing_items_section_id_fkey;
ALTER TABLE page_items ADD CONSTRAINT page_items_page_section_id_fkey FOREIGN KEY (page_section_id) REFERENCES page_sections(id) ON DELETE CASCADE;

-- 4. Update any references in other tables (none found)
-- 5. Update seed/config data if needed (handled in app logic)

-- Note: Update backend code to match new table/column names.
