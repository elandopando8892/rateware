-- Human decisions over an AI request manifest. This is an append-only internal
-- review ledger. It cannot sign, send, disclose data, call a webhook, or invoke
-- a provider. A later package draft may proceed only after a resolved review.

create table osp_private.request_manifest_decision_reviews (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  manifest_draft_id uuid not null,
  manifest_version integer not null check (manifest_version between 1 and 2147483647),
  review_version integer not null check (review_version between 1 and 2147483647),
  source_case_version bigint not null check (source_case_version between 0 and 2147483647),
  status text not null check (status in ('resolved', 'needs_external_clarification')),
  decisions_json jsonb not null check (
    jsonb_typeof(decisions_json) = 'array'
    and jsonb_array_length(decisions_json) between 0 and 200
    and octet_length(decisions_json::text) between 2 and 524288
  ),
  canonical_sha256 text not null check (canonical_sha256 ~ '^[0-9a-f]{64}$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  previous_review_id uuid,
  reviewed_by_subject text not null check (
    reviewed_by_subject = btrim(reviewed_by_subject)
    and char_length(reviewed_by_subject) between 1 and 256
    and reviewed_by_subject ~ '^[A-Za-z0-9:_@.-]+$'
  ),
  reviewed_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, case_id, manifest_draft_id, review_version),
  unique (organization_id, case_id, manifest_draft_id, canonical_sha256),
  unique (organization_id, previous_review_id),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id) on delete restrict,
  foreign key (organization_id, manifest_draft_id)
    references osp_private.request_manifest_drafts(organization_id, id) on delete restrict,
  foreign key (organization_id, previous_review_id)
    references osp_private.request_manifest_decision_reviews(organization_id, id) on delete restrict
);

create index request_manifest_decision_reviews_case_latest
  on osp_private.request_manifest_decision_reviews(
    organization_id, case_id, manifest_draft_id, review_version desc
  );

create function osp_private.reject_request_manifest_decision_review_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using errcode = '55000', message = 'REQUEST_MANIFEST_DECISION_REVIEW_APPEND_ONLY';
end;
$function$;

create trigger request_manifest_decision_reviews_append_only
before update or delete on osp_private.request_manifest_decision_reviews
for each row execute function osp_private.reject_request_manifest_decision_review_mutation();

alter table osp_private.request_manifest_decision_reviews enable row level security;
alter table osp_private.request_manifest_decision_reviews force row level security;

revoke all on osp_private.request_manifest_decision_reviews
from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;
grant select, insert on osp_private.request_manifest_decision_reviews to osp_workflow_api;
grant select on osp_private.request_manifest_decision_reviews to osp_worker;

create policy request_manifest_decision_reviews_workflow_select_tenant
on osp_private.request_manifest_decision_reviews for select to osp_workflow_api
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);

create policy request_manifest_decision_reviews_workflow_insert_tenant
on osp_private.request_manifest_decision_reviews for insert to osp_workflow_api
with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);

create policy request_manifest_decision_reviews_worker_read_tenant
on osp_private.request_manifest_decision_reviews for select to osp_worker
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);

revoke all on function osp_private.reject_request_manifest_decision_review_mutation()
from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;

comment on table osp_private.request_manifest_decision_reviews is
'Append-only human review of one preserved request manifest. No external effects are permitted.';
