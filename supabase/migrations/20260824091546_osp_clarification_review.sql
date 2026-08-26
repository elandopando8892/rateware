alter table osp_private.clarification_drafts
  add column version integer,
  add column status text,
  add column questions_json jsonb,
  add column evidence_ids text[],
  add column canonical_sha256 text,
  add column authorization_mailbox text not null default 'sales@heymarksman.com',
  add column source_draft_id uuid,
  add column reviewed_by_subject text,
  add column reviewed_at timestamptz;

with ranked as (
  select id,
    row_number() over (partition by organization_id, case_id order by created_at, id)::integer as version
  from osp_private.clarification_drafts
)
update osp_private.clarification_drafts draft
set version = ranked.version,
    status = 'operations_review_required',
    questions_json = jsonb_build_array(jsonb_build_object(
      'kind', 'missing',
      'fieldId', 'legacy.body',
      'question', draft.body,
      'evidenceIds', jsonb_build_array('legacy:' || draft.id::text)
    )),
    evidence_ids = array['legacy:' || draft.id::text],
    canonical_sha256 = encode(extensions.digest(convert_to(draft.body, 'UTF8'), 'sha256'), 'hex')
from ranked
where ranked.id = draft.id;

alter table osp_private.clarification_drafts
  alter column version set not null,
  alter column status set not null,
  alter column questions_json set not null,
  alter column evidence_ids set not null,
  alter column canonical_sha256 set not null,
  add constraint osp_clarification_version_check check (version between 1 and 2147483647),
  add constraint osp_clarification_status_check check (status in ('operations_review_required', 'operations_reviewed')),
  add constraint osp_clarification_questions_check check (
    jsonb_typeof(questions_json) = 'array'
    and jsonb_array_length(questions_json) between 1 and 50
  ),
  add constraint osp_clarification_evidence_check check (cardinality(evidence_ids) between 1 and 1000),
  add constraint osp_clarification_sha_check check (canonical_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint osp_clarification_mailbox_check check (authorization_mailbox = 'sales@heymarksman.com'),
  add constraint osp_clarification_review_state_check check (
    (status = 'operations_review_required' and source_draft_id is null and reviewed_by_subject is null and reviewed_at is null)
    or
    (status = 'operations_reviewed' and source_draft_id is not null and reviewed_by_subject is not null and reviewed_at is not null)
  ),
  add constraint osp_clarification_org_id_unique unique (organization_id, id),
  add constraint osp_clarification_case_version_unique unique (organization_id, case_id, version),
  add constraint osp_clarification_case_hash_unique unique (organization_id, case_id, canonical_sha256),
  add constraint osp_clarification_source_unique unique (organization_id, source_draft_id),
  add constraint osp_clarification_source_fk foreign key (organization_id, source_draft_id)
    references osp_private.clarification_drafts(organization_id, id);

create function osp_private.reject_clarification_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, osp_private
as $function$
begin
  raise exception using errcode = 'P0001', message = 'CLARIFICATION_APPEND_ONLY';
end;
$function$;

create trigger osp_clarification_drafts_append_only
before update or delete on osp_private.clarification_drafts
for each row execute function osp_private.reject_clarification_mutation();

revoke update, delete on osp_private.clarification_drafts from osp_workflow_api;
grant select, insert on osp_private.clarification_drafts to osp_workflow_api;
revoke all on function osp_private.reject_clarification_mutation() from public, anon, authenticated;
