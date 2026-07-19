# ADR 0002: Version-owned content taxonomy

Status: Accepted — 2026-07-19

## Context

Public content resolves a stable `content_item` through `current_published_version_id`. Category and
topic assignments were originally item-owned, so editing a draft could change public navigation and
search metadata while the reader still served the older published document.

## Decision

Category and topic assignments are owned by `content_versions` through
`content_version_categories` and `content_version_topics`. A new draft copies the current published
version's assignments. Draft edits replace only that draft's mappings. Publishing updates the stable
item pointer, search document, catalog change log, and the deprecated item-level compatibility
projection in the same transaction.

All public dashboard, browse, reader, and search queries join taxonomy through the exact current
published version. Search-document refresh uses the target version's mappings.

The legacy `content_item_categories` and `content_item_topics` tables remain temporarily to permit a
backward-compatible rollout. Runtime public readers do not use them, and ordinary draft edits never
write them. A later migration may remove them after every deployed application version understands the
versioned tables.

## Consequences

- Draft metadata cannot leak into public catalog responses.
- Historical versions retain internally consistent taxonomy.
- Publication remains the single atomic visibility boundary.
- The migration backfills every existing version from the only historical information available: the
  legacy item mapping at migration time. This preserves data but cannot recreate taxonomy changes that
  were never historically stored.
