create or replace function public.provider_service_decide_approval(
  p_organization_id uuid,
  p_approval_request_id uuid,
  p_decision text,
  p_decided_by_user_id text,
  p_decision_note text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  approval_row public.provider_approval_requests%rowtype;
  normalized_decision text;
begin
  normalized_decision := lower(btrim(coalesce(p_decision,'')));
  if normalized_decision not in ('approved','rejected') then
    raise exception 'Approval decision must be approved or rejected.' using errcode='22023';
  end if;
  if nullif(btrim(coalesce(p_decided_by_user_id,'')),'') is null then
    raise exception 'Approval decision requires an identified user.' using errcode='22023';
  end if;

  select * into approval_row
  from public.provider_approval_requests
  where organization_id=p_organization_id and id=p_approval_request_id
  for update;

  if not found then raise exception 'Approval request not found.' using errcode='P0002'; end if;
  if approval_row.status <> 'requested' then raise exception 'Approval request is not pending.' using errcode='23514'; end if;
  if approval_row.expires_at is not null and approval_row.expires_at <= now() then raise exception 'Approval request has expired.' using errcode='23514'; end if;
  if approval_row.requested_by_user_id is not null and approval_row.requested_by_user_id=p_decided_by_user_id then raise exception 'Requester cannot decide the same approval.' using errcode='23514'; end if;

  update public.provider_approval_requests
  set status=normalized_decision,
      decided_by_user_id=btrim(p_decided_by_user_id),
      decided_at=now(),
      decision_note=nullif(btrim(coalesce(p_decision_note,'')),''),
      updated_at=now()
  where organization_id=p_organization_id and id=p_approval_request_id;

  insert into public.provider_approval_events (organization_id,approval_request_id,event_type,actor_type,actor_user_id,correlation_id,payload)
  values (p_organization_id,p_approval_request_id,'approval_decided','user',btrim(p_decided_by_user_id),approval_row.correlation_id,jsonb_build_object('decision',normalized_decision));

  return normalized_decision;
end;
$$;

create or replace function public.provider_service_consume_approval(
  p_organization_id uuid,
  p_approval_request_id uuid,
  p_actor_type text default 'system',
  p_actor_user_id text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  approval_row public.provider_approval_requests%rowtype;
begin
  select * into approval_row
  from public.provider_approval_requests
  where organization_id=p_organization_id and id=p_approval_request_id
  for update;
  if not found then raise exception 'Approval request not found.' using errcode='P0002'; end if;
  if approval_row.status <> 'approved' then raise exception 'Only approved requests can be consumed.' using errcode='23514'; end if;
  if approval_row.expires_at is not null and approval_row.expires_at <= now() then raise exception 'Approval request has expired.' using errcode='23514'; end if;

  update public.provider_approval_requests set status='consumed',consumed_at=now(),updated_at=now()
  where organization_id=p_organization_id and id=p_approval_request_id;

  insert into public.provider_approval_events (organization_id,approval_request_id,event_type,actor_type,actor_user_id,correlation_id,payload)
  values (p_organization_id,p_approval_request_id,'approval_consumed',lower(btrim(coalesce(p_actor_type,'system'))),p_actor_user_id,approval_row.correlation_id,'{}'::jsonb);
  return 'consumed';
end;
$$;

revoke all on function public.provider_service_decide_approval(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.provider_service_consume_approval(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.provider_service_decide_approval(uuid,uuid,text,text,text) to service_role;
grant execute on function public.provider_service_consume_approval(uuid,uuid,text,text) to service_role;
