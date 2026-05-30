-- Migration: Rename landing_sections/items to page_sections/items
-- This migration renames tables, indexes, and foreign keys as per .todo/migration
-- Wrapped in a DO block to ensure idempotency on fresh databases.

DO $$ 
BEGIN
    -- 1. Rename tables
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'landing_sections') THEN
        ALTER TABLE landing_sections RENAME TO page_sections;
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'landing_items') THEN
        ALTER TABLE landing_items RENAME TO page_items;
    END IF;

    -- 2. Rename indexes
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'idx_landing_sections_order' AND n.nspname = 'public') THEN
        ALTER INDEX idx_landing_sections_order RENAME TO idx_page_sections_order;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'idx_landing_items_section' AND n.nspname = 'public') THEN
        ALTER INDEX idx_landing_items_section RENAME TO idx_page_items_section;
    END IF;

    -- 3. Update foreign key on page_items (was landing_items)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='page_items' AND column_name='section_id') THEN
        ALTER TABLE page_items RENAME COLUMN section_id TO page_section_id;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'landing_items_section_id_fkey') THEN
        ALTER TABLE page_items DROP CONSTRAINT landing_items_section_id_fkey;
        ALTER TABLE page_items ADD CONSTRAINT page_items_page_section_id_fkey FOREIGN KEY (page_section_id) REFERENCES page_sections(id) ON DELETE CASCADE;
    END IF;
END $$;
