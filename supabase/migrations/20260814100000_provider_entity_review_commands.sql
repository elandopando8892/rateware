-- Provider Service Build 23: optimistic review commands and immutable events.
alter table public.provider_entity_document_reviews
  add column if not exists revision integer not null default 1,
  add column if not exists claimed_at timestamptz;
alter table public.provider_entity_document_reviews
  add constraint provider_entity_reviews_revision_check check (revision>0),
  add constraint provider_entity_reviews_claim_check
    check (claimed_at is null or nullif(btrim(coalesce(assigned_reviewer_user_id,'')),'') is not null);

create table if not exists public.provider_entity_document_review_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  review_id uuid not null,
  event_type text not null,
  previous_revision integer,
  revision integer not null,
  actor_user_id text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint provider_entity_review_events_review_fkey foreign key (organization_id,review_id)
    references public.provider_entity_document_reviews(organization_id,id) on delete restrict,
  constraint provider_entity_review_events_type_check check (event_type in ('review_claimed','field_decided','review_decided')),
  constraint provider_entity_review_events_revision_check check (revision>0 and (previous_revision is null or revision>previous_revision)),
  constraint provider_entity_review_events_actor_check check (btrim(actor_user_id)<>'')
);
create index if not exists provider_entity_review_events_timeline_idx
  on public.provider_entity_document_review_events (organization_id,review_id,occurred_at,id);
alter table public.provider_entity_document_review_events enable row level security;
revoke all on table public.provider_entity_document_review_events from public,anon,authenticated,service_role;
