-- Provider Service Build 22: human review queue for entity evidence.
create table if not exists public.provider_entity_document_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  ingestion_id uuid not null,
  document_asset_id uuid not null,
  review_status text not null default 'pending',
  review_reason text not null default 'classification_review',
  sensitivity text not null,
  requested_by_actor_type text not null default 'system',
  requested_by_user_id text,
  assigned_reviewer_user_id text,
  decided_by_user_id text,
  decision_note text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  decided_at timestamptz,
  due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_entity_reviews_org_id_unique unique (organization_id,id),
  constraint provider_entity_reviews_ingestion_fkey foreign key (organization_id,ingestion_id)
    references public.provider_entity_document_ingestions(organization_id,id) on delete restrict,
  constraint provider_entity_reviews_asset_fkey foreign key (organization_id,document_asset_id)
    references public.provider_legal_entity_document_assets(organization_id,id) on delete restrict,
  constraint provider_entity_reviews_entity_fkey foreign key (organization_id,legal_entity_id)
    references public.legal_entities(organization_id,id) on delete restrict,
  constraint provider_entity_reviews_active_unique unique (organization_id,ingestion_id,document_asset_id),
  constraint provider_entity_reviews_status_check
    check (review_status in ('pending','in_review','approved','rejected','changes_required','cancelled')),
  constraint provider_entity_reviews_reason_check
    check (review_reason in ('classification_review','field_review','sensitivity_review','expiry_review','manual_review')),
  constraint provider_entity_reviews_sensitivity_check
    check (sensitivity in ('public','internal','confidential','restricted','highly_restricted')),
  constraint provider_entity_reviews_actor_check
    check (requested_by_actor_type in ('user','agent','system','integration')),
  constraint provider_entity_reviews_separation_check
    check (decided_by_user_id is null or requested_by_user_id is null or decided_by_user_id<>requested_by_user_id),
  constraint provider_entity_reviews_decision_check
    check (
      review_status not in ('approved','rejected','changes_required')
      or (
        decided_at is not null
        and nullif(btrim(coalesce(decided_by_user_id,'')),'') is not null
        and nullif(btrim(coalesce(decision_note,'')),'') is not null
      )
    ),
  constraint provider_entity_reviews_started_check
    check (started_at is null or started_at>=requested_at),
  constraint provider_entity_reviews_due_check
    check (due_at is null or due_at>requested_at)
);

create table if not exists public.provider_entity_document_review_fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  review_id uuid not null,
  field_code text not null,
  proposed_value jsonb,
  proposed_value_sha256 text,
  sensitivity text not null default 'confidential',
  field_status text not null default 'pending',
  reviewer_value jsonb,
  decided_by_user_id text,
  decided_at timestamptz,
  decision_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_entity_review_fields_org_id_unique unique (organization_id,id),
  constraint provider_entity_review_fields_review_fkey foreign key (organization_id,review_id)
    references public.provider_entity_document_reviews(organization_id,id) on delete cascade,
  constraint provider_entity_review_fields_unique unique (organization_id,review_id,field_code),
  constraint provider_entity_review_fields_code_check check (field_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_entity_review_fields_hash_check
    check (proposed_value_sha256 is null or proposed_value_sha256 ~ '^[0-9a-f]{64}$'),
  constraint provider_entity_review_fields_sensitivity_check
    check (sensitivity in ('public','internal','confidential','restricted','highly_restricted')),
  constraint provider_entity_review_fields_status_check
    check (field_status in ('pending','accepted','corrected','rejected','withheld')),
  constraint provider_entity_review_fields_decision_check
    check (
      field_status='pending'
      or (
        decided_at is not null
        and nullif(btrim(coalesce(decided_by_user_id,'')),'') is not null
        and nullif(btrim(coalesce(decision_note,'')),'') is not null
      )
    ),
  constraint provider_entity_review_fields_correction_check
    check (field_status<>'corrected' or reviewer_value is not null),
  constraint provider_entity_review_fields_withheld_check
    check (field_status<>'withheld' or sensitivity in ('restricted','highly_restricted'))
);

create index if not exists provider_entity_reviews_queue_idx
  on public.provider_entity_document_reviews
    (organization_id,review_status,sensitivity,due_at,requested_at);
create index if not exists provider_entity_review_fields_review_idx
  on public.provider_entity_document_review_fields (organization_id,review_id,field_status);

create or replace view public.provider_entity_document_review_queue
with (security_barrier=true)
as
select
  review.organization_id,
  review.id as review_id,
  review.legal_entity_id,
  entity.entity_code as legal_entity_code,
  review.ingestion_id,
  review.document_asset_id,
  asset.document_type,
  asset.document_name,
  asset.sensitivity,
  asset.verification_status,
  asset.expiration_date,
  review.review_status,
  review.review_reason,
  review.assigned_reviewer_user_id,
  review.requested_at,
  review.started_at,
  review.due_at,
  count(field.id)::integer as field_count,
  count(field.id) filter (where field.field_status='pending')::integer as pending_field_count,
  case
    when asset.sensitivity='highly_restricted' then 10
    when asset.sensitivity='restricted' then 20
    when review.due_at is not null and review.due_at<=now() then 25
    when asset.expiration_date is not null and asset.expiration_date<=current_date+30 then 30
    else 50
  end as priority_rank
from public.provider_entity_document_reviews review
join public.legal_entities entity
  on entity.organization_id=review.organization_id and entity.id=review.legal_entity_id
join public.provider_legal_entity_document_assets asset
  on asset.organization_id=review.organization_id and asset.id=review.document_asset_id
left join public.provider_entity_document_review_fields field
  on field.organization_id=review.organization_id and field.review_id=review.id
group by review.organization_id,review.id,review.legal_entity_id,entity.entity_code,
  review.ingestion_id,review.document_asset_id,asset.document_type,asset.document_name,
  asset.sensitivity,asset.verification_status,asset.expiration_date,review.review_status,
  review.review_reason,review.assigned_reviewer_user_id,review.requested_at,review.started_at,review.due_at;

alter table public.provider_entity_document_reviews enable row level security;
alter table public.provider_entity_document_review_fields enable row level security;
revoke all on table public.provider_entity_document_reviews from public,anon,authenticated,service_role;
revoke all on table public.provider_entity_document_review_fields from public,anon,authenticated,service_role;
revoke all on table public.provider_entity_document_review_queue from public,anon,authenticated,service_role;
