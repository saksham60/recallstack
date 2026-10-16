-- PROPOSED V3 contract. Separate Supabase owner must review/apply.
-- No seed data, publication changes, certificate changes or fixture approvals.
create schema if not exists dsa_v3_private;
revoke all on schema dsa_v3_private from public, anon;
grant usage on schema dsa_v3_private to authenticated;

create table public.dsa_personal_boards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  row_version bigint not null default 1 check (row_version > 0),
  layout jsonb not null check (coalesce(
    jsonb_typeof(layout) = 'object' and layout->>'schema' = '1'
    and jsonb_typeof(layout->'lanes') = 'object'
    and jsonb_typeof(layout->'collections') = 'array'
    and octet_length(layout::text) <= 65536,
    false
  )),
  updated_at timestamptz not null default now(),
  primary key (user_id, category_id)
);
create index dsa_personal_boards_category_idx on public.dsa_personal_boards(category_id);
alter table public.dsa_personal_boards enable row level security;
revoke all on public.dsa_personal_boards from public, anon, authenticated;
grant select, insert, update, delete on public.dsa_personal_boards to authenticated;
create policy dsa_board_select on public.dsa_personal_boards for select to authenticated
  using (user_id = (select auth.uid()));
create policy dsa_board_insert on public.dsa_personal_boards for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy dsa_board_update on public.dsa_personal_boards for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy dsa_board_delete on public.dsa_personal_boards for delete to authenticated
  using (user_id = (select auth.uid()));

create function dsa_v3_private.check_board_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.row_version <> 1 then
    raise exception 'board revision must start at 1' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.category_id <> old.category_id
    or new.row_version <> old.row_version + 1) then
    raise exception 'invalid board revision or owner change' using errcode = '23514';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function dsa_v3_private.check_board_revision() from public, anon, authenticated;
create trigger dsa_board_revision before insert or update on public.dsa_personal_boards
  for each row execute function dsa_v3_private.check_board_revision();

create table public.dsa_companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 120)
);
create table public.dsa_problem_company_tags (
  problem_version_id uuid not null references public.dsa_problem_versions(id),
  company_id uuid not null references public.dsa_companies(id),
  reviewed boolean not null default false,
  source_url text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  primary key (problem_version_id, company_id),
  check (not reviewed or (reviewed_by is not null and reviewed_at is not null and source_url is not null))
);
create index dsa_company_tags_company_idx on public.dsa_problem_company_tags(company_id, problem_version_id);
alter table public.dsa_companies enable row level security;
alter table public.dsa_problem_company_tags enable row level security;
revoke all on public.dsa_companies, public.dsa_problem_company_tags from public, anon, authenticated;
grant select on public.dsa_companies to authenticated;
grant select (problem_version_id, company_id, reviewed) on public.dsa_problem_company_tags to authenticated;

-- Narrow boolean lookup is needed because raw version JSON contains private
-- oracle/provenance material and must never be granted to authenticated clients.
-- This private schema is NOT a PostgREST exposed schema.
create function dsa_v3_private.visible_version(p_version uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.dsa_problem_versions v
    join public.dsa_problem_definitions def on def.id = v.definition_id and def.current_version_id = v.id
    join public.content_items i on i.id = def.content_item_id
    join public.content_versions b on b.id = i.current_published_version_id and b.content_item_id = i.id
    join public.domains d on d.id = i.domain_id
    where v.id = p_version and v.status = 'published'
      and v.provenance #> '{quality_review_20261015,publish_approved}' = 'true'::jsonb
      and i.archived_at is null and i.type::text = 'problem'
      and b.status::text = 'published' and b.published_at is not null
      and d.slug = 'dsa' and d.is_active
  );
$$;
revoke all on function dsa_v3_private.visible_version(uuid) from public, anon, authenticated;
grant execute on function dsa_v3_private.visible_version(uuid) to authenticated;
create policy dsa_companies_read on public.dsa_companies for select to authenticated using (true);
create policy dsa_company_tags_read on public.dsa_problem_company_tags for select to authenticated
  using (reviewed and dsa_v3_private.visible_version(problem_version_id));
grant all on public.dsa_personal_boards, public.dsa_companies, public.dsa_problem_company_tags to service_role;
