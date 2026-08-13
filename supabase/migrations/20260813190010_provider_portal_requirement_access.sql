-- Provider-facing checklist is explicit. Internal activation requirements are never exposed implicitly.
create table if not exists public.provider_portal_requirement_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invitation_id uuid not null,
  provider_relationship_id uuid not null,
  legal_entity_id uuid not null,
  activation_id uuid not null,
  activation_requirement_id uuid not null,
  access_mode text not null default 'respond',
  provider_label text not null,
  provider_instructions text,
  required_for_portal_submission boolean not null default true,
  sequence_number integer not null default 100,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_portal_requirement_access_org_id_unique unique (organization_id,id),
  constraint provider_portal_requirement_access_invitation_fkey
    foreign key (organization_id, invitation_id, provider_relationship_id, legal_entity_id)
    references public.provider_portal_invitations(organization_id,id,provider_relationship_id,legal_entity_id)
    on delete cascade,
  constraint provider_portal_requirement_access_activation_fkey
    foreign key (organization_id, activation_id, provider_relationship_id, legal_entity_id)
    references public.provider_activations(organization_id,id,provider_relationship_id,legal_entity_id)
    on delete restrict,
  constraint provider_portal_requirement_access_requirement_fkey
    foreign key (organization_id, activation_id, activation_requirement_id)
    references public.provider_activation_requirements(organization_id,activation_id,id)
    on delete restrict,
  constraint provider_portal_requirement_access_unique
    unique (organization_id, invitation_id, activation_requirement_id),
  constraint provider_portal_requirement_access_mode_check
    check (access_mode in ('read_only','respond','upload','respond_and_upload')),
  constraint provider_portal_requirement_access_label_not_blank
    check (btrim(provider_label) <> ''),
  constraint provider_portal_requirement_access_sequence_check
    check (sequence_number > 0),
  constraint provider_portal_requirement_access_status_check
    check (status in ('active','completed','revoked'))
);

create index if not exists provider_portal_requirement_access_checklist_idx
  on public.provider_portal_requirement_access (invitation_id,status,sequence_number,id);
