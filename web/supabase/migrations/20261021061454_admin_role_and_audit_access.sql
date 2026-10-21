-- Admin API uses its PostgreSQL server connection; browser clients never query
-- these tables. Preserve all rows and backend owner/service-role access.
begin;
alter table public.roles enable row level security;
alter table public.profile_role_grants enable row level security;
alter table public.admin_audit_logs enable row level security;
revoke all on public.roles, public.profile_role_grants, public.admin_audit_logs
  from public, anon, authenticated;
grant select, insert, update, delete on public.roles, public.profile_role_grants,
  public.admin_audit_logs to service_role;
revoke all on sequence public.roles_id_seq, public.profile_role_grants_id_seq,
  public.admin_audit_logs_id_seq from public, anon, authenticated;
grant usage, select on sequence public.roles_id_seq, public.profile_role_grants_id_seq,
  public.admin_audit_logs_id_seq to service_role;
commit;
