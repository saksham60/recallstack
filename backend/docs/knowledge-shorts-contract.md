# Knowledge persistence contract

Externally owned by the Supabase schema task; no backend migration is included.
User-owned rows reference the existing `profiles.id`. All timestamps are timezone-aware.

## `knowledge_sources`

```text
id                  UUID PK
key                 VARCHAR(80) UNIQUE NOT NULL
name                VARCHAR(160) NOT NULL
source_type         VARCHAR(40) NOT NULL
homepage_url        TEXT NULL
enabled             BOOLEAN NOT NULL DEFAULT true
quality_weight      NUMERIC(5,4) NOT NULL DEFAULT 1.0
created_at          TIMESTAMPTZ NOT NULL
updated_at          TIMESTAMPTZ NOT NULL
```

Constraints:

```text
0 <= quality_weight <= 1
```

Examples of `source_type`:

```text
web
hacker_news
rss
arxiv
official_blog
```

---

## `knowledge_stories`

```text
id                  UUID PK

source_id           UUID NOT NULL
                    FK -> knowledge_sources.id
                    ON DELETE RESTRICT

external_id         VARCHAR(255) NULL

canonical_url       TEXT NOT NULL
canonical_hash      VARCHAR(64) NOT NULL UNIQUE

title               VARCHAR(500) NOT NULL
summary             TEXT NOT NULL
why_it_matters      TEXT NOT NULL

bullets             TEXT[] NOT NULL DEFAULT '{}'

image_url           TEXT NOT NULL
image_key           TEXT NOT NULL UNIQUE

published_at        TIMESTAMPTZ NOT NULL
discovered_at       TIMESTAMPTZ NOT NULL

importance_score    NUMERIC(5,4) NOT NULL
quality_score       NUMERIC(5,4) NOT NULL

status              VARCHAR(20) NOT NULL DEFAULT 'active'

created_at          TIMESTAMPTZ NOT NULL
updated_at          TIMESTAMPTZ NOT NULL
```

Valid status values:

```text
active
expired
rejected
```

Constraints:

```text
0 <= importance_score <= 1
0 <= quality_score <= 1

cardinality(bullets) <= 3
```

When `external_id` is present:

```text
UNIQUE(source_id, external_id)
```

Feed must ALWAYS additionally enforce:

```text
status = 'active'
published_at >= now() - interval '7 days'
```

regardless of whether cleanup has executed.

Indexes required:

```text
(status, published_at DESC)

(status, importance_score DESC, published_at DESC)

(source_id, status, published_at DESC)
```

Do not rely on scanning the whole table.

---

## `knowledge_story_topics`

```text
story_id            UUID NOT NULL
                    FK -> knowledge_stories.id
                    ON DELETE CASCADE

topic               VARCHAR(80) NOT NULL

confidence          NUMERIC(5,4) NOT NULL DEFAULT 1.0
```

Primary key:

```text
(story_id, topic)
```

Constraint:

```text
0 <= confidence <= 1
```

Index:

```text
(topic, story_id)
```

Normalize topic values in application code.

---

## `user_knowledge_preferences`

```text
profile_id          UUID PK
                    FK -> profiles.id
                    ON DELETE CASCADE

minimum_importance  NUMERIC(5,4) NOT NULL DEFAULT 0

created_at          TIMESTAMPTZ NOT NULL
updated_at          TIMESTAMPTZ NOT NULL
```

Constraint:

```text
0 <= minimum_importance <= 1
```

Do not put arbitrary LLM memory JSON in this table.

---

## `user_knowledge_topics`

```text
profile_id          UUID NOT NULL
                    FK -> profiles.id
                    ON DELETE CASCADE

topic               VARCHAR(80) NOT NULL

weight              NUMERIC(6,4) NOT NULL DEFAULT 1.0
blocked             BOOLEAN NOT NULL DEFAULT false

created_at          TIMESTAMPTZ NOT NULL
updated_at          TIMESTAMPTZ NOT NULL
```

Primary key:

```text
(profile_id, topic)
```

Use explicit topic preferences for deterministic ranking.

---

## `user_knowledge_sources`

```text
profile_id          UUID NOT NULL
                    FK -> profiles.id
                    ON DELETE CASCADE

source_id           UUID NOT NULL
                    FK -> knowledge_sources.id
                    ON DELETE CASCADE

enabled             BOOLEAN NOT NULL DEFAULT true
weight              NUMERIC(6,4) NOT NULL DEFAULT 1.0

created_at          TIMESTAMPTZ NOT NULL
updated_at          TIMESTAMPTZ NOT NULL
```

Primary key:

```text
(profile_id, source_id)
```

---

## `user_story_events`

Raw short-lived event history.

```text
id                  UUID PK
                    supplied/generated as event ID

profile_id          UUID NOT NULL
                    FK -> profiles.id
                    ON DELETE CASCADE

story_id            UUID NOT NULL
                    FK -> knowledge_stories.id
                    ON DELETE CASCADE

event_type          VARCHAR(30) NOT NULL

occurred_at         TIMESTAMPTZ NOT NULL
created_at          TIMESTAMPTZ NOT NULL
```

Allowed event types:

```text
VIEW
OPEN
SAVE
UNSAVE
HIDE
UNHIDE
SHARE
ASK_REASONAI
```

`id` acts as the idempotency key for client retries.

Indexes:

```text
(profile_id, story_id, occurred_at DESC)

(profile_id, occurred_at DESC)
```

When a story is removed after seven days its raw event rows disappear through cascade.

---

## `user_story_state`

Add this table specifically for the low-latency read path.

Do NOT reconstruct current state by aggregating `user_story_events` on every feed request.

```text
profile_id          UUID NOT NULL
                    FK -> profiles.id
                    ON DELETE CASCADE

story_id            UUID NOT NULL
                    FK -> knowledge_stories.id
                    ON DELETE CASCADE

seen_at             TIMESTAMPTZ NULL

saved               BOOLEAN NOT NULL DEFAULT false
hidden              BOOLEAN NOT NULL DEFAULT false

updated_at          TIMESTAMPTZ NOT NULL
```

Primary key:

```text
(profile_id, story_id)
```

Stateful events update this projection transactionally:

```text
VIEW      -> seen_at
SAVE      -> saved=true
UNSAVE    -> saved=false
HIDE      -> hidden=true
UNHIDE    -> hidden=false
```

`user_story_events` = history/telemetry.

`user_story_state` = cheap current-state lookup for feed serving.

Both disappear naturally when the seven-day story disappears.

---

