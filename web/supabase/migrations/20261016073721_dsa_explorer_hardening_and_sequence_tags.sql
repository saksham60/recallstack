
-- Tighten mutation privileges, add lane reordering and conservative full-name sequence parsing.
revoke all on public.dsa_company_aliases,public.dsa_problem_company_sources,
 public.dsa_explorer_mutations from public,anon,authenticated;
revoke update on public.dsa_explorer_boards,public.dsa_explorer_lanes from authenticated;
grant update(title,grouping,layout,settings,updated_at) on public.dsa_explorer_boards to authenticated;
grant update(title,group_key) on public.dsa_explorer_lanes to authenticated;
-- Internal trigger functions are not browser-callable.
revoke all on function public.dsa_code_report_snapshot() from public,anon,authenticated;
revoke all on function dsa_execution_private.check_certification_gate() from public,anon,authenticated;

create function public.dsa_explorer_bump_board_revision()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.dsa_explorer_boards
  set revision=revision+1,updated_at=now()
  where id=coalesce(NEW.board_id,OLD.board_id);
 return null;
end $$;
revoke all on function public.dsa_explorer_bump_board_revision() from public,anon,authenticated;
create trigger dsa_cards_membership_revision
 after insert or delete on public.dsa_explorer_cards for each row
 execute function public.dsa_explorer_bump_board_revision();
create trigger dsa_lanes_membership_revision
 after insert or delete on public.dsa_explorer_lanes for each row
 execute function public.dsa_explorer_bump_board_revision();

create function public.dsa_explorer_reorder_lanes(
 p_board_id uuid,p_lane_ids uuid[],p_expected_revision bigint,p_mutation_id uuid)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_revision bigint;v_hash text;
 v_old public.dsa_explorer_mutations%rowtype;v_count int;
begin
 if v_user is null or p_mutation_id is null or p_lane_ids is null
   or cardinality(p_lane_ids)>100 or array_position(p_lane_ids,null) is not null then
    raise exception 'INVALID_LANE_REORDER' using errcode='22023';end if;
 v_hash:=md5(concat_ws('|',array_to_string(p_lane_ids,','),p_expected_revision::text));
 select revision into v_revision from public.dsa_explorer_boards
 where id=p_board_id and user_id=v_user for update;
 if not found then raise exception 'BOARD_NOT_FOUND' using errcode='42501';end if;
 select * into v_old from public.dsa_explorer_mutations
 where board_id=p_board_id and mutation_id=p_mutation_id;
 if found then
  if v_old.fingerprint<>v_hash then raise exception 'MUTATION_CONFLICT' using errcode='23505';end if;
  return v_old.revision;
 end if;
 if v_revision<>p_expected_revision then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
 select count(*) into v_count from public.dsa_explorer_lanes where board_id=p_board_id;
 if v_count<>cardinality(p_lane_ids)
  or v_count<>(select count(distinct x) from unnest(p_lane_ids) x)
  or exists(select 1 from unnest(p_lane_ids) x where not exists(
   select 1 from public.dsa_explorer_lanes l where l.id=x
     and l.board_id=p_board_id and l.user_id=v_user)) then
  raise exception 'LANE_SET_MISMATCH' using errcode='22023';end if;
 update public.dsa_explorer_lanes l set position=v.ordinality-1
 from unnest(p_lane_ids) with ordinality v(id,ordinality)
 where l.board_id=p_board_id and l.id=v.id;
 update public.dsa_explorer_boards set revision=revision+1,updated_at=now()
 where id=p_board_id returning revision into v_revision;
 insert into public.dsa_explorer_mutations(board_id,user_id,mutation_id,fingerprint,revision)
 values(p_board_id,v_user,p_mutation_id,v_hash,v_revision);
 return v_revision;
end $$;
revoke all on function public.dsa_explorer_reorder_lanes(uuid,uuid[],bigint,uuid) from public,anon;
grant execute on function public.dsa_explorer_reorder_lanes(uuid,uuid[],bigint,uuid) to authenticated;

-- Never distribute associations belonging to a company awaiting review.
drop policy dsa_problem_companies_read on public.dsa_problem_companies;
create policy dsa_problem_companies_read on public.dsa_problem_companies
 for select to anon,authenticated using(exists(
 select 1 from public.dsa_companies c where c.id=company_id and c.review_status='approved'));

-- Explicit additional canonical names. Typo-like source names are *not* silently corrected.
insert into public.dsa_companies(canonical_name,slug) values
 ('HSBC','hsbc'),('Meta','meta'),('Myntra','myntra'),('Amdocs','amdocs'),
 ('Oracle','oracle'),('Walmart','walmart'),('Alibaba','alibaba'),
 ('Sprinklr','sprinklr'),('Razorpay','razorpay'),('Salesforce','salesforce'),
 ('GeekyAnts','geekyants'),('PayPal','paypal'),('VMware','vmware'),
 ('SAP Labs','sap-labs'),('MAQ Software','maq-software'),('DE Shaw','de-shaw'),
 ('Cisco','cisco'),('Ola Cabs','ola-cabs'),('OYO Rooms','oyo-rooms'),
 ('D-E-Shaw','d-e-shaw'),('Cognizant','cognizant'),('JPMorgan','jpmorgan')
 on conflict(slug) do nothing;
insert into public.dsa_company_aliases(company_id,alias,review_status)
select c.id,c.canonical_name,'approved' from public.dsa_companies c
where not exists(select 1 from public.dsa_company_aliases a where lower(a.alias)=lower(c.canonical_name));

alter table public.dsa_problem_company_sources
 drop constraint dsa_problem_company_sources_review_status_check;
alter table public.dsa_problem_company_sources add constraint dsa_problem_company_sources_review_status_check
 check(review_status in ('auto_exact','auto_delimited','auto_segmented','needs_review','reviewed'));
alter table public.dsa_problem_companies
 drop constraint dsa_problem_companies_match_method_check;
alter table public.dsa_problem_companies add constraint dsa_problem_companies_match_method_check
 check(match_method in ('exact','explicit_plus','known_name_sequence','manual_review'));

-- Resolve only when a FULL raw string admits exactly one complete segmentation
-- into *approved canonical names*. A single known word in an unknown string
-- is never a sufficient basis to assign that company.
with recursive segment(definition_id,source_block_id,remainder,company_ids,depth) as (
 select s.definition_id,s.source_block_id,lower(btrim(s.raw_companies)),
    '{}'::uuid[],0
 from public.dsa_problem_company_sources s
 where s.review_status='needs_review' and s.raw_companies !~ '[+,;/]'
 union all
 select x.definition_id,x.source_block_id,
  case when x.remainder=lower(c.canonical_name) then ''
       else btrim(substring(x.remainder from char_length(c.canonical_name)+2)) end,
  x.company_ids || c.id,x.depth+1
 from segment x join public.dsa_companies c on c.review_status='approved'
 and (x.remainder=lower(c.canonical_name)
    or left(x.remainder,char_length(c.canonical_name)+1)=lower(c.canonical_name)||' ')
 where x.depth<20 and x.remainder<>''
), complete as (
 select definition_id,source_block_id,company_ids,
  count(*) over(partition by definition_id,source_block_id) paths
 from segment where remainder='' and cardinality(company_ids)>0
), unique_paths as (
 select definition_id,source_block_id,company_ids from complete where paths=1
), mappings as (
 select x.definition_id,x.source_block_id,c.id company_id,c.canonical_name
 from unique_paths x
 cross join lateral unnest(x.company_ids) cid(id)
 join public.dsa_companies c on c.id=cid.id
)
insert into public.dsa_problem_companies(definition_id,company_id,source_block_id,match_method,raw_alias)
select distinct on(definition_id,company_id) definition_id,company_id,source_block_id,
  'known_name_sequence',canonical_name
from mappings order by definition_id,company_id,source_block_id
on conflict(definition_id,company_id) do nothing;

update public.dsa_problem_company_sources s
set review_status='auto_segmented',updated_at=now()
where s.review_status='needs_review' and exists (
 select 1 from public.dsa_problem_companies x where x.definition_id=s.definition_id
 and x.source_block_id=s.source_block_id and x.match_method='known_name_sequence');
