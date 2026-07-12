\set ON_ERROR_STOP on

BEGIN;

SET LOCAL lock_timeout = '30s';
SET LOCAL statement_timeout = '5min';

-- Prevent writes between the zero-row safety check and object removal.
LOCK TABLE
    public.activity_events,
    public.bookmarks,
    public.catalog_release_versions,
    public.catalog_releases,
    public.catalog_sync_change_log,
    public.catalog_sync_counters,
    public.categories,
    public.content_blocks,
    public.content_item_categories,
    public.content_item_topics,
    public.content_items,
    public.content_relations,
    public.content_version_blocks,
    public.content_version_status_history,
    public.content_versions,
    public.device_catalog_sync_state,
    public.device_user_sync_state,
    public.devices,
    public.domains,
    public.practice_attempts,
    public.practice_providers,
    public.practice_resources,
    public.profile_role_grants,
    public.profiles,
    public.review_cards,
    public.review_history,
    public.roles,
    public.sync_mutations,
    public.topic_categories,
    public.topics,
    public.user_notes,
    public.user_progress,
    public.user_sync_change_log,
    public.user_sync_counters
IN ACCESS EXCLUSIVE MODE;

DO $zero_row_guard$
DECLARE
    table_name text;
    row_count bigint;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'activity_events', 'bookmarks', 'catalog_release_versions', 'catalog_releases',
        'catalog_sync_change_log', 'catalog_sync_counters', 'categories', 'content_blocks',
        'content_item_categories', 'content_item_topics', 'content_items', 'content_relations',
        'content_version_blocks', 'content_version_status_history', 'content_versions',
        'device_catalog_sync_state', 'device_user_sync_state', 'devices', 'domains',
        'practice_attempts', 'practice_providers', 'practice_resources',
        'profile_role_grants', 'profiles', 'review_cards', 'review_history', 'roles',
        'sync_mutations', 'topic_categories', 'topics', 'user_notes', 'user_progress',
        'user_sync_change_log', 'user_sync_counters'
    ]
    LOOP
        EXECUTE format('SELECT count(*) FROM public.%I', table_name) INTO row_count;
        IF row_count <> 0 THEN
            RAISE EXCEPTION 'Cleanup refused: public.% contains % row(s)', table_name, row_count;
        END IF;
    END LOOP;
END
$zero_row_guard$;

DROP FUNCTION IF EXISTS public.refresh_content_version_search_document(uuid) RESTRICT;

-- A single allowlisted DROP handles RecallStack's internal FK cycles. CASCADE is
-- permitted only after the external-dependency preflight in the rebuild procedure.
DROP TABLE
    public.activity_events,
    public.bookmarks,
    public.catalog_release_versions,
    public.catalog_releases,
    public.catalog_sync_change_log,
    public.catalog_sync_counters,
    public.categories,
    public.content_blocks,
    public.content_item_categories,
    public.content_item_topics,
    public.content_items,
    public.content_relations,
    public.content_version_blocks,
    public.content_version_status_history,
    public.content_versions,
    public.device_catalog_sync_state,
    public.device_user_sync_state,
    public.devices,
    public.domains,
    public.practice_attempts,
    public.practice_providers,
    public.practice_resources,
    public.profile_role_grants,
    public.profiles,
    public.review_cards,
    public.review_history,
    public.roles,
    public.sync_mutations,
    public.topic_categories,
    public.topics,
    public.user_notes,
    public.user_progress,
    public.user_sync_change_log,
    public.user_sync_counters
CASCADE;

DROP TYPE IF EXISTS public.block_type RESTRICT;
DROP TYPE IF EXISTS public.change_operation RESTRICT;
DROP TYPE IF EXISTS public.content_relation_type RESTRICT;
DROP TYPE IF EXISTS public.content_type RESTRICT;
DROP TYPE IF EXISTS public.difficulty_level RESTRICT;
DROP TYPE IF EXISTS public.learning_status RESTRICT;
DROP TYPE IF EXISTS public.mutation_operation RESTRICT;
DROP TYPE IF EXISTS public.mutation_status RESTRICT;
DROP TYPE IF EXISTS public.note_kind RESTRICT;
DROP TYPE IF EXISTS public.practice_outcome RESTRICT;
DROP TYPE IF EXISTS public.publication_status RESTRICT;
DROP TYPE IF EXISTS public.release_status RESTRICT;
DROP TYPE IF EXISTS public.review_rating RESTRICT;
DROP TYPE IF EXISTS public.topic_kind RESTRICT;

COMMIT;
