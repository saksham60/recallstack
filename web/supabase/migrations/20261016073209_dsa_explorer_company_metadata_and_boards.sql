
-- ReasonAI DSA explorer v1. Additive: no modifications to legacy notes/progress or execution gate.
create table public.dsa_companies (
 id uuid primary key default gen_random_uuid(),
 canonical_name text not null check (char_length(canonical_name) between 2 and 120),
 slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
 review_status text not null default 'approved' check(review_status in ('approved','needs_review','rejected')),
 created_at timestamptz not null default now(),
 unique(canonical_name)
);
create table public.dsa_company_aliases (
 id uuid primary key default gen_random_uuid(),
 company_id uuid references public.dsa_companies(id) on delete restrict,
 alias text not null check (char_length(alias) between 1 and 160),
 review_status text not null default 'needs_review'
   check(review_status in ('approved','needs_review','rejected')),
 reviewer_note text,
 reviewed_at timestamptz,
 unique(alias),
 check (review_status <> 'approved' or company_id is not null)
);
create unique index dsa_company_aliases_normalized_uq on public.dsa_company_aliases(lower(btrim(alias)));
create table public.dsa_problem_company_sources (
 definition_id uuid not null references public.dsa_problem_definitions(id) on delete cascade,
 source_block_id uuid not null references public.content_blocks(id),
 raw_companies text not null,
 source_metadata jsonb not null,
 review_status text not null default 'needs_review'
   check(review_status in ('auto_exact','auto_delimited','needs_review','reviewed')),
 reviewer_note text,
 updated_at timestamptz not null default now(),
 primary key(definition_id,source_block_id),
 check (jsonb_typeof(source_metadata)='object')
);
create index dsa_company_sources_review_idx on public.dsa_problem_company_sources(review_status,definition_id);
create table public.dsa_problem_companies (
 definition_id uuid not null references public.dsa_problem_definitions(id) on delete cascade,
 company_id uuid not null references public.dsa_companies(id),
 source_block_id uuid not null references public.content_blocks(id),
 match_method text not null check(match_method in ('exact','explicit_plus','manual_review')),
 raw_alias text not null,
 created_at timestamptz not null default now(),
 primary key(definition_id,company_id),
 foreign key(definition_id,source_block_id)
   references public.dsa_problem_company_sources(definition_id,source_block_id)
);
create index dsa_problem_companies_company_idx on public.dsa_problem_companies(company_id,definition_id);
-- Canonical seed is an explicit conservative dictionary, not machine-inferred affiliations.
insert into public.dsa_companies(canonical_name,slug) values
 ('Amazon','amazon'),('Google','google'),('Microsoft','microsoft'),('Adobe','adobe'),
 ('Apple','apple'),('Samsung','samsung'),('Flipkart','flipkart'),('Visa','visa'),
 ('Goldman Sachs','goldman-sachs'),('Morgan Stanley','morgan-stanley'),
 ('Qualcomm','qualcomm'),('Uber','uber'),('Cisco Networking Academy','cisco-networking-academy'),
 ('IBM','ibm'),('Intuit','intuit'),('Zoho','zoho'),('Snapdeal','snapdeal'),
 ('Facebook','facebook'),('Ola','ola'),('Accolite','accolite'),('FactSet','factset'),
 ('MakeMyTrip','makemytrip'),('Paytm','paytm'),('Hike','hike'),('Directi','directi'),
 ('Codenation','codenation'),('Oyo','oyo'),('Payu','payu'),('Netflix','netflix'),
 ('LinkedIn','linkedin'),('Times Internet','times-internet'),('Wipro','wipro'),
 ('Infosys','infosys'),('TCS','tcs');
insert into public.dsa_company_aliases(company_id,alias,review_status)
select id,canonical_name,'approved' from public.dsa_companies;
-- Preserve the ORIGINAL string and original source JSON exactly, only from current published content.
insert into public.dsa_problem_company_sources(definition_id,source_block_id,raw_companies,source_metadata)
select distinct d.id,b.id,b.payload #>> '{source,companies}',b.payload->'source'
from public.dsa_problem_definitions d
join public.content_items i on i.id=d.content_item_id
join public.content_versions v on v.id=i.current_published_version_id
join public.content_version_blocks vb on vb.content_version_id=v.id
join public.content_blocks b on b.id=vb.content_block_id
where jsonb_typeof(b.payload #> '{source,companies}')='string'
 and nullif(btrim(b.payload #>> '{source,companies}'),'') is not null;
-- Only match FULL original strings or tokens separated by an EXPLICIT '+' delimiter.
-- Ambiguous whitespace-only multi-company strings remain in review queue.
with tokenized as (
 select s.definition_id,s.source_block_id,s.raw_companies,
        trim(t.part) as token,
        cardinality(regexp_split_to_array(s.raw_companies,'[[:space:]]*[+][[:space:]]*')) as part_count
 from public.dsa_problem_company_sources s
 cross join lateral regexp_split_to_table(s.raw_companies,'[[:space:]]*[+][[:space:]]*') t(part)
), resolved as (
 select t.*,a.company_id,
        count(*) over(partition by definition_id,source_block_id) as total_parts,
        count(a.company_id) over(partition by definition_id,source_block_id) as resolved_parts
 from tokenized t
 left join public.dsa_company_aliases a
  on lower(a.alias)=lower(t.token) and a.review_status='approved'
)
insert into public.dsa_problem_companies(definition_id,company_id,source_block_id,match_method,raw_alias)
select distinct on(definition_id,company_id) definition_id,company_id,source_block_id,
       case when part_count=1 then 'exact' else 'explicit_plus' end,token
from resolved where company_id is not null and total_parts=resolved_parts
order by definition_id,company_id,source_block_id;
update public.dsa_problem_company_sources s
set review_status=case
 when s.raw_companies like '%+%' and exists (select 1 from public.dsa_problem_companies x
      where x.definition_id=s.definition_id and x.source_block_id=s.source_block_id) then 'auto_delimited'
 when exists (select 1 from public.dsa_problem_companies x
      where x.definition_id=s.definition_id and x.source_block_id=s.source_block_id) then 'auto_exact'
 else 'needs_review' end;

create table public.dsa_explorer_boards (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 1 and 120),
 grouping text not null default 'topic' check(grouping in ('topic','difficulty','company','custom','none')),
 layout text not null default 'board' check(layout in ('board','list','grid')),
 settings jsonb not null default '{}'::jsonb check(jsonb_typeof(settings)='object' and octet_length(settings::text)<=16384),
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,user_id)
);
create index dsa_explorer_boards_user_updated_idx on public.dsa_explorer_boards(user_id,updated_at desc);
create table public.dsa_explorer_lanes (
 id uuid primary key default gen_random_uuid(),
 board_id uuid not null,
 user_id uuid not null,
 title text not null check(char_length(btrim(title)) between 1 and 120),
 position integer not null default 0 check(position between 0 and 9999),
 group_key text check(group_key is null or char_length(group_key)<=160),
 created_at timestamptz not null default now(),
 foreign key(board_id,user_id) references public.dsa_explorer_boards(id,user_id) on delete cascade,
 unique(id,board_id,user_id)
);
create index dsa_explorer_lanes_board_order_idx on public.dsa_explorer_lanes(board_id,position,id);
create table public.dsa_explorer_cards (
 board_id uuid not null,
 user_id uuid not null,
 problem_id uuid not null references public.dsa_problem_definitions(id),
 lane_id uuid not null,
 position integer not null default 0 check(position between 0 and 9999),
 added_at timestamptz not null default now(),
 primary key(board_id,problem_id),
 foreign key(board_id,user_id) references public.dsa_explorer_boards(id,user_id) on delete cascade,
 foreign key(lane_id,board_id,user_id) references public.dsa_explorer_lanes(id,board_id,user_id) on delete cascade
);
create index dsa_explorer_cards_order_idx on public.dsa_explorer_cards(board_id,lane_id,position,problem_id);
create table public.dsa_explorer_view_state (
 user_id uuid primary key references auth.users(id) on delete cascade,
 last_board_id uuid,
 preferences jsonb not null default '{}'::jsonb check(jsonb_typeof(preferences)='object' and octet_length(preferences::text)<=16384),
 updated_at timestamptz not null default now(),
 foreign key(last_board_id,user_id) references public.dsa_explorer_boards(id,user_id) on delete set null (last_board_id)
);
create table public.dsa_explorer_mutations (
 board_id uuid not null,
 user_id uuid not null,
 mutation_id uuid not null,
 fingerprint text not null,
 revision bigint not null,
 applied_at timestamptz not null default now(),
 primary key(board_id,mutation_id),
 foreign key(board_id,user_id) references public.dsa_explorer_boards(id,user_id) on delete cascade
);
create index dsa_explorer_mutations_applied_idx on public.dsa_explorer_mutations(board_id,applied_at desc);
-- Explicit protection for every new public table; metadata is read-only to clients.
alter table public.dsa_companies enable row level security;
alter table public.dsa_company_aliases enable row level security;
alter table public.dsa_problem_company_sources enable row level security;
alter table public.dsa_problem_companies enable row level security;
alter table public.dsa_explorer_boards enable row level security;
alter table public.dsa_explorer_lanes enable row level security;
alter table public.dsa_explorer_cards enable row level security;
alter table public.dsa_explorer_view_state enable row level security;
alter table public.dsa_explorer_mutations enable row level security;
create policy dsa_companies_read on public.dsa_companies for select to anon,authenticated using (review_status='approved');
create policy dsa_problem_companies_read on public.dsa_problem_companies for select to anon,authenticated using (true);
create policy dsa_boards_read on public.dsa_explorer_boards for select to authenticated using(user_id=(select auth.uid()));
create policy dsa_boards_insert on public.dsa_explorer_boards for insert to authenticated with check(user_id=(select auth.uid()));
create policy dsa_boards_update on public.dsa_explorer_boards for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy dsa_boards_delete on public.dsa_explorer_boards for delete to authenticated using(user_id=(select auth.uid()));
create policy dsa_lanes_read on public.dsa_explorer_lanes for select to authenticated using(user_id=(select auth.uid()));
create policy dsa_lanes_insert on public.dsa_explorer_lanes for insert to authenticated with check(user_id=(select auth.uid()));
create policy dsa_lanes_update on public.dsa_explorer_lanes for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy dsa_lanes_delete on public.dsa_explorer_lanes for delete to authenticated using(user_id=(select auth.uid()));
create policy dsa_cards_read on public.dsa_explorer_cards for select to authenticated using(user_id=(select auth.uid()));
create policy dsa_cards_insert on public.dsa_explorer_cards for insert to authenticated with check(user_id=(select auth.uid()));
create policy dsa_cards_delete on public.dsa_explorer_cards for delete to authenticated using(user_id=(select auth.uid()));
create policy dsa_view_read on public.dsa_explorer_view_state for select to authenticated using(user_id=(select auth.uid()));
create policy dsa_view_insert on public.dsa_explorer_view_state for insert to authenticated with check(user_id=(select auth.uid()));
create policy dsa_view_update on public.dsa_explorer_view_state for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy dsa_view_delete on public.dsa_explorer_view_state for delete to authenticated using(user_id=(select auth.uid()));
grant select on public.dsa_companies,public.dsa_problem_companies to anon,authenticated;
grant select,insert,update,delete on public.dsa_explorer_boards,public.dsa_explorer_lanes,public.dsa_explorer_view_state to authenticated;
grant select,insert,delete on public.dsa_explorer_cards to authenticated;
grant all on public.dsa_companies,public.dsa_company_aliases,public.dsa_problem_company_sources,
 public.dsa_problem_companies,public.dsa_explorer_boards,public.dsa_explorer_lanes,
 public.dsa_explorer_cards,public.dsa_explorer_view_state,public.dsa_explorer_mutations to service_role;

-- Card movement is a single serializable-by-board transaction with optimistic revision + dedupe.
create function public.dsa_explorer_move_card(
 p_board_id uuid,p_problem_id uuid,p_target_lane_id uuid,p_position integer,
 p_expected_revision bigint,p_mutation_id uuid)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_revision bigint; v_old_lane uuid;
 v_new_order uuid[]; v_old_order uuid[]; v_hash text;
 v_existing public.dsa_explorer_mutations%rowtype; v_index int;
begin
 if v_user is null or p_position<0 or p_position>9999 or p_mutation_id is null then
  raise exception 'INVALID_MOVE' using errcode='22023'; end if;
 v_hash:=md5(concat_ws('|',p_problem_id::text,p_target_lane_id::text,p_position::text,p_expected_revision::text));
 select revision into v_revision from public.dsa_explorer_boards
 where id=p_board_id and user_id=v_user for update;
 if not found then raise exception 'BOARD_NOT_FOUND' using errcode='42501'; end if;
 select * into v_existing from public.dsa_explorer_mutations
 where board_id=p_board_id and mutation_id=p_mutation_id;
 if found then
  if v_existing.fingerprint<>v_hash then raise exception 'MUTATION_CONFLICT' using errcode='23505'; end if;
  return v_existing.revision;
 end if;
 if v_revision<>p_expected_revision then raise exception 'REVISION_CONFLICT' using errcode='40001'; end if;
 if not exists(select 1 from public.dsa_explorer_lanes
  where id=p_target_lane_id and board_id=p_board_id and user_id=v_user) then
  raise exception 'LANE_NOT_FOUND' using errcode='42501'; end if;
 select lane_id into v_old_lane from public.dsa_explorer_cards
 where board_id=p_board_id and problem_id=p_problem_id and user_id=v_user for update;
 if not found then raise exception 'CARD_NOT_FOUND' using errcode='22023'; end if;
 select coalesce(array_agg(problem_id order by position,problem_id),'{}'::uuid[])
 into v_new_order from public.dsa_explorer_cards
 where board_id=p_board_id and lane_id=p_target_lane_id and problem_id<>p_problem_id;
 v_index:=least(p_position,cardinality(v_new_order));
 v_new_order:=coalesce(v_new_order[1:v_index],'{}'::uuid[]) ||
   array[p_problem_id] || coalesce(v_new_order[v_index+1:],'{}'::uuid[]);
 update public.dsa_explorer_cards set lane_id=p_target_lane_id
 where board_id=p_board_id and problem_id=p_problem_id;
 update public.dsa_explorer_cards c set position=o.ordinality-1
 from unnest(v_new_order) with ordinality o(problem_id,ordinality)
 where c.board_id=p_board_id and c.problem_id=o.problem_id;
 if v_old_lane<>p_target_lane_id then
  select coalesce(array_agg(problem_id order by position,problem_id),'{}'::uuid[])
  into v_old_order from public.dsa_explorer_cards
  where board_id=p_board_id and lane_id=v_old_lane;
  update public.dsa_explorer_cards c set position=o.ordinality-1
  from unnest(v_old_order) with ordinality o(problem_id,ordinality)
  where c.board_id=p_board_id and c.problem_id=o.problem_id;
 end if;
 update public.dsa_explorer_boards
 set revision=revision+1,updated_at=now() where id=p_board_id returning revision into v_revision;
 insert into public.dsa_explorer_mutations(board_id,user_id,mutation_id,fingerprint,revision)
 values(p_board_id,v_user,p_mutation_id,v_hash,v_revision);
 return v_revision;
end $$;
revoke all on function public.dsa_explorer_move_card(uuid,uuid,uuid,integer,bigint,uuid) from public,anon;
grant execute on function public.dsa_explorer_move_card(uuid,uuid,uuid,integer,bigint,uuid) to authenticated;
