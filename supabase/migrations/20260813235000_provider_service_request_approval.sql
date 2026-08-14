-- Convergence hardening: create approval requests only through a bounded command.
create or replace function public.provider_service_request_approval(
  p_organization_id uuid,
  p_legal_entity_id uuid,
  p_action_code text,
  p_approval_mode text,
  p_requested_by_actor_type text default 'user',
  p_requested_by_user_id text default null,
  p_provider_relationship_id uuid default null,
  p_case_id uuid default null,
  p_agent_run_id uuid default null,
  p_action_proposal_id uuid default null,
  p_document_version_id uuid default null,
  p_action_payload_snapshot jsonb default '{}'::jsonb,
  p_sensitivity text default 'internal',
  p_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entity_code text;
  normalized_action text := lower(btrim(coalesce(p_action_code,'')));
  normalized_mode text := lower(btrim(coalesce(p_approval_mode,'')));
  normalized_actor text := lower(btrim(coalesce(p_requested_by_actor_type,'user')));
  normalized_sensitivity text := lower(btrim(coalesce(p_sensitivity,'internal')));
  proposal public.provider_agent_action_proposals%rowtype;
  run_row public.provider_agent_runs%rowtype;
  approval_id uuid;
  approval_code_value text;
  canonical_payload jsonb := coalesce(p_action_payload_snapshot,'{}'::jsonb);
  canonical_sensitivity text;
begin
  if normalized_action !~ '^[a-z][a-z0-9_]{1,127}$' then
    raise exception 'Approval action code is invalid.' using errcode='22023';
  end if;
  if normalized_mode not in ('human','finance','legal','executive') then
    raise exception 'Approval mode must be human, finance, legal, or executive.' using errcode='22023';
  end if;
  if normalized_actor not in ('user','agent','system','integration') then
    raise exception 'Approval requester actor type is invalid.' using errcode='22023';
  end if;
  if normalized_actor='user' and nullif(btrim(coalesce(p_requested_by_user_id,'')),'') is null then
    raise exception 'User approval requests require an identified user.' using errcode='22023';
  end if;
  if normalized_sensitivity not in ('public','internal','confidential','restricted','highly_restricted') then
    raise exception 'Approval sensitivity is invalid.' using errcode='22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Approval expiry must be in the future.' using errcode='22023';
  end if;

  select legal_entity.entity_code into v_entity_code
  from public.legal_entities legal_entity
  where legal_entity.organization_id=p_organization_id
    and legal_entity.id=p_legal_entity_id
    and legal_entity.status='active';
  if not found then raise exception 'Active legal entity not found.' using errcode='P0002'; end if;

  if p_provider_relationship_id is not null and not exists (
    select 1 from public.provider_relationships relationship
    where relationship.organization_id=p_organization_id
      and relationship.id=p_provider_relationship_id
      and relationship.legal_entity_id=p_legal_entity_id
  ) then
    raise exception 'Provider relationship does not belong to the legal entity.' using errcode='23514';
  end if;

  if p_action_proposal_id is not null then
    select action_proposal.* into proposal
    from public.provider_agent_action_proposals action_proposal
    where action_proposal.organization_id=p_organization_id and action_proposal.id=p_action_proposal_id
    for update;
    if not found then raise exception 'Agent action proposal not found.' using errcode='P0002'; end if;

    if proposal.policy_decision <> 'approval_required' then
      raise exception 'Agent action proposal is not approval-eligible.' using errcode='23514';
    end if;
    if lower(proposal.action_code) <> normalized_action or lower(proposal.approval_mode) <> normalized_mode then
      raise exception 'Approval request does not match the agent proposal policy.' using errcode='23514';
    end if;
    if p_agent_run_id is not null and proposal.agent_run_id <> p_agent_run_id then
      raise exception 'Agent run does not match the action proposal.' using errcode='23514';
    end if;

    select agent_run.* into run_row
    from public.provider_agent_runs agent_run
    where agent_run.organization_id=p_organization_id and agent_run.id=proposal.agent_run_id
    for update;
    if not found or run_row.legal_entity_id <> p_legal_entity_id then
      raise exception 'Agent run is outside the approval legal entity.' using errcode='23514';
    end if;
    if run_row.provider_relationship_id is distinct from p_provider_relationship_id then
      raise exception 'Approval relationship does not match the agent run.' using errcode='23514';
    end if;

    select request.id into approval_id
    from public.provider_approval_requests request
    where request.organization_id=p_organization_id
      and request.action_proposal_id=p_action_proposal_id
      and request.status in ('requested','approved')
      and (request.expires_at is null or request.expires_at>now())
    order by request.requested_at desc,request.id desc
    limit 1;
    if approval_id is not null then return approval_id; end if;

    canonical_payload := proposal.action_payload;
    canonical_sensitivity := proposal.sensitivity;
  else
    canonical_sensitivity := normalized_sensitivity;
  end if;

  insert into public.provider_approval_requests (
    organization_id,legal_entity_id,legal_entity_code,provider_relationship_id,case_id,
    agent_run_id,action_proposal_id,document_version_id,approval_mode,action_code,
    action_payload_snapshot,sensitivity,requested_by_actor_type,requested_by_user_id,
    expires_at,metadata
  ) values (
    p_organization_id,p_legal_entity_id,v_entity_code,p_provider_relationship_id,p_case_id,
    coalesce(p_agent_run_id,proposal.agent_run_id),p_action_proposal_id,p_document_version_id,
    normalized_mode,normalized_action,canonical_payload,canonical_sensitivity,normalized_actor,
    nullif(btrim(coalesce(p_requested_by_user_id,'')),''),p_expires_at,coalesce(p_metadata,'{}'::jsonb)
  ) returning id,approval_code into approval_id,approval_code_value;

  insert into public.provider_approval_events (
    organization_id,approval_request_id,event_type,actor_type,actor_user_id,payload
  ) values (
    p_organization_id,approval_id,'approval_requested',normalized_actor,
    nullif(btrim(coalesce(p_requested_by_user_id,'')),''),
    jsonb_build_object('approval_code',approval_code_value,'action_code',normalized_action,'approval_mode',normalized_mode)
  );

  if p_action_proposal_id is not null then
    update public.provider_agent_action_proposals
    set proposal_state='awaiting_approval',approval_reference=approval_code_value,updated_at=now()
    where organization_id=p_organization_id and id=p_action_proposal_id;
    update public.provider_agent_runs
    set status='awaiting_approval',updated_at=now()
    where organization_id=p_organization_id and id=proposal.agent_run_id
      and status not in ('completed','failed','cancelled');
  end if;

  return approval_id;
end;
$$;

revoke all on function public.provider_service_request_approval(uuid,uuid,text,text,text,text,uuid,uuid,uuid,uuid,uuid,jsonb,text,timestamptz,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.provider_service_request_approval(uuid,uuid,text,text,text,text,uuid,uuid,uuid,uuid,uuid,jsonb,text,timestamptz,jsonb) to service_role;
