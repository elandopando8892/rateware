-- Expand-only foundation for moving OSP authentication from Kinde to the
-- existing Rateware Supabase project. Applying this migration does not create
-- users, activate the Auth hook, change an Edge Function, or grant a person
-- authority. Those are separate, explicitly authorized cutover steps.

create table osp_private.auth_principal_bindings (
  auth_user_id uuid primary key references auth.users(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  email text not null,
  primary_permission text,
  status text not null default 'needs_review',
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint auth_principal_bindings_email_normalized check (
    email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint auth_principal_bindings_permission_check check (
    primary_permission is null or primary_permission in (
      'osp:operate',
      'osp:signature-approve',
      'osp:sales-authorize'
    )
  ),
  constraint auth_principal_bindings_status_check check (
    status in ('needs_review', 'active', 'suspended', 'revoked')
  ),
  constraint auth_principal_bindings_active_review_check check (
    status <> 'active' or (
      reviewed_at is not null
      and nullif(btrim(reviewed_by), '') is not null
      and nullif(btrim(review_note), '') is not null
    )
  ),
  constraint auth_principal_bindings_org_email_unique unique (organization_id, email)
);

create index auth_principal_bindings_active_org_idx
  on osp_private.auth_principal_bindings (organization_id, auth_user_id)
  where status = 'active';

create function osp_private.reject_auth_principal_identity_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.auth_user_id <> old.auth_user_id
     or new.organization_id <> old.organization_id
     or new.email <> old.email then
    raise exception using errcode = '23514', message = 'OSP_AUTH_IDENTITY_IMMUTABLE';
  end if;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create trigger auth_principal_bindings_identity_guard
before update on osp_private.auth_principal_bindings
for each row execute function osp_private.reject_auth_principal_identity_mutation();

-- Supabase Auth calls this hook while minting an access token. The function
-- deletes any browser/user-metadata copy of the OSP claims first, then derives
-- the only authoritative values from a reviewed server-side binding.
create function public.osp_custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  binding osp_private.auth_principal_bindings%rowtype;
  token_email text;
  permissions text[];
begin
  if jsonb_typeof(event) <> 'object'
     or jsonb_typeof(event -> 'claims') <> 'object'
     or coalesce(event ->> 'user_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'OSP_AUTH_HOOK_INVALID';
  end if;

  claims := (event -> 'claims') - 'osp_organization_id' - 'osp_permissions';
  token_email := lower(btrim(coalesce(claims ->> 'email', '')));

  select candidate.* into binding
  from osp_private.auth_principal_bindings candidate
  join auth.users auth_user on auth_user.id = candidate.auth_user_id
  where candidate.auth_user_id = (event ->> 'user_id')::uuid
    and candidate.status = 'active'
    and candidate.email = token_email
    and lower(btrim(coalesce(auth_user.email, ''))) = candidate.email;

  if not found then
    return jsonb_build_object('claims', claims);
  end if;

  permissions := array['osp:read']::text[];
  if binding.primary_permission is not null then
    permissions := permissions || binding.primary_permission;
  end if;

  claims := jsonb_set(
    claims,
    '{osp_organization_id}',
    to_jsonb(binding.organization_id::text),
    true
  );
  claims := jsonb_set(claims, '{osp_permissions}', to_jsonb(permissions), true);
  return jsonb_build_object('claims', claims);
end;
$$;

alter table osp_private.auth_principal_bindings enable row level security;
alter table osp_private.auth_principal_bindings force row level security;

revoke all on table osp_private.auth_principal_bindings from public, anon, authenticated;
revoke all on function osp_private.reject_auth_principal_identity_mutation() from public;
revoke all on function public.osp_custom_access_token_hook(jsonb) from public, anon, authenticated;

grant select, insert, update on table osp_private.auth_principal_bindings to service_role;
grant execute on function public.osp_custom_access_token_hook(jsonb) to supabase_auth_admin;

comment on table osp_private.auth_principal_bindings is
  'Reviewed Supabase Auth principals for OSP. Read is implicit; zero or one consequential permission is allowed per identity.';
comment on column osp_private.auth_principal_bindings.primary_permission is
  'Fail-closed separation of duties: operate, signature approval, Sales authorization, or null for read-only.';
comment on function public.osp_custom_access_token_hook(jsonb) is
  'Supabase Auth hook that emits signed OSP tenant and permission claims from reviewed server-side bindings only.';
