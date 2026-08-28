alter table osp_private.production_controls
  add column rateware_xlsx_routing_enabled boolean not null default false,
  add column rateware_xlsx_routing_active_after timestamptz;

alter table osp_private.production_controls
  add constraint osp_rateware_xlsx_routing_activation
  check (
    rateware_xlsx_routing_enabled =
      (rateware_xlsx_routing_active_after is not null)
  );

create index osp_background_jobs_ready_created_idx
  on osp_private.background_jobs (created_at, id)
  where completed_at is null;

create function osp_private.background_job_payload_object(p_payload jsonb)
returns jsonb
language plpgsql
immutable
parallel safe
security invoker
set search_path = pg_catalog
as $$
declare
  decoded jsonb;
begin
  if pg_catalog.jsonb_typeof(p_payload) = 'object' then
    return p_payload;
  end if;
  if pg_catalog.jsonb_typeof(p_payload) <> 'string' then
    return null;
  end if;
  begin
    decoded := (p_payload #>> '{}')::jsonb;
  exception when others then
    return null;
  end;
  return case when pg_catalog.jsonb_typeof(decoded) = 'object'
    then decoded else null end;
end;
$$;

create function osp_private.background_job_payload_uuid(
  p_payload jsonb,
  p_key text
) returns uuid
language plpgsql
immutable
parallel safe
security invoker
set search_path = pg_catalog, osp_private
as $$
declare
  decoded jsonb := osp_private.background_job_payload_object(p_payload);
  value text;
begin
  if decoded is null or p_key is null then return null; end if;
  value := decoded->>p_key;
  begin
    return value::uuid;
  exception when others then
    return null;
  end;
end;
$$;

revoke all on function osp_private.background_job_payload_object(jsonb)
  from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;
revoke all on function osp_private.background_job_payload_uuid(jsonb, text)
  from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;

create or replace function osp_private.claim_next_background_jobs(
  p_lease_ms integer,
  p_limit integer
) returns table (
  id uuid,
  organization_id uuid,
  kind text,
  opaque_payload jsonb,
  attempt integer,
  lease_token uuid,
  leased_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $$
declare
  now_at timestamptz := clock_timestamp();
  lease_deadline timestamptz;
begin
  if p_lease_ms is null or p_lease_ms < 1 or p_lease_ms > 900000
     or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = 'P0001', message = 'LEASE_CONFLICT';
  end if;
  lease_deadline := now_at + (p_lease_ms * interval '1 millisecond');

  return query
    with candidates as (
      select job.id
      from osp_private.background_jobs job
      cross join osp_private.production_controls control
      where control.id = 'singleton'
        and job.completed_at is null
        and (job.retry_at is null or job.retry_at <= now_at)
        and (job.leased_until is null or job.leased_until <= now_at)
        and (
          control.release_mode in ('internal_send', 'bounded_cohort')
          or (
            control.release_mode = 'shadow'
            and job.kind in ('gmail_ingest', 'duplicate_review_refresh')
          )
          or (
            control.release_mode = 'shadow'
            and control.outbound_enabled = false
            and control.rateware_xlsx_routing_enabled
            and job.created_at >= control.rateware_xlsx_routing_active_after
            and (
              (
                job.kind = 'document_extract'
                and exists (
                  select 1
                  from osp_private.document_versions version
                  join osp_private.documents document
                    on document.organization_id = version.organization_id
                   and document.id = version.document_id
                  join osp_private.customer_registration_cases case_record
                    on case_record.organization_id = document.organization_id
                   and case_record.id = document.case_id
                   and case_record.blocked_by_duplicate_review = false
                  join osp_private.gmail_attachments attachment
                    on attachment.organization_id = version.organization_id
                   and attachment.id = version.id
                  join osp_private.gmail_messages message
                    on message.organization_id = attachment.organization_id
                   and message.id = attachment.gmail_message_id
                   and message.received_at >=
                     control.rateware_xlsx_routing_active_after
                  join lateral (
                    select assessment.status, assessment.reason_code
                    from osp_private.source_safety_assessments assessment
                    where assessment.organization_id = version.organization_id
                      and assessment.document_version_id = version.id
                    order by assessment.version desc
                    limit 1
                  ) safety on true
                  where version.organization_id = job.organization_id
                    and version.id = osp_private.background_job_payload_uuid(
                      job.opaque_payload,
                      'documentVersionId'
                    )
                    and version.document_type = 'supplier_requirement'
                    and version.status in ('review_required', 'approved')
                    and version.bucket_id = 'osp-corporate-documents'
                    and version.content_type =
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    and safety.status = 'safe'
                    and safety.reason_code = 'strict_xlsx_package_policy'
                )
              )
              or (
                job.kind = 'form_ai_mapping'
                and exists (
                  select 1
                  from osp_private.document_extractions extraction
                  join osp_private.document_versions version
                    on version.organization_id = extraction.organization_id
                   and version.id = extraction.source_version_id
                  join osp_private.documents document
                    on document.organization_id = version.organization_id
                   and document.id = version.document_id
                  join osp_private.customer_registration_cases case_record
                    on case_record.organization_id = extraction.organization_id
                   and case_record.id = extraction.case_id
                   and case_record.blocked_by_duplicate_review = false
                  join osp_private.gmail_attachments attachment
                    on attachment.organization_id = version.organization_id
                   and attachment.id = version.id
                  join osp_private.gmail_messages message
                    on message.organization_id = attachment.organization_id
                   and message.id = attachment.gmail_message_id
                   and message.received_at >=
                     control.rateware_xlsx_routing_active_after
                  join lateral (
                    select assessment.status, assessment.reason_code
                    from osp_private.source_safety_assessments assessment
                    where assessment.organization_id = version.organization_id
                      and assessment.document_version_id = version.id
                    order by assessment.version desc
                    limit 1
                  ) safety on true
                  where extraction.organization_id = job.organization_id
                    and extraction.id = osp_private.background_job_payload_uuid(
                      job.opaque_payload,
                      'extractionId'
                    )
                    and extraction.case_id = osp_private.background_job_payload_uuid(
                      job.opaque_payload,
                      'caseId'
                    )
                    and version.content_type =
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    and safety.status = 'safe'
                    and safety.reason_code = 'strict_xlsx_package_policy'
                )
              )
            )
          )
        )
      order by job.created_at, job.id
      for update of job skip locked
      limit p_limit
    )
    update osp_private.background_jobs job
    set attempt = job.attempt + 1,
        lease_token = extensions.gen_random_uuid(),
        leased_until = lease_deadline
    from candidates
    where job.id = candidates.id
    returning job.id, job.organization_id, job.kind, job.opaque_payload,
      job.attempt, job.lease_token, job.leased_until;
end;
$$;

revoke all on function osp_private.claim_next_background_jobs(integer, integer)
  from public, anon, authenticated, service_role, osp_workflow_api;
grant execute on function osp_private.claim_next_background_jobs(integer, integer)
  to osp_worker;

create function osp_private.stage_rateware_xlsx_quote_from_lease(
  p_organization_id uuid,
  p_case_id uuid,
  p_source_background_job_id uuid,
  p_lease_token uuid,
  p_document_version_id uuid,
  p_source_sha256 text,
  p_quote jsonb
) returns table (
  raw_upload_id uuid,
  interpretation_job_id uuid,
  rate_staging_id uuid,
  inserted boolean
)
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $$
declare
  v_source record;
  v_owner_email text;
  v_workspace_id text;
  v_raw_upload_id uuid := extensions.gen_random_uuid();
  v_interpretation_job_id uuid := extensions.gen_random_uuid();
  v_rate_staging_id uuid := extensions.gen_random_uuid();
  v_existing osp_private.rateware_document_bridges%rowtype;
  v_linehaul numeric;
  v_border_fee numeric;
  v_fsc numeric;
  v_all_in numeric;
  v_weekly_capacity numeric;
  v_expected_total numeric;
  v_required_keys constant text[] := array[
    'allInRate', 'borderFee', 'destination', 'equipment', 'evidence', 'fsc',
    'fscMode', 'linehaul', 'operation', 'origin', 'parserVersion', 'rfx',
    'service', 'vendor', 'weeklyCapacity'
  ];
  v_evidence_keys constant text[] := array[
    'allInRate', 'borderFee', 'destination', 'equipment', 'fsc', 'linehaul',
    'operation', 'origin', 'rfx', 'service', 'vendor', 'weeklyCapacity'
  ];
  v_key text;
begin
  if p_organization_id is null or p_case_id is null or
     p_source_background_job_id is null or p_lease_token is null or
     p_document_version_id is null or p_source_sha256 is null or
     p_source_sha256 !~ '^[0-9a-f]{64}$' or
     pg_catalog.jsonb_typeof(p_quote) <> 'object' or
     (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_quote)) <>
       pg_catalog.cardinality(v_required_keys) or
     not p_quote ?& v_required_keys or
     p_quote->>'parserVersion' <> 'osp-rateware-xlsx-adjacent-label-v1' then
    raise exception using errcode = '22023', message = 'INVALID_RATEWARE_XLSX_ROUTE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_document_version_id::text,
      0
    )
  );

  if not exists (
    select 1
    from osp_private.production_controls control
    join osp_private.background_jobs job
      on job.organization_id = p_organization_id
     and job.id = p_source_background_job_id
    where control.id = 'singleton'
      and control.release_mode = 'shadow'
      and control.outbound_enabled = false
      and control.rateware_xlsx_routing_enabled
      and job.kind = 'document_extract'
      and job.created_at >= control.rateware_xlsx_routing_active_after
      and job.completed_at is null
      and job.lease_token = p_lease_token
      and job.leased_until > clock_timestamp()
      and osp_private.background_job_payload_uuid(
        job.opaque_payload,
        'documentVersionId'
      ) = p_document_version_id
  ) then
    raise exception using errcode = '55000', message = 'RATEWARE_XLSX_LEASE_REQUIRED';
  end if;

  select bridge.* into v_existing
  from osp_private.rateware_document_bridges bridge
  where bridge.organization_id = p_organization_id
    and bridge.document_version_id = p_document_version_id;
  if found then
    if v_existing.case_id <> p_case_id or
       v_existing.source_sha256 <> p_source_sha256 or
       v_existing.parser_version <> p_quote->>'parserVersion' then
      raise exception using errcode = '23505', message = 'RATEWARE_XLSX_IDEMPOTENCY_CONFLICT';
    end if;
    return query select
      v_existing.raw_upload_id,
      v_existing.interpretation_job_id,
      v_existing.rate_staging_id,
      false;
    return;
  end if;

  select
    version.bucket_id,
    version.opaque_object_key,
    version.content_type,
    version.source_sha256,
    document.case_id,
    safety.status as source_safety,
    safety.reason_code as source_safety_reason,
    message.received_at
  into strict v_source
  from osp_private.document_versions version
  join osp_private.documents document
    on document.organization_id = version.organization_id
   and document.id = version.document_id
  join osp_private.customer_registration_cases case_record
    on case_record.organization_id = document.organization_id
   and case_record.id = document.case_id
   and case_record.blocked_by_duplicate_review = false
  join osp_private.gmail_attachments attachment
    on attachment.organization_id = version.organization_id
   and attachment.id = version.id
  join osp_private.gmail_messages message
    on message.organization_id = attachment.organization_id
   and message.id = attachment.gmail_message_id
  join lateral (
    select assessment.status, assessment.reason_code
    from osp_private.source_safety_assessments assessment
    where assessment.organization_id = version.organization_id
      and assessment.document_version_id = version.id
    order by assessment.version desc
    limit 1
  ) safety on true
  join osp_private.production_controls control on control.id = 'singleton'
  where version.organization_id = p_organization_id
    and version.id = p_document_version_id
    and message.received_at >= control.rateware_xlsx_routing_active_after
    and version.document_type = 'supplier_requirement'
    and version.status in ('review_required', 'approved');

  if v_source.case_id <> p_case_id or
     v_source.bucket_id <> 'osp-corporate-documents' or
     v_source.content_type <>
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or
     v_source.source_sha256 <> p_source_sha256 or
     v_source.source_safety <> 'safe' or
     v_source.source_safety_reason <> 'strict_xlsx_package_policy' then
    raise exception using errcode = '22023', message = 'SOURCE_NOT_ELIGIBLE';
  end if;

  if pg_catalog.jsonb_typeof(p_quote->'evidence') <> 'object' or
     (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_quote->'evidence')) <>
       pg_catalog.cardinality(v_evidence_keys) or
     not (p_quote->'evidence') ?& v_evidence_keys then
    raise exception using errcode = '22023', message = 'RATEWARE_XLSX_EVIDENCE_INVALID';
  end if;
  foreach v_key in array v_evidence_keys loop
    if pg_catalog.jsonb_typeof(p_quote->'evidence'->v_key) <> 'array' or
       pg_catalog.jsonb_array_length(p_quote->'evidence'->v_key) <> 2 or
       exists (
         select 1
         from pg_catalog.jsonb_array_elements_text(p_quote->'evidence'->v_key) item(value)
         where item.value !~ '^xlsx:[1-9][0-9]*:[A-Z]{1,3}[1-9][0-9]*$'
       ) then
      raise exception using errcode = '22023', message = 'RATEWARE_XLSX_EVIDENCE_INVALID';
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.unnest(
      array['vendor','rfx','origin','destination','equipment','operation','service']
    ) candidate(key)
    where pg_catalog.jsonb_typeof(p_quote->candidate.key) <> 'string'
      or pg_catalog.length(pg_catalog.btrim(p_quote->>candidate.key)) not between 1 and 500
  ) or exists (
    select 1
    from pg_catalog.unnest(
      array['linehaul','borderFee','fsc','allInRate','weeklyCapacity']
    ) candidate(key)
    where pg_catalog.jsonb_typeof(p_quote->candidate.key) <> 'number'
  ) or p_quote->>'fscMode' not in ('fraction_of_linehaul', 'amount') then
    raise exception using errcode = '22023', message = 'RATEWARE_XLSX_VALUE_INVALID';
  end if;

  v_linehaul := (p_quote->>'linehaul')::numeric;
  v_border_fee := (p_quote->>'borderFee')::numeric;
  v_fsc := (p_quote->>'fsc')::numeric;
  v_all_in := (p_quote->>'allInRate')::numeric;
  v_weekly_capacity := (p_quote->>'weeklyCapacity')::numeric;
  if v_linehaul <= 0 or v_linehaul > 100000000 or
     v_border_fee < 0 or v_border_fee > 100000000 or
     v_fsc < 0 or v_fsc > 100000000 or
     v_all_in <= 0 or v_all_in > 100000000 or
     v_weekly_capacity < 1 or v_weekly_capacity > 10000 or
     v_weekly_capacity <> pg_catalog.trunc(v_weekly_capacity) then
    raise exception using errcode = '22023', message = 'RATEWARE_XLSX_RATE_INVALID';
  end if;
  v_expected_total := v_linehaul + v_border_fee + case
    when p_quote->>'fscMode' = 'fraction_of_linehaul' then v_linehaul * v_fsc
    else v_fsc
  end;
  if pg_catalog.abs(v_all_in - v_expected_total) > 0.01 then
    raise exception using errcode = '22023', message = 'RATEWARE_XLSX_TOTAL_INCONSISTENT';
  end if;

  select organization.owner_email, organization.organization_id
  into strict v_owner_email, v_workspace_id
  from public.organizations organization
  where organization.id = p_organization_id;
  if v_owner_email is null or v_workspace_id is null then
    raise exception using errcode = '22023', message = 'RATEWARE_WORKSPACE_NOT_FOUND';
  end if;

  insert into public.raw_uploads (
    id, filename, original_filename, storage_bucket, storage_path, mime_type,
    document_type, vendor_hint, rfx_hint, rfx_number, status, parsed_rows,
    staging_target, interpreted_at, notes, interpretation_audit, audit_status,
    audit_warnings, expected_rate_rows, interpreted_rate_rows, reprocess_count,
    last_reprocessed_at, owner_email, organization_id
  ) values (
    v_raw_upload_id,
    'osp-carrier-quote-' || pg_catalog.left(p_source_sha256, 16) || '.xlsx',
    'osp-carrier-quote-' || pg_catalog.left(p_source_sha256, 16) || '.xlsx',
    v_source.bucket_id,
    v_source.opaque_object_key,
    v_source.content_type,
    'xlsx',
    p_quote->>'vendor',
    p_quote->>'rfx',
    p_quote->>'rfx',
    'staged',
    1,
    'rate_staging',
    statement_timestamp(),
    'Deterministic OSP-to-Rateware route; preserved source; human review required.',
    pg_catalog.jsonb_build_object(
      'status', 'needs_review',
      'source', 'osp_rateware_xlsx_router',
      'source_document_version_id', p_document_version_id,
      'source_sha256', p_source_sha256,
      'parser_version', p_quote->>'parserVersion'
    ),
    'needs_review',
    array['currency_missing', 'normalization_pending', 'osp_rateware_xlsx_router'],
    1,
    1,
    1,
    statement_timestamp(),
    v_owner_email,
    v_workspace_id
  );

  insert into public.interpretation_jobs (
    id, raw_upload_id, status, model, extracted_rows, completed_at, correction_note
  ) values (
    v_interpretation_job_id,
    v_raw_upload_id,
    'completed',
    p_quote->>'parserVersion',
    1,
    statement_timestamp(),
    'Deterministic OSP-to-Rateware classification; no AI provider used.'
  );

  insert into public.rate_staging (
    id, raw_upload_id, interpretation_job_id, status, parse_status,
    vendor_reference, rfx_number, rfx_id, rfx_key, row_id,
    origin, destination, equipment, operation, service,
    flat_rate, border_crossing_fee, fsc, all_in_rate, weekly_capacity,
    source_filename, confidence, extraction_warnings, extracted_payload,
    field_confidence, source_evidence, audit_flags, owner_email, organization_id
  ) values (
    v_rate_staging_id,
    v_raw_upload_id,
    v_interpretation_job_id,
    'pending_review',
    'staged',
    p_quote->>'vendor',
    p_quote->>'rfx',
    p_quote->>'rfx',
    p_quote->>'rfx',
    'osp:' || p_document_version_id::text || ':1',
    p_quote->>'origin',
    p_quote->>'destination',
    p_quote->>'equipment',
    p_quote->>'operation',
    p_quote->>'service',
    v_linehaul::text,
    v_border_fee::text,
    case when p_quote->>'fscMode' = 'fraction_of_linehaul'
      then (v_fsc * 100)::text || '%'
      else v_fsc::text
    end,
    v_all_in::text,
    v_weekly_capacity::text,
    'osp-carrier-quote-' || pg_catalog.left(p_source_sha256, 16) || '.xlsx',
    1,
    array['currency_missing', 'normalization_pending', 'osp_rateware_xlsx_router'],
    p_quote || pg_catalog.jsonb_build_object(
      'sourceDocumentVersionId', p_document_version_id,
      'sourceSha256', p_source_sha256,
      'sourceBackgroundJobId', p_source_background_job_id
    ),
    pg_catalog.jsonb_build_object(
      'vendor_reference', 1, 'rfx_id', 1, 'origin', 1, 'destination', 1,
      'equipment', 1, 'operation', 1, 'service', 1, 'flat_rate', 1,
      'border_crossing_fee', 1, 'fsc', 1, 'all_in_rate', 1,
      'weekly_capacity', 1
    ),
    pg_catalog.jsonb_build_object(
      'source_document_version_id', p_document_version_id,
      'source_sha256', p_source_sha256,
      'evidence', p_quote->'evidence',
      'rate_mode', 'itemized_with_all_in'
    ),
    array['currency_missing', 'normalization_pending', 'osp_rateware_xlsx_router'],
    v_owner_email,
    v_workspace_id
  );

  insert into osp_private.rateware_document_bridges (
    organization_id, case_id, document_version_id, source_background_job_id,
    source_sha256, parser_version, raw_upload_id, interpretation_job_id,
    rate_staging_id
  ) values (
    p_organization_id, p_case_id, p_document_version_id,
    p_source_background_job_id, p_source_sha256, p_quote->>'parserVersion',
    v_raw_upload_id, v_interpretation_job_id, v_rate_staging_id
  );

  return query select
    v_raw_upload_id, v_interpretation_job_id, v_rate_staging_id, true;
end;
$$;

revoke all on function osp_private.stage_rateware_xlsx_quote_from_lease(
  uuid, uuid, uuid, uuid, uuid, text, jsonb
) from public, anon, authenticated, service_role, osp_workflow_api;
grant execute on function osp_private.stage_rateware_xlsx_quote_from_lease(
  uuid, uuid, uuid, uuid, uuid, text, jsonb
) to osp_worker;
