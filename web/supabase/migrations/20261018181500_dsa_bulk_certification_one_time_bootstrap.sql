-- One-time bearer capability for owner-authorized immediate start.
-- Only a SHA-256 digest is stored. After one successful call it is unusable.
-- It cannot request a specific problem, change certificate outcomes or read fixtures.
create table if not exists dsa_execution_private.bulk_certification_bootstrap (
 singleton boolean primary key default true check(singleton),
 token_sha256 text not null check(token_sha256 ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,
 used_at timestamptz
);
alter table dsa_execution_private.bulk_certification_bootstrap enable row level security;
revoke all on dsa_execution_private.bulk_certification_bootstrap from public,anon,authenticated;
grant select,insert,update on dsa_execution_private.bulk_certification_bootstrap to service_role;
create or replace function public.dsa_bulk_certification_bootstrap(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run jsonb;
begin
  if (select auth.role()) is distinct from 'service_role'
    or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
  update dsa_execution_private.bulk_certification_bootstrap
    set used_at=now()
    where singleton
      and used_at is null
      and expires_at>now()
      and token_sha256=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if not found then return null; end if;
  v_run:=public.dsa_bulk_certification_command('start','{}'::jsonb);
  return v_run;
end $$;
revoke all on function public.dsa_bulk_certification_bootstrap(text) from public,anon,authenticated;
grant execute on function public.dsa_bulk_certification_bootstrap(text) to service_role;