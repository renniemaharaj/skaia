-- Retire the unused normalized custom-page experiment. pages.content is the
-- sole custom-page document and interactive-response authority.
--
-- Fail closed if a tenant contains evidence that the experimental tables were
-- ever made authoritative. Shadow projection rows and telemetry are safe to
-- discard; normalized responses and palette tokens require operator review.
DO $$
DECLARE
    response_count BIGINT := 0;
    token_count BIGINT := 0;
BEGIN
    IF to_regclass('public.page_section_responses') IS NOT NULL THEN
        EXECUTE 'SELECT COUNT(*) FROM page_section_responses' INTO response_count;
    END IF;
    IF to_regclass('public.page_theme_tokens') IS NOT NULL THEN
        EXECUTE 'SELECT COUNT(*) FROM page_theme_tokens' INTO token_count;
    END IF;
    IF response_count > 0 OR token_count > 0 THEN
        RAISE EXCEPTION
            'normalized page retirement blocked: % response rows, % palette tokens',
            response_count, token_count
            USING HINT = 'Confirm pages.content is authoritative and reconcile these rows before retrying.';
    END IF;
END
$$;

DROP TABLE IF EXISTS page_section_color_references CASCADE;
DROP TABLE IF EXISTS page_section_response_migrations CASCADE;
DROP TABLE IF EXISTS page_section_shadow_runs CASCADE;
DROP TABLE IF EXISTS page_section_quarantine CASCADE;
DROP TABLE IF EXISTS page_section_responses CASCADE;
DROP TABLE IF EXISTS page_section_instance_items CASCADE;
DROP TABLE IF EXISTS page_section_presets CASCADE;
DROP TABLE IF EXISTS page_theme_tokens CASCADE;
DROP TABLE IF EXISTS page_section_instances CASCADE;
DROP TABLE IF EXISTS page_themes CASCADE;
