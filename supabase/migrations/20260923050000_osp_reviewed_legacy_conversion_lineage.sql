-- A converted legacy Word file is never the Gmail original. Keep both hashes,
-- the case binding and the human fidelity decision before it can unblock OSP.

create table osp_private.manual_attachment_conversion_candidates (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  source_attachment_id uuid not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  converted_sha256 text not null check (converted_sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by_subject text not null check (
    char_length(uploaded_by_subject) between 1 and 256
    and uploaded_by_subject ~ '^[A-Za-z0-9:_@.-]+$'
  ),
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id),
  foreign key (source_attachment_id)
    references osp_private.gmail_attachments(id),
  foreign key (organization_id, id)
    references osp_private.document_versions(organization_id, id)
);

alter table osp_private.manual_attachment_conversion_candidates enable row level security;
create policy osp_manual_attachment_conversion_candidates_tenant
  on osp_private.manual_attachment_conversion_candidates for all to osp_workflow_api
  using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid)
  with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
revoke all on osp_private.manual_attachment_conversion_candidates
  from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;
grant select, insert on osp_private.manual_attachment_conversion_candidates
  to osp_workflow_api;

create table osp_private.manual_attachment_conversions (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  source_attachment_id uuid not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  converted_document_version_id uuid not null,
  converted_sha256 text not null check (converted_sha256 ~ '^[0-9a-f]{64}$'),
  source_page_count integer not null check (source_page_count between 1 and 1000),
  converted_page_count integer not null check (converted_page_count between 1 and 1000),
  reviewed_by_subject text not null check (
    char_length(reviewed_by_subject) between 1 and 256
    and reviewed_by_subject ~ '^[A-Za-z0-9:_@.-]+$'
  ),
  reviewed_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, source_attachment_id),
  unique (organization_id, converted_document_version_id),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id),
  foreign key (source_attachment_id)
    references osp_private.gmail_attachments(id),
  foreign key (organization_id, converted_document_version_id)
    references osp_private.document_versions(organization_id, id),
  check (source_page_count = converted_page_count)
);

alter table osp_private.manual_attachment_conversions enable row level security;
create policy osp_manual_attachment_conversions_tenant
  on osp_private.manual_attachment_conversions for select to osp_workflow_api
  using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
revoke all on osp_private.manual_attachment_conversions
  from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;
grant select on osp_private.manual_attachment_conversions to osp_workflow_api;

create function osp_private.record_manual_attachment_conversion_review(
  p_organization_id uuid,
  p_case_id uuid,
  p_source_attachment_id uuid,
  p_source_sha256 text,
  p_converted_document_version_id uuid,
  p_converted_sha256 text,
  p_source_page_count integer,
  p_converted_page_count integer,
  p_reviewer_subject text,
  p_fidelity_confirmed boolean
)
returns table (conversion_id uuid, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $$
declare
  existing osp_private.manual_attachment_conversions%rowtype;
  inserted_id uuid;
begin
  if p_organization_id is null or p_case_id is null
     or p_source_attachment_id is null or p_converted_document_version_id is null
     or p_source_sha256 !~ '^[0-9a-f]{64}$'
     or p_converted_sha256 !~ '^[0-9a-f]{64}$'
     or p_source_page_count is null or p_source_page_count not between 1 and 1000
     or p_converted_page_count is null or p_converted_page_count <> p_source_page_count
     or p_reviewer_subject !~ '^[A-Za-z0-9:_@.-]{1,256}$'
     or p_fidelity_confirmed is distinct from true
     or nullif(current_setting('osp.organization_id', true), '')::uuid
        is distinct from p_organization_id then
    raise exception using errcode = '23514', message = 'OSP_CONVERSION_REVIEW_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text || ':legacy-conversion:' || p_source_attachment_id::text, 0
  ));
  select * into existing
  from osp_private.manual_attachment_conversions value
  where value.organization_id = p_organization_id
    and value.source_attachment_id = p_source_attachment_id;
  if found then
    if existing.case_id <> p_case_id
       or existing.source_sha256 <> p_source_sha256
       or existing.converted_document_version_id <> p_converted_document_version_id
       or existing.converted_sha256 <> p_converted_sha256
       or existing.source_page_count <> p_source_page_count
       or existing.converted_page_count <> p_converted_page_count
       or existing.reviewed_by_subject <> p_reviewer_subject then
      raise exception using errcode = '23505', message = 'OSP_CONVERSION_REVIEW_CONFLICT';
    end if;
    return query select existing.id, true;
    return;
  end if;

  if not exists (
    select 1
    from osp_private.gmail_attachments source
    join osp_private.gmail_messages message
      on message.organization_id = source.organization_id
     and message.id = source.gmail_message_id
    where source.organization_id = p_organization_id
      and source.id = p_source_attachment_id
      and source.source_sha256 = p_source_sha256
      and source.content_type = 'application/msword'
      and source.processing_disposition = 'manual_conversion_required'
      and message.case_id = p_case_id
  ) or not exists (
    select 1 from osp_private.manual_attachment_conversion_candidates candidate
    where candidate.organization_id = p_organization_id
      and candidate.case_id = p_case_id
      and candidate.source_attachment_id = p_source_attachment_id
      and candidate.source_sha256 = p_source_sha256
      and candidate.id = p_converted_document_version_id
      and candidate.converted_sha256 = p_converted_sha256
  ) or not exists (
    select 1
    from osp_private.document_versions converted
    join osp_private.documents document
      on document.organization_id = converted.organization_id
     and document.id = converted.document_id
    where converted.organization_id = p_organization_id
      and converted.id = p_converted_document_version_id
      and converted.source_sha256 = p_converted_sha256
      and converted.content_type =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      and converted.document_type = 'supplier_requirement'
      and converted.bucket_id = 'osp-corporate-documents'
      and converted.status = 'approved'
      and converted.retention_disposition = 'retain'
      and converted.approved_by_subject = p_reviewer_subject
      and document.case_id = p_case_id
      and (
        select safety.status from osp_private.source_safety_assessments safety
        where safety.organization_id = converted.organization_id
          and safety.document_version_id = converted.id
          and safety.content_sha256 = converted.source_sha256
        order by safety.version desc
        limit 1
      ) = 'safe'
      and exists (
        select 1 from osp_private.review_decisions decision
        where decision.organization_id = converted.organization_id
          and decision.case_id = p_case_id
          and decision.subject_kind = 'document_version'
          and decision.subject_id = converted.id
          and decision.decision = 'accepted'
          and decision.reason_code = 'DOCUMENT_APPROVED'
          and decision.before_sha256 = converted.source_sha256
          and decision.after_sha256 = converted.source_sha256
          and decision.reviewer_subject = p_reviewer_subject
      )
  ) then
    raise exception using errcode = '23514', message = 'OSP_CONVERSION_REVIEW_SOURCE_INVALID';
  end if;

  inserted_id := gen_random_uuid();
  insert into osp_private.manual_attachment_conversions (
    id, organization_id, case_id, source_attachment_id, source_sha256,
    converted_document_version_id, converted_sha256, source_page_count,
    converted_page_count, reviewed_by_subject
  ) values (
    inserted_id, p_organization_id, p_case_id, p_source_attachment_id,
    p_source_sha256, p_converted_document_version_id, p_converted_sha256,
    p_source_page_count, p_converted_page_count, p_reviewer_subject
  );
  return query select inserted_id, false;
end;
$$;

revoke all on function osp_private.record_manual_attachment_conversion_review(
  uuid, uuid, uuid, text, uuid, text, integer, integer, text, boolean
) from public, anon, authenticated, service_role, osp_worker;
grant execute on function osp_private.record_manual_attachment_conversion_review(
  uuid, uuid, uuid, text, uuid, text, integer, integer, text, boolean
) to osp_workflow_api;
