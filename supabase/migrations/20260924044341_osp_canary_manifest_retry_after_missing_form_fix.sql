-- Persist one review-only draft after a full in-memory dry run of this exact
-- synthetic case. Both failed jobs remain unchanged and outbound stays off.
do $$
declare
  target_org constant uuid := 'ca0a8f30-1382-4316-9bd5-cb76d9ab4920';
  target_case constant uuid := '0689a1ce-a96c-4186-9d9b-457ff5809c17';
  retry_job constant uuid := '9642dcbf-228e-4234-90a2-ebeb64d0530c';
  retry_key constant text :=
    'request-manifest-retry:0689a1ce-a96c-4186-9d9b-457ff5809c17:e03b9c95-629f-419a-8537-9234ce8bced7:e19f6ad7';
begin
  if exists (
    select 1 from osp_private.background_jobs job
    where job.id = retry_job
      and job.organization_id = target_org
      and job.kind = 'request_manifest'
      and job.opaque_payload = jsonb_build_object('caseId', target_case::text)
      and job.idempotency_key = retry_key
  ) then
    return;
  end if;

  if not exists (
    select 1 from osp_private.production_controls control
    where control.id = 'singleton'
      and control.release_mode = 'shadow'
      and control.outbound_enabled = false
  ) or not exists (
    select 1
    from osp_private.customer_registration_cases case_record
    join osp_private.gmail_messages message
      on message.organization_id = case_record.organization_id
     and message.case_id = case_record.id
     and message.gmail_message_id = case_record.gmail_message_id
    where case_record.organization_id = target_org
      and case_record.id = target_case
      and case_record.blocked_by_duplicate_review = false
      and message.subject like 'PRUEBA CONTROLADA OSP-CANARY-%'
  ) or not exists (
    select 1 from osp_private.background_jobs job
    where job.id = 'b76ccfac-d60f-4891-b45e-976f266b04ec'
      and job.organization_id = target_org
      and job.kind = 'request_manifest'
      and job.attempt = 1 and job.completed_at is not null
      and job.last_error_code = 'OPENAI_INVALID_RESPONSE'
  ) or not exists (
    select 1 from osp_private.background_jobs job
    where job.id = 'e03b9c95-629f-419a-8537-9234ce8bced7'
      and job.organization_id = target_org
      and job.kind = 'request_manifest'
      and job.attempt = 1 and job.completed_at is not null
      and job.last_error_code = 'PERMANENT_FAILURE'
  ) or not exists (
    select 1 from osp_private.background_jobs job
    where job.id = '207264b2-a5f9-4ed4-a319-5dd758a94446'
      and job.organization_id = target_org
      and job.kind = 'attachment_promote'
      and job.completed_at is not null
      and job.last_error_code is null
  ) or exists (
    select 1 from osp_private.request_manifest_drafts draft
    where draft.organization_id = target_org and draft.case_id = target_case
  ) or (
    select count(*) from osp_private.background_jobs job
    where job.organization_id = target_org
      and job.kind = 'request_manifest'
      and job.opaque_payload = jsonb_build_object('caseId', target_case::text)
  ) <> 2 then
    raise exception using errcode = 'P0001', message = 'EXACT_CANARY_RETRY_NOT_SAFE';
  end if;

  insert into osp_private.background_jobs (
    id, organization_id, kind, opaque_payload, idempotency_key
  ) values (
    retry_job, target_org, 'request_manifest',
    jsonb_build_object('caseId', target_case::text), retry_key
  );
end;
$$;
