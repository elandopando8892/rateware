-- Persist only AI-proposed request interpretations for human review. This
-- ledger has no case-transition, disclosure, signature, email or webhook authority.

create table osp_private.request_manifest_drafts (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  version integer not null check (version between 1 and 2147483647),
  status text not null default 'review_required' check (status = 'review_required'),
  manifest_json jsonb not null check (
    jsonb_typeof(manifest_json) = 'object'
    and manifest_json @> '{"schemaVersion":1,"status":"review_required","aiGenerated":true,"externalEffects":false}'::jsonb
    and octet_length(manifest_json::text) between 2 and 1048576
  ),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_sha256 text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  model_version text not null check (
    model_version = btrim(model_version) and char_length(model_version) between 1 and 128
  ),
  provider_response_id text check (
    provider_response_id is null or (
      provider_response_id = btrim(provider_response_id)
      and char_length(provider_response_id) between 1 and 128
      and provider_response_id ~ '^[A-Za-z0-9_-]+$'
    )
  ),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  duration_ms integer not null check (duration_ms between 0 and 600000),
  generated_at timestamptz not null,
  recorded_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, case_id, version),
  unique (organization_id, case_id, evidence_sha256),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id) on delete restrict,
  check (
    (input_tokens is null and output_tokens is null and total_tokens is null)
    or (input_tokens is not null and output_tokens is not null and total_tokens = input_tokens + output_tokens)
  )
);

create function osp_private.reject_request_manifest_draft_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using errcode = '55000', message = 'REQUEST_MANIFEST_DRAFT_APPEND_ONLY';
end;
$function$;

create trigger request_manifest_drafts_append_only
before update or delete on osp_private.request_manifest_drafts
for each row execute function osp_private.reject_request_manifest_draft_mutation();

alter table osp_private.request_manifest_drafts enable row level security;
alter table osp_private.request_manifest_drafts force row level security;

revoke all on osp_private.request_manifest_drafts
from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;
grant select, insert on osp_private.request_manifest_drafts to osp_worker;
grant select on osp_private.request_manifest_drafts to osp_workflow_api;

create policy request_manifest_drafts_worker_tenant
on osp_private.request_manifest_drafts for all to osp_worker
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid)
with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);

create policy request_manifest_drafts_workflow_read_tenant
on osp_private.request_manifest_drafts for select to osp_workflow_api
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);

revoke all on function osp_private.reject_request_manifest_draft_mutation() from public;

-- Extend the existing private custody buckets for adaptive request evidence.
-- Refuse to overwrite any unexpected bucket configuration.
do $request_manifest_bucket_boundary$
declare
  originals storage.buckets%rowtype;
  corporate storage.buckets%rowtype;
  old_originals constant text[] := array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/tiff',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'message/rfc822'
  ];
  next_originals constant text[] := array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'message/rfc822'
  ];
  old_corporate constant text[] := array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/tiff',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  next_corporate constant text[] := array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
begin
  select * into originals from storage.buckets where id = 'osp-originals' for update;
  if not found or originals.public is distinct from false
     or originals.file_size_limit is distinct from 26214400
     or (originals.allowed_mime_types is distinct from old_originals
         and originals.allowed_mime_types is distinct from next_originals) then
    raise exception using errcode = '23514', message = 'OSP_ORIGINALS_BUCKET_CONFLICT';
  end if;
  update storage.buckets set allowed_mime_types = next_originals where id = 'osp-originals';

  select * into corporate from storage.buckets where id = 'osp-corporate-documents' for update;
  if not found or corporate.public is distinct from false
     or corporate.file_size_limit is distinct from 26214400
     or (corporate.allowed_mime_types is distinct from old_corporate
         and corporate.allowed_mime_types is distinct from next_corporate) then
    raise exception using errcode = '23514', message = 'OSP_CORPORATE_BUCKET_CONFLICT';
  end if;
  update storage.buckets set allowed_mime_types = next_corporate where id = 'osp-corporate-documents';
end;
$request_manifest_bucket_boundary$;
