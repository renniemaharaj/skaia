ALTER TABLE community_publications
    ADD COLUMN IF NOT EXISTS page_id BIGINT REFERENCES pages(id) ON DELETE RESTRICT;

DO $$
DECLARE
    publication RECORD;
    document JSONB;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema=current_schema()
          AND table_name='community_publications'
          AND column_name='body'
    ) THEN
        FOR publication IN EXECUTE
            'SELECT id,kind,slug,title,summary,body,author_id,visibility,publication_status,created_at,updated_at
             FROM community_publications WHERE page_id IS NULL'
        LOOP
            BEGIN
                document := CASE
                    WHEN publication.body IS NULL OR btrim(publication.body)='' THEN '[]'::jsonb
                    ELSE publication.body::jsonb
                END;
                IF jsonb_typeof(document) <> 'array' THEN
                    RAISE EXCEPTION 'not a page document';
                END IF;
            EXCEPTION WHEN OTHERS THEN
                document := jsonb_build_array(jsonb_build_object(
                    'id','community-body-'||publication.id,
                    'display_order',1,
                    'section_type','rich_text',
                    'heading','',
                    'subheading','',
                    'config',jsonb_build_object('content',COALESCE(publication.body,''))::text,
                    'items','[]'::jsonb
                ));
            END;
            INSERT INTO pages(slug,title,description,content,owner_id,visibility,created_at,updated_at)
            VALUES(
                'community-'||publication.kind||'-'||publication.slug,
                publication.title,
                publication.summary,
                document,
                publication.author_id,
                CASE WHEN publication.visibility='public' AND publication.publication_status='published'
                     THEN 'public' ELSE 'private' END,
                publication.created_at,
                publication.updated_at
            );
        END LOOP;
        UPDATE community_publications p
        SET page_id=pg.id
        FROM pages pg
        WHERE p.page_id IS NULL
          AND pg.slug='community-'||p.kind||'-'||p.slug;
        IF EXISTS (SELECT 1 FROM community_publications WHERE page_id IS NULL) THEN
            RAISE EXCEPTION 'community custom-page backfill incomplete';
        END IF;
        ALTER TABLE community_publications DROP COLUMN body;
    END IF;
END $$;

ALTER TABLE community_publications ALTER COLUMN page_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_publications_page_id
    ON community_publications(page_id);
