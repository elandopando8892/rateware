-- Review an answer, not documentary evidence or permission for automatic reuse.
create table osp_private.case_answer_memory_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  candidate_id uuid not null unique references osp_private.case_answer_memory_candidates(id),
  idempotency_key text not null check (length(idempotency_key) between 1 and 256 and idempotency_key ~ '^[A-Za-z0-9:_-]+$'),
  answer_sha256 text not null check (answer_sha256 ~ '^[0-9a-f]{64}$'),
  decision text not null check (decision in ('accepted', 'rejected')),
  reason text not null check (length(btrim(reason)) between 10 and 1000),
  actor_subject text not null check (length(actor_subject) between 1 and 256),
  decided_at timestamptz not null default statement_timestamp(),
  unique (organization_id, idempotency_key)
);
alter table osp_private.case_answer_memory_reviews enable row level security;
revoke all on osp_private.case_answer_memory_reviews from public, anon, authenticated, service_role, osp_worker, osp_workflow_api;
grant select on osp_private.case_answer_memory_reviews to osp_workflow_api;
create policy answer_memory_reviews_tenant_read on osp_private.case_answer_memory_reviews
  for select to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);

create function osp_private.review_case_answer_memory(
  p_organization_id uuid, p_case_id uuid, p_candidate_id uuid, p_answer_sha256 text,
  p_decision text, p_reason text, p_subject text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  candidate osp_private.case_answer_memory_candidates%rowtype;
  receipt osp_private.case_answer_memory_reviews%rowtype;
  instance osp_private.case_form_instances%rowtype;
  binding osp_private.case_profile_bindings%rowtype;
begin
  if nullif(current_setting('osp.organization_id', true), '')::uuid is distinct from p_organization_id
    or nullif(current_setting('osp.actor_subject', true), '') is distinct from p_subject
    or coalesce(current_setting('osp.actor_permission', true), '') not in ('osp:operate', 'osp:superuser') then
    raise exception using errcode='42501', message='FORM_MEMORY_FORBIDDEN';
  end if;
  if p_subject is null or length(p_subject) not between 1 and 256
    or p_answer_sha256 is null or p_answer_sha256 !~ '^[0-9a-f]{64}$'
    or p_decision is null or p_decision not in ('accepted','rejected')
    or p_reason is null or length(btrim(p_reason)) not between 10 and 1000
    or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 256 or p_idempotency_key !~ '^[A-Za-z0-9:_-]+$' then
    raise exception using errcode='22023', message='FORM_MEMORY_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':answer-memory:' || p_idempotency_key, 0));
  select * into candidate from osp_private.case_answer_memory_candidates
    where organization_id=p_organization_id and case_id=p_case_id and id=p_candidate_id for update;
  if not found then raise exception using errcode='22023', message='FORM_MEMORY_NOT_FOUND'; end if;
  select * into receipt from osp_private.case_answer_memory_reviews
    where organization_id=p_organization_id and idempotency_key=p_idempotency_key;
  if found then
    if receipt.candidate_id <> p_candidate_id or receipt.answer_sha256 <> p_answer_sha256
      or receipt.decision <> p_decision or receipt.reason <> btrim(p_reason) or receipt.actor_subject <> p_subject then
      raise exception using errcode='23514', message='IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('reviewId',receipt.id,'decision',receipt.decision,'replayed',true,'approvedForReuse',false);
  end if;
  if candidate.answer_sha256 <> p_answer_sha256 or exists (select 1 from osp_private.case_answer_memory_reviews where candidate_id=p_candidate_id) then
    raise exception using errcode='23514', message='FORM_MEMORY_CONFLICT';
  end if;
  if p_decision = 'accepted' then
    -- Same lock order as form preparation: instance, then binding. Locks survive until commit.
    select * into instance from osp_private.case_form_instances where organization_id=p_organization_id
      and case_id=p_case_id and id=candidate.source_instance_id for share;
    if not found or instance.version <> candidate.source_instance_version
      or instance.template_version_id <> candidate.source_template_version_id
      or instance.values_json->candidate.field_key is distinct from candidate.answer_value then
      raise exception using errcode='23514', message='FORM_MEMORY_STALE';
    end if;
    select * into binding from osp_private.case_profile_bindings where organization_id=p_organization_id and case_id=p_case_id for share;
    if not found or candidate.legal_entity_id is null or binding.legal_entity_id is distinct from candidate.legal_entity_id
      or binding.revision is distinct from candidate.binding_revision then
      raise exception using errcode='23514', message='FORM_MEMORY_UNBOUND_OR_STALE';
    end if;
  end if;
  insert into osp_private.case_answer_memory_reviews(organization_id,candidate_id,idempotency_key,answer_sha256,decision,reason,actor_subject)
    values(p_organization_id,p_candidate_id,p_idempotency_key,p_answer_sha256,p_decision,btrim(p_reason),p_subject) returning * into receipt;
  return jsonb_build_object('reviewId',receipt.id,'decision',receipt.decision,'replayed',false,'approvedForReuse',false);
end;
$$;
revoke all on function osp_private.review_case_answer_memory(uuid,uuid,uuid,text,text,text,text,text) from public, anon, authenticated, service_role, osp_worker;
grant execute on function osp_private.review_case_answer_memory(uuid,uuid,uuid,text,text,text,text,text) to osp_workflow_api;
comment on table osp_private.case_answer_memory_reviews is 'Append-only human assessment of a saved answer. Acceptance is not corporate fact promotion, documentary verification, training, disclosure or permission to reuse.';
