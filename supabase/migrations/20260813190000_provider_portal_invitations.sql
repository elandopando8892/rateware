-- Provider Service Build 8: magic-link invitations store only SHA-256 digests.
-- No plaintext token is persisted.
create table if not exists public.provider_portal_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_relationship_id uuid not null,
  legal_entity_id uuid not null,
  case_id uuid,
  activation_id uuid,
  invited_email text not null,
  purpose_code text not null,
  token_hash text not null,
  allowed_scopes text[] not null default '{}',
  status text not null default 'active',
  created_by_user_id text,
  expires_at timestamptz not null,
  viewed_at timestamptz,
  last_viewed_at timestamptz,
  submitted_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id text,
  revoke_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_portal_invitations_org_id_unique unique (organization_id, id),
  constraint provider_portal_invitations_org_rel_entity_unique
    unique (organization_id, id, provider_relationship_id, legal_entity_id),
  constraint provider_portal_invitations_relationship_fkey
    foreign key (organization_id, provider_relationship_id, legal_entity_id)
    references public.provider_relationships(organization_id, id, legal_entity_id)
    on delete restrict,
  constraint provider_portal_invitations_case_fkey
    foreign key (organization_id, case_id, provider_relationship_id, legal_entity_id)
    references public.provider_service_cases(organization_id, id, provider_relationship_id, legal_entity_id)
    on delete restrict,
  constraint provider_portal_invitations_activation_fkey
    foreign key (organization_id, activation_id, provider_relationship_id, legal_entity_id)
    references public.provider_activations(organization_id, id, provider_relationship_id, legal_entity_id)
    on delete restrict,
  constraint provider_portal_invitations_email_check
    check (invited_email = lower(btrim(invited_email)) and position('@' in invited_email) > 1),
  constraint provider_portal_invitations_purpose_check
    check (purpose_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_portal_invitations_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint provider_portal_invitations_token_hash_unique
    unique (token_hash),
  constraint provider_portal_invitations_scopes_check
    check (allowed_scopes <@ array['profile','requirements','documents','cases','status']::text[]),
  constraint provider_portal_invitations_status_check
    check (status in ('active','viewed','submitted','revoked','expired')),
  constraint provider_portal_invitations_expiry_check
    check (expires_at > created_at),
  constraint provider_portal_invitations_viewed_check
    check (status <> 'viewed' or viewed_at is not null),
  constraint provider_portal_invitations_submitted_check
    check (status <> 'submitted' or submitted_at is not null),
  constraint provider_portal_invitations_revoked_check check (
    status <> 'revoked'
    or (
      revoked_at is not null
      and nullif(btrim(coalesce(revoked_by_user_id,'')),'') is not null
      and nullif(btrim(coalesce(revoke_reason,'')),'') is not null
    )
  )
);

create unique index if not exists provider_portal_invitations_one_active_email_purpose_idx
  on public.provider_portal_invitations (
    organization_id,
    provider_relationship_id,
    legal_entity_id,
    invited_email,
    purpose_code
  )
  where status in ('active','viewed');

create index if not exists provider_portal_invitations_expiry_idx
  on public.provider_portal_invitations (organization_id, expires_at, status)
  where status in ('active','viewed');
