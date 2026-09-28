-- Team accounts join their organization's workspace by email domain.
--
-- A confirmed account whose email domain is listed in workspace_team_domains
-- gets that domain's rateware_organization_id (and permissions) in its
-- server-only app_metadata, the same claims the Edge Functions already read
-- (_shared/auth.ts). It never moves an account that belongs to another
-- organization, and it fails open: any error leaves the account untouched, so
-- sign-in keeps working for every app on this shared Auth. The domain rows are
-- managed in production (the team's own Google Workspace domains).
create table if not exists public.workspace_team_domains (
  domain text primary key check (domain = lower(domain) and domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  organization_id text not null check (length(organization_id) between 1 and 200),
  permissions text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.workspace_team_domains enable row level security;
revoke all on table public.workspace_team_domains from anon, authenticated;
comment on table public.workspace_team_domains is
  'Email domains whose confirmed accounts join an organization workspace (auth.users trigger). Service role only.';

create or replace function public.assign_team_workspace_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  team public.workspace_team_domains%rowtype;
  meta jsonb;
  granted jsonb;
begin
  if new.email is null or new.email_confirmed_at is null then
    return new;
  end if;
  select * into team from public.workspace_team_domains
  where domain = lower(substring(new.email from '@([^@]+)$'));
  if not found then
    return new;
  end if;
  meta := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  if coalesce(meta->>'rateware_organization_id', '') not in ('', team.organization_id) then
    return new;
  end if;
  select coalesce(jsonb_agg(permission order by permission), '[]'::jsonb) into granted
  from (
    select jsonb_array_elements_text(case when jsonb_typeof(meta->'permissions') = 'array' then meta->'permissions' else '[]'::jsonb end) as permission
    union
    select unnest(team.permissions)
  ) merged;
  new.raw_app_meta_data := meta || jsonb_build_object('rateware_organization_id', team.organization_id, 'permissions', granted);
  return new;
exception when others then
  return new;
end;
$$;
revoke all on function public.assign_team_workspace_membership() from public, anon, authenticated;

drop trigger if exists assign_team_workspace_membership on auth.users;
create trigger assign_team_workspace_membership
  before insert or update of email, email_confirmed_at, raw_app_meta_data on auth.users
  for each row execute function public.assign_team_workspace_membership();
