alter table osp_private.production_controls
  add column osp_xlsx_intake_enabled boolean not null default false,
  add column osp_xlsx_intake_active_after timestamptz;

alter table osp_private.production_controls
  add constraint osp_xlsx_intake_activation
  check (
    osp_xlsx_intake_enabled = (osp_xlsx_intake_active_after is not null)
  );

do $$
declare
  affected integer;
begin
  update osp_private.production_controls
  set rateware_xlsx_routing_enabled = false,
      rateware_xlsx_routing_active_after = null,
      osp_xlsx_intake_enabled = false,
      osp_xlsx_intake_active_after = null,
      version = version + 1,
      updated_at = statement_timestamp()
  where id = 'singleton'
    and release_mode = 'shadow'
    and outbound_enabled = false
    and version < 2147483647;

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception using
      errcode = '55000',
      message = 'OSP_XLSX_INTAKE_CORRECTION_CONFLICT';
  end if;
end;
$$;

create function osp_private.load_xbf_customer_setup_candidates(
  p_organization_id uuid
) returns table (
  field_key text,
  value_json jsonb,
  evidence_id text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  tenant_id uuid;
  eligible_entities integer;
begin
  begin
    tenant_id := nullif(current_setting('osp.organization_id', true), '')::uuid;
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_ORGANIZATION_CONTEXT';
  end;
  if p_organization_id is null or tenant_id is distinct from p_organization_id then
    raise exception using errcode = '22023', message = 'INVALID_ORGANIZATION_CONTEXT';
  end if;

  select count(distinct entity.id)
  into eligible_entities
  from public.legal_entities entity
  join public.provider_legal_entity_facts fact
    on fact.organization_id = entity.organization_id
   and fact.legal_entity_id = entity.id
   and fact.fact_status = 'current'
   and fact.field_code in (
     'legal_name', 'rfc', 'tax_id', 'fiscal_address',
     'bank_account', 'bank_account_number', 'clabe'
   )
  where entity.organization_id = p_organization_id
    and entity.status = 'active';

  if eligible_entities <> 1 then return; end if;

  return query
    select case
        when fact.field_code = 'legal_name' then 'supplier.legalName'
        when fact.field_code in ('rfc', 'tax_id') then 'fiscal.taxIdentifier'
        when fact.field_code = 'fiscal_address' then 'supplier.address'
        when fact.field_code in ('bank_account', 'bank_account_number', 'clabe')
          then 'banking.accountNumber'
      end,
      fact.fact_value,
      'rateware:legal-entity-fact:' || fact.id::text
    from public.legal_entities entity
    join public.provider_legal_entity_facts fact
      on fact.organization_id = entity.organization_id
     and fact.legal_entity_id = entity.id
     and fact.fact_status = 'current'
     and fact.field_code in (
       'legal_name', 'rfc', 'tax_id', 'fiscal_address',
       'bank_account', 'bank_account_number', 'clabe'
     )
    where entity.organization_id = p_organization_id
      and entity.status = 'active'
    order by 1, fact.field_code, fact.id;
end;
$$;

revoke all on function osp_private.load_xbf_customer_setup_candidates(uuid)
  from public, anon, authenticated, service_role, osp_workflow_api;
grant execute on function osp_private.load_xbf_customer_setup_candidates(uuid)
  to osp_worker;

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
            and control.osp_xlsx_intake_enabled
            and job.created_at >= control.osp_xlsx_intake_active_after
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
                   and message.received_at >= control.osp_xlsx_intake_active_after
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
                   and message.received_at >= control.osp_xlsx_intake_active_after
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

revoke all on function osp_private.stage_rateware_xlsx_quote(
  uuid, uuid, uuid, uuid, text, jsonb
) from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;

revoke all on function osp_private.stage_rateware_xlsx_quote_from_lease(
  uuid, uuid, uuid, uuid, uuid, text, jsonb
) from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;

comment on column osp_private.production_controls.osp_xlsx_intake_enabled is
  'Allows strict XLSX customer-setup extraction and form preparation inside OSP; never Rateware rate staging or outbound.';

comment on function osp_private.load_xbf_customer_setup_candidates(uuid) is
  'Read-only, tenant-scoped bridge from the shared Rateware legal-entity facts into OSP customer-setup preparation. Returns no rows when the target XBF entity is ambiguous.';
