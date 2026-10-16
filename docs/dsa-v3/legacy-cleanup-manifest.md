# Legacy cleanup manifest

## Migrated

- `app/(app)/dsa/page.tsx`: topic-first dashboard, server legacy-query resolution.
- `app/(app)/dsa/problem/[slug]/page.tsx`: canonical Monaco workspace, exact version.
- `app/(app)/dsa/library/page.tsx`: compatibility redirect, no second dashboard.
- `[categoryId]/page.tsx` -> `[topicSlug]/page.tsx`: boards and UUID redirect.
- `features/dsa/components/DSAProblemScreen.tsx`: compatibility forwarder only;
  removed the duplicate legacy workspace, editor/tutor layout and ephemeral code.
  Generic StudyNoteScreen's existing import now forwards DSA to canonical routing.
- `workspace/Workspace.tsx`: canonical links and contextual breadcrumbs.
- `workspace/LearnerPanel.tsx`: retained practice tracking entry point alongside
  existing notes and self-assessed progress.

## Retained intentionally

- Shared catalog dashboard/category-content components: reusable outside this
  route migration; do not delete shared infrastructure on name matching alone.
- Practice, notes, bookmark, tutor, visual lesson and generic content components.
- Canonical backend IDs, public APIs, source data and historical practice records.
- Draft storage schema/keys and version/account/language isolation.

## Regression requirements

Replace assertions against retired screen controls with canonical equivalents;
retain tutor streaming/abort/safe Markdown/visual coverage. Test all legacy URL
shapes, exact version links, drafts, learner writes, filters, metadata failures,
pagination, keyboard/pointer ordering, conflicts and narrow browser layouts.
