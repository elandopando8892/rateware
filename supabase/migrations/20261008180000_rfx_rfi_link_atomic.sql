-- Candidate only. Apply exact migration before the API; never generic db push.
begin;
alter table public.rfx_projects add column radar_origin jsonb,
  add column radar_link_id uuid;

create function public.guard_rfx_radar_origin() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if old.radar_origin is not null and
    row(new.radar_origin,new.radar_link_id,new.owner_email,new.organization_id,new.operation_id,new.customer_id)
    is distinct from row(old.radar_origin,old.radar_link_id,old.owner_email,old.organization_id,old.operation_id,old.customer_id)
  then raise exception 'Radar origin is immutable' using errcode='23514'; end if;
  return new;
end $$;
create trigger rfx_radar_origin_immutable before update on public.rfx_projects
for each row execute function public.guard_rfx_radar_origin();

create function public.issue_rfx_rfi_link_once(
  p_project_id uuid,p_owner_email text,p_actor_id text,
  p_token_hash text,p_token_encrypted text,p_days integer,p_radar_origin jsonb default null
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
  project public.rfx_projects%rowtype;
  link public.rfx_rfi_magic_links%rowtype;
  submission_state text;
  active_count integer;
  reused boolean := true;
  observed_at timestamptz;
begin
  if p_owner_email is null or p_owner_email='' or p_actor_id is null or p_actor_id=''
    then raise exception 'RFI access denied' using errcode='42501'; end if;
  -- One row lock shared by every issuer. Losers observe the committed winner.
  select * into project from public.rfx_projects
    where id=p_project_id and owner_email=p_owner_email for update;
  if not found then raise exception 'RFI access denied' using errcode='42501'; end if;
  observed_at := clock_timestamp();
  select status into submission_state from public.rfx_rfi_submissions where project_id=p_project_id for update;
  if project.status not in ('draft','rfi_sent','rfi_in_progress','rfi_submitted')
    or submission_state='submitted'
    or (project.status='rfi_submitted' and submission_state is distinct from 'reopened')
    then raise exception 'RFI capture is closed' using errcode='P0001'; end if;
  if p_days is null or p_days<1 or p_days>90 or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_token_encrypted is null or length(p_token_encrypted)<1 or length(p_token_encrypted)>4096
    then raise exception 'Invalid RFI candidate' using errcode='22023'; end if;
  if p_radar_origin is not null then
    if jsonb_typeof(p_radar_origin) is distinct from 'object'
      or (p_radar_origin->>'system') is distinct from 'demand_radar'
      or (p_radar_origin->>'operationId') is distinct from project.operation_id::text
      or coalesce(length(p_radar_origin->>'leadId'),0) not between 1 and 180
      or coalesce(p_radar_origin->>'ownerId','') !~ '^[a-f0-9-]{36}$'
      or coalesce(p_radar_origin->>'requirementId','') !~ '^[a-f0-9-]{36}$'
      then raise exception 'Invalid Radar origin' using errcode='22023'; end if;
    if project.radar_origin is not null and project.radar_origin<>p_radar_origin
      then raise exception 'Radar origin conflict' using errcode='P0001'; end if;
  end if;
  -- Also lock link rows to serialize against explicit revoke/submit operations.
  perform id from public.rfx_rfi_magic_links where project_id=p_project_id order by id for update;
  select count(*) into active_count from public.rfx_rfi_magic_links
    where project_id=p_project_id and status='active' and expires_at>observed_at and revoked_at is null;
  if active_count>1 then raise exception 'Ambiguous active RFI links' using errcode='P0001'; end if;
  if project.radar_origin is not null then
    select * into link from public.rfx_rfi_magic_links where id=project.radar_link_id and project_id=p_project_id;
    if not found or active_count<>1 or link.status<>'active' or link.expires_at<=observed_at
      or link.revoked_at is not null or link.submitted_at is not null
      then raise exception 'Radar link requires reconciliation' using errcode='P0001'; end if;
  elsif active_count=1 then
    select * into link from public.rfx_rfi_magic_links where project_id=p_project_id
      and status='active' and expires_at>observed_at and revoked_at is null;
    if link.submitted_at is not null then raise exception 'RFI link was submitted' using errcode='P0001'; end if;
  else
    -- An expired/revoked historical link is never silently replaced for Radar.
    if p_radar_origin is not null and exists(select 1 from public.rfx_rfi_magic_links where project_id=p_project_id)
      then raise exception 'Historic RFI link requires reconciliation' using errcode='P0001'; end if;
    insert into public.rfx_rfi_magic_links(owner_user_id,owner_email,organization_id,project_id,token_hash,token_encrypted,expires_at,metadata)
      values(p_actor_id,p_owner_email,project.organization_id,p_project_id,p_token_hash,p_token_encrypted,observed_at+make_interval(days=>p_days),
        jsonb_build_object('generated_from','rfx_process')) returning * into link;
    reused := false;
  end if;
  if p_radar_origin is not null and project.radar_origin is null then
    update public.rfx_projects set radar_origin=p_radar_origin,radar_link_id=link.id where id=p_project_id;
    insert into public.rfx_process_audit(owner_user_id,owner_email,organization_id,project_id,actor_email,action,entity_type,entity_id,summary,metadata)
      values(p_actor_id,p_owner_email,project.organization_id,p_project_id,p_owner_email,'rfi_origin_bound','rfx_rfi_magic_links',link.id::text,
        'Bound capture to its verified Radar origin',jsonb_build_object('operation_id',project.operation_id));
  end if;
  if not reused then
    update public.rfx_projects set status=case when status='draft' then 'rfi_sent' else status end,updated_at=observed_at where id=p_project_id;
    insert into public.rfx_process_audit(owner_user_id,owner_email,organization_id,project_id,actor_email,action,entity_type,entity_id,summary,metadata)
      values(p_actor_id,p_owner_email,project.organization_id,p_project_id,p_owner_email,'rfi_magic_link_created','rfx_rfi_magic_links',link.id::text,
        'Created private capture link; no message sent',jsonb_build_object('expires_at',link.expires_at));
  end if;
  return jsonb_build_object('reused',reused,'origin',coalesce(project.radar_origin,p_radar_origin),'row',jsonb_build_object('id',link.id,'status',link.status,
    'expires_at',link.expires_at,'created_at',link.created_at,'token_encrypted',link.token_encrypted));
end $$;
revoke all on function public.issue_rfx_rfi_link_once(uuid,text,text,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.issue_rfx_rfi_link_once(uuid,text,text,text,text,integer,jsonb) to service_role;
commit;

