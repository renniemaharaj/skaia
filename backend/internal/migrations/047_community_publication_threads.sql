INSERT INTO forum_categories(name,description,display_order,is_pinned,is_locked)
VALUES(
    'Community Discussions',
    'Discussion threads owned by community proposals, showcases, and events.',
    0,
    FALSE,
    FALSE
)
ON CONFLICT(name) DO UPDATE SET
    deleted_at=NULL,
    deleted_by=NULL;

DO $$
DECLARE
    publication RECORD;
    category_id BIGINT;
    thread_owner_id BIGINT;
    thread_deleted_at TIMESTAMPTZ;
    replacement_thread_id BIGINT;
BEGIN
    SELECT id INTO category_id
    FROM forum_categories
    WHERE name='Community Discussions';

    FOR publication IN
        SELECT id,title,author_id,canonical_thread_id,created_at,updated_at,deleted_at,deleted_by
        FROM community_publications
        ORDER BY id
    LOOP
        thread_owner_id := NULL;
        thread_deleted_at := NULL;
        IF publication.canonical_thread_id IS NOT NULL THEN
            SELECT thread.user_id,thread.deleted_at INTO thread_owner_id,thread_deleted_at
            FROM forum_threads thread
            JOIN forum_categories category
              ON category.id=thread.category_id
             AND category.deleted_at IS NULL
            WHERE thread.id=publication.canonical_thread_id;
        END IF;

        IF thread_owner_id IS DISTINCT FROM publication.author_id
           OR (thread_deleted_at IS NULL) IS DISTINCT FROM (publication.deleted_at IS NULL)
           OR EXISTS (
               SELECT 1
               FROM community_publications earlier
               WHERE earlier.id < publication.id
                 AND earlier.canonical_thread_id=publication.canonical_thread_id
           ) THEN
            INSERT INTO forum_threads(
                category_id,user_id,title,content,created_at,updated_at,deleted_at,deleted_by
            ) VALUES(
                category_id,
                publication.author_id,
                publication.title,
                '<p>Discuss this community publication here.</p>',
                publication.created_at,
                publication.updated_at,
                publication.deleted_at,
                publication.deleted_by
            )
            RETURNING id INTO replacement_thread_id;

            UPDATE community_publications
            SET canonical_thread_id=replacement_thread_id
            WHERE id=publication.id;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM community_publications publication
        LEFT JOIN forum_threads thread
         ON thread.id=publication.canonical_thread_id
         AND thread.user_id=publication.author_id
         AND (thread.deleted_at IS NULL)=(publication.deleted_at IS NULL)
        WHERE thread.id IS NULL
    ) THEN
        RAISE EXCEPTION 'community publication thread backfill incomplete';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname='forum_threads_id_user_id_key'
          AND conrelid='forum_threads'::regclass
    ) THEN
        ALTER TABLE forum_threads
            ADD CONSTRAINT forum_threads_id_user_id_key UNIQUE(id,user_id);
    END IF;
END $$;

ALTER TABLE community_publications
    ALTER COLUMN canonical_thread_id SET NOT NULL;

ALTER TABLE community_publications
    DROP CONSTRAINT IF EXISTS community_publications_canonical_thread_id_fkey;

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_publications_canonical_thread_id
    ON community_publications(canonical_thread_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname='community_publications_thread_owner_fkey'
          AND conrelid='community_publications'::regclass
    ) THEN
        ALTER TABLE community_publications
            ADD CONSTRAINT community_publications_thread_owner_fkey
            FOREIGN KEY(canonical_thread_id,author_id)
            REFERENCES forum_threads(id,user_id)
            ON DELETE RESTRICT;
    END IF;
END $$;
