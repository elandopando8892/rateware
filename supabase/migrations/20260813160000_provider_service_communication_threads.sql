-- Provider Service Build 5: channel-neutral communication threads.
-- Gmail credentials and live mailbox authorization are deliberately out of scope.

create table if not exists public.provider_communication_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  provider_relationship_id uuid,
  channel text not null default 'email',
  mailbox_reference text not null,
  external_thread_id text not null,
  subject text,
  communication_status text not null default 'open',
  matching_status text not null default 'unmatched',
  match_method text,
  matched_at timestamptz,
  matched_by_user_id text,
  assigned_to_user_id text,
  needs_reply boolean not null default false,
  first_message_at timestamptz,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_communication_threads_org_id_unique unique (organization_id, id),
  constraint provider_communication_threads_org_rel_entity_unique
    unique (organization_id, id, provider_relationship_id, legal_entity_id),
  constraint provider_communication_threads_entity_fkey
    foreign key (organization_id, legal_entity_id)
    references public.legal_entities(organization_id, id)
    on delete restrict,
  constraint provider_communication_threads_relationship_fkey
    foreign key (organization_id, provider_relationship_id, legal_entity_id)
    references public.provider_relationships(organization_id, id, legal_entity_id)
    on delete restrict,
  constraint provider_communication_threads_external_unique
    unique (organization_id, channel, mailbox_reference, external_thread_id),
  constraint provider_communication_threads_channel_check
    check (channel in ('email', 'portal', 'whatsapp', 'api', 'other')),
  constraint provider_communication_threads_mailbox_not_blank
    check (btrim(mailbox_reference) <> ''),
  constraint provider_communication_threads_external_not_blank
    check (btrim(external_thread_id) <> ''),
  constraint provider_communication_threads_status_check
    check (communication_status in ('open', 'waiting_xbf', 'waiting_provider', 'waiting_external', 'resolved', 'archived')),
  constraint provider_communication_threads_matching_check
    check (matching_status in ('unmatched', 'candidate', 'matched', 'needs_review')),
  constraint provider_communication_threads_match_method_check
    check (match_method is null or match_method ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_communication_threads_matched_check check (
    matching_status <> 'matched'
    or (
      provider_relationship_id is not null
      and matched_at is not null
      and nullif(btrim(coalesce(match_method, '')), '') is not null
    )
  ),
  constraint provider_communication_threads_unmatched_check
    check (provider_relationship_id is not null or matching_status <> 'matched'),
  constraint provider_communication_threads_resolved_check
    check (communication_status <> 'resolved' or resolved_at is not null)
);

create index if not exists provider_communication_threads_inbox_idx
  on public.provider_communication_threads (
    organization_id,
    legal_entity_id,
    communication_status,
    matching_status,
    needs_reply,
    last_message_at desc
  );
create index if not exists provider_communication_threads_relationship_idx
  on public.provider_communication_threads (provider_relationship_id, last_message_at desc)
  where provider_relationship_id is not null;
