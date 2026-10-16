-- Deterministic enrichment of legacy company strings only when every explicit
-- '+' token resolves to an already approved company alias after removing
-- a known editorial suffix ("Interview Qs" or "IQ").
-- Raw source strings/metadata are preserved; no new companies are invented.
with tokens as (
  select s.definition_id,s.source_block_id,s.raw_companies,
         btrim(t.part) raw_token,
         btrim(regexp_replace(btrim(t.part),
           '[[:space:]]+(Interview[[:space:]]+Qs|IQ)$','','i')) clean_token,
         count(*) over(partition by s.definition_id,s.source_block_id) part_count
  from public.dsa_problem_company_sources s
  cross join lateral regexp_split_to_table(
    s.raw_companies,'[[:space:]]*[+][[:space:]]*') as t(part)
  where s.review_status='needs_review'
),
matched as (
  select t.*,a.company_id
  from tokens t
  left join public.dsa_company_aliases a
    on lower(a.alias)=lower(t.clean_token)
   and a.review_status='approved'
),
complete as (
  select definition_id,source_block_id
  from matched
  group by definition_id,source_block_id
  having count(*)=count(company_id)
),
written as (
  insert into public.dsa_problem_companies
    (definition_id,company_id,source_block_id,match_method,raw_alias)
  select distinct on (m.definition_id,m.company_id)
      m.definition_id,m.company_id,m.source_block_id,
      case when m.part_count>1 then 'explicit_plus' else 'exact' end,
      m.raw_token
  from matched m
  join complete c using (definition_id,source_block_id)
  order by m.definition_id,m.company_id,m.source_block_id
  on conflict (definition_id,company_id) do nothing
  returning definition_id
)
update public.dsa_problem_company_sources s
set review_status=case when position('+' in s.raw_companies)>0
                       then 'auto_delimited' else 'auto_exact' end,
    reviewer_note=concat_ws(' | ',nullif(s.reviewer_note,''),
      'Automated exact matching to pre-approved aliases after stripping editorial Interview Qs/IQ suffix'),
    updated_at=now()
from complete c
where s.definition_id=c.definition_id
  and s.source_block_id=c.source_block_id
  and s.review_status='needs_review';
