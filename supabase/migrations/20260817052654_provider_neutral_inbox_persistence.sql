-- Recovered from production 2026-08-18. Applied directly to rateware-prod on
-- 2026-08-17 without a source commit; reconstructed here verbatim from
-- supabase_migrations.schema_migrations so branch history matches the remote.

create table public.provider_internal_actors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_key text not null,
  display_name text not null,
  mailbox_reference text,
  actor_type text not null default 'service' check (actor_type in ('service','human')),
  capabilities text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, actor_key),
  check (mailbox_reference is null or mailbox_reference = lower(btrim(mailbox_reference))),
  check (not (capabilities && array['send_external_email','publish_vault','release_provider']::text[]))
);

create table public.provider_inbound_envelopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_channel text not null default 'email' check (source_channel in ('email')),
  mailbox_reference text not null,
  external_thread_id text,
  external_message_id text not null,
  envelope_status text not null default 'received'
    check (envelope_status in ('received','routing','needs_review','routed','rejected')),
  legal_entity_id uuid,
  entity_code text,
  routing_decision text check (routing_decision in ('mexico','united_states','needs_review','rejected')),
  routing_confidence numeric(5,4) check (routing_confidence between 0 and 1),
  routed_by_type text check (routed_by_type in ('rule','internal_actor','human')),
  routed_by_actor_id uuid references public.provider_internal_actors(id),
  routed_at timestamptz,
  review_reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_channel, mailbox_reference, external_message_id),
  foreign key (organization_id, legal_entity_id, entity_code)
    references public.legal_entities(organization_id, id, entity_code),
  check (mailbox_reference = lower(btrim(mailbox_reference))),
  check (
    (envelope_status = 'routed' and legal_entity_id is not null and entity_code is not null and routed_at is not null)
    or (envelope_status <> 'routed' and legal_entity_id is null and entity_code is null)
  ),
  check (
    routed_by_type <> 'human'
    or (routed_by_actor_id is not null and nullif(btrim(review_reason),'') is not null)
  )
);

create table public.provider_inbound_envelope_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  envelope_id uuid not null references public.provider_inbound_envelopes(id) on delete cascade,
  event_type text not null check (event_type in (
    'received','routing_started','routed','review_requested','review_completed','rejected','approval_packet_created'
  )),
  actor_id uuid references public.provider_internal_actors(id),
  event_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(event_metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create table public.provider_onboarding_approval_packets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  envelope_id uuid not null references public.provider_inbound_envelopes(id) on delete cascade,
  legal_entity_id uuid not null,
  entity_code text not null,
  packet_status text not null default 'pending'
    check (packet_status in ('pending','content_approved','rejected')),
  requested_by_actor_id uuid not null references public.provider_internal_actors(id),
  decided_by_actor_id uuid references public.provider_internal_actors(id),
  instructions_approved boolean not null default false,
  forms_approved boolean not null default false,
  vault_manifest_approved boolean not null default false,
  external_email_enabled boolean not null default false check (external_email_enabled = false),
  external_vault_enabled boolean not null default false check (external_vault_enabled = false),
  release_enabled boolean not null default false check (release_enabled = false),
  decision_reason text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, legal_entity_id, entity_code)
    references public.legal_entities(organization_id, id, entity_code),
  unique (organization_id, envelope_id),
  check (decided_by_actor_id is null or decided_by_actor_id <> requested_by_actor_id),
  check (
    (packet_status = 'pending' and decided_by_actor_id is null and decided_at is null)
    or (packet_status <> 'pending' and decided_by_actor_id is not null and decided_at is not null)
  ),
  check (
    packet_status <> 'content_approved'
    or (instructions_approved and forms_approved and vault_manifest_approved)
  )
);

create index provider_inbound_envelopes_org_status_idx
  on public.provider_inbound_envelopes (organization_id, envelope_status, received_at desc);
create index provider_inbound_envelope_events_envelope_idx
  on public.provider_inbound_envelope_events (envelope_id, occurred_at);
create index provider_onboarding_approval_packets_org_status_idx
  on public.provider_onboarding_approval_packets (organization_id, packet_status, requested_at desc);

alter table public.provider_internal_actors enable row level security;
alter table public.provider_inbound_envelopes enable row level security;
alter table public.provider_inbound_envelope_events enable row level security;
alter table public.provider_onboarding_approval_packets enable row level security;

revoke all on public.provider_internal_actors from public, anon, authenticated, service_role;
revoke all on public.provider_inbound_envelopes from public, anon, authenticated, service_role;
revoke all on public.provider_inbound_envelope_events from public, anon, authenticated, service_role;
revoke all on public.provider_onboarding_approval_packets from public, anon, authenticated, service_role;

grant select, insert, update on public.provider_internal_actors to service_role;
grant select, insert, update on public.provider_inbound_envelopes to service_role;
grant select, insert on public.provider_inbound_envelope_events to service_role;
grant select, insert, update on public.provider_onboarding_approval_packets to service_role;

comment on table public.provider_inbound_envelopes is
  'Metadata-only neutral inbox envelopes. Never store message bodies, attachments, secrets, or document contents.';
comment on table public.provider_inbound_envelope_events is
  'Append-only audit metadata for neutral inbox routing. Service role has no update/delete grants.';
comment on table public.provider_internal_actors is
  'Bounded internal actors. External email, vault publication, and provider release capabilities are prohibited.';
comment on table public.provider_onboarding_approval_packets is
  'Content approval metadata only. External email, external vault, and release remain disabled.';
