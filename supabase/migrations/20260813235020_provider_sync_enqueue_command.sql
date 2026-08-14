create or replace function public.provider_service_enqueue_sync_command(
  p_organization_id uuid,p_provider_relationship_id uuid,p_legal_entity_id uuid,
  p_system_code text,p_action_code text,p_payload jsonb,p_idempotency_key text,
  p_requested_by_actor_type text default 'system',p_requested_by_user_id text default null,
  p_approval_request_id uuid default null,p_next_attempt_at timestamptz default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  s text:=lower(btrim(coalesce(p_system_code,''))); a text:=lower(btrim(coalesce(p_action_code,'')));
  actor text:=lower(btrim(coalesce(p_requested_by_actor_type,'system'))); body jsonb:=coalesce(p_payload,'{}'::jsonb);
  policy_row public.provider_integration_action_policies%rowtype; approval_row public.provider_approval_requests%rowtype;
  existing_row public.provider_sync_commands%rowtype; command_id uuid;
begin
  if s !~ '^[a-z][a-z0-9_]{1,63}$' or a !~ '^[a-z][a-z0-9_]{1,127}$' then raise exception 'Invalid integration command code.' using errcode='22023'; end if;
  if coalesce(p_idempotency_key,'') !~ '^[0-9a-f]{64}$' then raise exception 'Idempotency key must be a lowercase SHA-256 digest.' using errcode='22023'; end if;
  if actor not in ('user','agent','system','integration') then raise exception 'Invalid requester actor type.' using errcode='22023'; end if;
  if actor='user' and nullif(btrim(coalesce(p_requested_by_user_id,'')),'') is null then raise exception 'User commands require an identified user.' using errcode='22023'; end if;

  select * into existing_row from public.provider_sync_commands where organization_id=p_organization_id and idempotency_key=p_idempotency_key for update;
  if found then
    if existing_row.provider_relationship_id<>p_provider_relationship_id or existing_row.legal_entity_id<>p_legal_entity_id or existing_row.system_code<>s or existing_row.action_code<>a or existing_row.payload is distinct from body then
      raise exception 'Idempotency key collision with a different sync command.' using errcode='23505';
    end if;
    return existing_row.id;
  end if;

  if not exists(select 1 from public.provider_relationships r where r.organization_id=p_organization_id and r.id=p_provider_relationship_id and r.legal_entity_id=p_legal_entity_id and r.lifecycle_status not in ('offboarded','archived')) then
    raise exception 'Active provider relationship not found.' using errcode='P0002';
  end if;
  if not exists(select 1 from public.provider_system_links l where l.organization_id=p_organization_id and l.provider_relationship_id=p_provider_relationship_id and l.legal_entity_id=p_legal_entity_id and l.system_code=s and l.status not in ('suspended','error')) then
    raise exception 'Provider system mapping is not configured.' using errcode='23514';
  end if;

  select * into policy_row from public.provider_integration_action_policies p where p.organization_id=p_organization_id and p.legal_entity_id=p_legal_entity_id and p.system_code=s and p.action_code=a and p.status='published' order by p.version desc,p.id desc limit 1;
  if not found then raise exception 'No published integration action policy allows this command.' using errcode='23514'; end if;

  if policy_row.requires_approval then
    if p_approval_request_id is null then raise exception 'Integration command requires approval.' using errcode='23514'; end if;
    select * into approval_row from public.provider_approval_requests x where x.organization_id=p_organization_id and x.id=p_approval_request_id for update;
    if not found then raise exception 'Integration approval not found.' using errcode='P0002'; end if;
    if approval_row.provider_relationship_id<>p_provider_relationship_id or approval_row.legal_entity_id<>p_legal_entity_id or approval_row.action_code<>a then raise exception 'Integration approval scope does not match the command.' using errcode='23514'; end if;
    if approval_row.action_payload_snapshot is distinct from body then raise exception 'Integration approval payload does not match the command payload.' using errcode='23514'; end if;
    if approval_row.status<>'approved' then raise exception 'Integration approval is not approved.' using errcode='23514'; end if;
    if approval_row.expires_at is not null and approval_row.expires_at<=now() then raise exception 'Integration approval has expired.' using errcode='23514'; end if;
  elsif p_approval_request_id is not null then
    raise exception 'Unexpected approval supplied for this action.' using errcode='23514';
  end if;

  insert into public.provider_sync_commands(organization_id,provider_relationship_id,legal_entity_id,system_code,action_code,payload,idempotency_key,sensitivity,approval_request_id,integration_policy_id,requested_by_actor_type,requested_by_user_id,next_attempt_at)
  values(p_organization_id,p_provider_relationship_id,p_legal_entity_id,s,a,body,p_idempotency_key,policy_row.sensitivity,p_approval_request_id,policy_row.id,actor,nullif(btrim(coalesce(p_requested_by_user_id,'')),''),coalesce(p_next_attempt_at,now())) returning id into command_id;

  if policy_row.requires_approval then perform public.provider_service_consume_approval(p_organization_id,p_approval_request_id,actor,p_requested_by_user_id); end if;
  return command_id;
end;$$;
revoke all on function public.provider_service_enqueue_sync_command(uuid,uuid,uuid,text,text,jsonb,text,text,text,uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.provider_service_enqueue_sync_command(uuid,uuid,uuid,text,text,jsonb,text,text,text,uuid,timestamptz) to service_role;
