# RecallStack schema implementation

The seven Alembic revisions implement all 34 approved public tables from
`recallstack_final_supabase.dbml` in dependency order: identity, catalog/taxonomy, content, learning,
practice, recall, and sync. Every timestamp is timezone-aware and every application identifier is UUID
unless the approved schema specifies a compact integer identity.

## Explicit PostgreSQL features

The schema remains portable across PostgreSQL providers. It intentionally uses PostgreSQL-native UUID
generation (`gen_random_uuid()`), JSONB, tsvector/GIN search, enum types, regular-expression checks, and
partial indexes. These are PostgreSQL features, not Supabase APIs.

One vendor-managed relationship is isolated in the identity migration:
`public.profiles.id -> auth.users.id`. Application repositories never query `auth.users`; they insert the
verified authentication subject into `profiles` and let the adapter-level foreign key enforce identity.
For a non-Supabase PostgreSQL deployment, the identity adapter migration must provide an equivalent
principal table or replace that single foreign key. No other table depends on a vendor schema.
Docker Compose supplies a minimal local identity-provider stub under `docker/postgres-init`; application
repositories still never query it.

The requested integrity additions beyond the literal DBML are:

- `uq_content_item_topics_one_primary`: at most one primary topic per content item.
- `uq_practice_resources_one_primary`: at most one active primary practice resource per content item.
- filtered due-card, active-note, deleted-note, and public-content indexes.
- indexes supporting every foreign-key lookup, including composite same-domain keys.

These constraints enforce “at most one.” Requiring exactly one would prevent legitimate draft or
partially-authored content and is therefore enforced by future publish workflows, not raw inserts.

`activity_events`, `practice_attempts`, `review_history`, and change logs are append-only by application
contract. PostgreSQL does not have a portable declarative append-only constraint. Production runtime
roles should receive INSERT/SELECT but not UPDATE/DELETE privileges on those tables; Alembic/migration
roles retain ownership for operations and rollback.

## Admin content concurrency and publication

`content_versions.row_version` protects draft edits and workflow transitions. The admin application
locks the version and also applies a compare-and-swap update, so concurrent writers cannot silently
overwrite one another. Immutable content blocks are deduplicated by canonical JSON payload hash; draft
updates replace only the draft's ordered block links and never update existing block records.

Practice resources are stable item-level links rather than versioned document data. Their active set is
replaced atomically using `content_items.practice_resources_revision`. Existing resources omitted from
the submitted set receive `archived_at`; they are not deleted. The revision starts at one and increments
once per successful replacement. The API permits 255-character provider keys and 300-character titles,
matching the widened PostgreSQL columns in revision `20260717_0011`.

Publication requires an in-review version, a non-empty title, at least one block, and exactly one primary
topic when topics are assigned. The transaction sets direct reviewer/publisher attribution, advances the
current-published-version pointer, appends workflow history, and refreshes the PostgreSQL search vector.

## Category dashboard semantics

The dashboard returns direct category assignments only; parent categories do not recursively absorb
descendant content. Categories are an administrator-curated, domain-bounded taxonomy, so the dashboard
is deliberately unpaginated. Missing progress and explicit `new` progress are “not started.” Progress
percentage is the percentage of published, non-archived items whose status moved beyond `new`.
