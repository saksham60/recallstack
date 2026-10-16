-- PROPOSED V3 contract. Separate Supabase owner must review/apply.
-- No seed data, publication changes, certificate changes or fixture approvals.
create schema if not exists dsa_v3_private;
revoke all on schema dsa_v3_private from public, anon;
grant usage on schema dsa_v3_private to authenticated;

-- Reuse installed explorer boards; these columns add the category workspace snapshot.
-- Legacy boards, cards, lanes and settings remain untouched.
alter table public.dsa_explorer_boards
  add column v3_category_id uuid references public.categories(id) on delete restrict,
  add column v3_layout jsonb check(v3_layout is null or coalesce(
    jsonb_typeof(v3_layout)='object' and v3_layout->>'schema'='1'
    and jsonb_typeof(v3_layout->'lanes')='object'
    and jsonb_typeof(v3_layout->'collections')='array'
    and octet_length(v3_layout::text)<=65536,false)),
  add constraint dsa_explorer_v3_pair check((v3_category_id is null)=(v3_layout is null));
create unique index dsa_explorer_v3_category on public.dsa_explorer_boards(user_id,v3_category_id)
  where v3_category_id is not null;
create view public.dsa_personal_boards with(security_invoker=true) as
 select user_id,v3_category_id category_id,revision row_version,v3_layout layout,updated_at
 from public.dsa_explorer_boards where v3_category_id is not null;
revoke all on public.dsa_personal_boards from public,anon,authenticated;
grant select,insert,update,delete on public.dsa_personal_boards to authenticated;

create function dsa_v3_private.write_board() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_revision bigint;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if tg_op='DELETE' then
   if old.user_id<>v_user then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
   delete from public.dsa_explorer_boards where user_id=v_user and v3_category_id=old.category_id
     and revision=old.row_version;
   if not found then return null; end if;
   return old;
 end if;
 if new.user_id<>v_user then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
 if tg_op='INSERT' then
   if new.row_version<>1 then raise exception 'INVALID_REVISION' using errcode='23514'; end if;
   insert into public.dsa_explorer_boards(user_id,title,grouping,layout,v3_category_id,v3_layout)
   values(v_user,'DSA topic board','topic','board',new.category_id,new.layout)
   returning revision into v_revision;
 else
   if new.user_id<>old.user_id or new.category_id<>old.category_id or new.row_version<>old.row_version+1 then
     raise exception 'INVALID_REVISION_OR_OWNER' using errcode='23514'; end if;
   update public.dsa_explorer_boards set v3_layout=new.layout,revision=revision+1,updated_at=now()
   where user_id=v_user and v3_category_id=old.category_id and revision=old.row_version
   returning revision into v_revision;
   if not found then return null; end if;
 end if;
 new.row_version:=v_revision; new.updated_at:=now(); return new;
end $$;
revoke all on function dsa_v3_private.write_board() from public,anon,authenticated;
create trigger dsa_v3_board_write instead of insert or update or delete on public.dsa_personal_boards
 for each row execute function dsa_v3_private.write_board();

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
-- Reuse the installed canonical company/alias/source associations. Do not
-- create a competing company table or change the original review evidence.
create function public.dsa_v3_board_companies(p_versions uuid[], p_offset integer default 0)
returns table(problem_version_id uuid,slug text,name text,review_status text)
language sql stable security definer set search_path='' as $$
  select distinct v.id,c.slug,c.canonical_name,
    case when src.review_status in ('approved','reviewed') then 'reviewed' else 'imported' end
  from public.dsa_problem_versions v
  join public.dsa_problem_definitions def on def.id=v.definition_id and def.current_version_id=v.id
  join public.dsa_problem_companies pc on pc.definition_id=def.id
  join public.dsa_companies c on c.id=pc.company_id and c.review_status='approved'
  join public.dsa_problem_company_sources src on src.definition_id=pc.definition_id and src.source_block_id=pc.source_block_id
  where (select auth.uid()) is not null and cardinality(p_versions) between 1 and 1000
    and p_offset between 0 and 9500 and v.id=any(p_versions)
    and dsa_v3_private.visible_version(v.id)
    and src.review_status in ('approved','reviewed','auto_exact','auto_delimited','auto_segmented')
  order by v.id,c.slug,c.canonical_name,4 limit 500 offset greatest(p_offset,0);
$$;
revoke all on function public.dsa_v3_board_companies(uuid[],integer) from public,anon,authenticated;
grant execute on function public.dsa_v3_board_companies(uuid[],integer) to authenticated;
grant all on public.dsa_personal_boards to service_role;
