# Migration and rollback notes

Run upgrades with a dedicated migration credential:

```bash
uv run alembic upgrade head
```

Revisions can be downgraded one logical group at a time with `uv run alembic downgrade -1`. Downgrades
are destructive: dropping a group drops every row in its tables and may drop its PostgreSQL enum types.
Back up production data and rehearse on a restored database before downgrading.

The dependency order means sync must roll back before recall, recall before practice, and so on. The
content downgrade removes the circular published-version ownership foreign key before dropping content
versions. The identity downgrade is last and removes `profiles`; it never modifies Supabase-owned
`auth.users`.

Seed operations are idempotent updates/inserts and have no automatic destructive rollback. Remove seed
rows only after proving no dependent content or role grants reference them.

Revision `20260717_0011` adds a non-null resource-set revision with a default of one and widens two
practice-resource text columns. Its upgrade is backward-compatible. Before downgrading, verify that no
`practice_resources.external_key` exceeds 160 characters and no title exceeds 240 characters; PostgreSQL
will reject the narrowing downgrade if longer values exist. Export or shorten those values deliberately
before running `uv run alembic downgrade 20260711_0010`. The downgrade then removes
`content_items.practice_resources_revision`, so clients holding a resource revision must perform a full
resource-set refresh after any later re-upgrade.
