
-- Reduce inherited PUBLIC permissions before exposing the new DSA data API.
revoke all on public.dsa_companies,public.dsa_company_aliases,
 public.dsa_problem_company_sources,public.dsa_problem_companies,
 public.dsa_explorer_boards,public.dsa_explorer_lanes,
 public.dsa_explorer_cards,public.dsa_explorer_view_state,
 public.dsa_explorer_mutations,public.dsa_code_intelligence_reports,
 public.dsa_learner_skill_signals from public,anon,authenticated;
grant select on public.dsa_companies,public.dsa_problem_companies to anon,authenticated;
grant select,insert,delete on public.dsa_explorer_boards to authenticated;
grant update(title,grouping,layout,settings,updated_at) on public.dsa_explorer_boards to authenticated;
grant select,insert,delete on public.dsa_explorer_lanes to authenticated;
grant update(title,group_key) on public.dsa_explorer_lanes to authenticated;
grant select,insert,delete on public.dsa_explorer_cards to authenticated;
grant select,insert,update,delete on public.dsa_explorer_view_state to authenticated;
grant select on public.dsa_code_intelligence_reports,public.dsa_learner_skill_signals to authenticated;
-- Membership trigger must reference OLD on DELETE (NEW is not assigned).
create or replace function public.dsa_explorer_bump_board_revision()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_board uuid;
begin
 if TG_OP='DELETE' then v_board:=OLD.board_id;
 else v_board:=NEW.board_id; end if;
 update public.dsa_explorer_boards set revision=revision+1,updated_at=now() where id=v_board;
 return null;
end $$;
revoke all on function public.dsa_explorer_bump_board_revision() from public,anon,authenticated;
