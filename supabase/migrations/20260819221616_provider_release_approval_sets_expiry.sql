create or replace function public.provider_onboarding_decide_release_package_approval(
  p_organization_id uuid,
  p_package_id uuid,
  p_approver_actor_id text,
  p_approval_role text,
  p_decision text,
  p_decision_note text
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  package_row public.provider_onboarding_release_packages%rowtype;
  existing public.provider_onboarding_release_package_approvals%rowtype;
  normalized_decision text;
  normalized_role text;
  normalized_actor text;
  normalized_note text;
  approved_count integer;
  became_approved boolean := false;
  is_self_approval boolean := false;
  approval_ttl_hours integer;
begin
  normalized_decision := lower(btrim(coalesce(p_decision,'')));
  normalized_role := lower(btrim(coalesce(p_approval_role,'')));
  normalized_actor := nullif(btrim(coalesce(p_approver_actor_id,'')),'');
  normalized_note := nullif(btrim(coalesce(p_decision_note,'')),'');

  if normalized_decision not in ('approved','rejected') then
    raise exception 'Approval decision must be approved or rejected.' using errcode='22023';
  end if;
  if normalized_role not in ('operations','compliance','data_owner','legal') then
    raise exception 'Approval role is not recognized.' using errcode='22023';
  end if;
  if normalized_actor is null then
    raise exception 'Approval requires an identified approver.' using errcode='22023';
  end if;
  if normalized_note is null then
    raise exception 'Approval decision requires a note.' using errcode='22023';
  end if;

  select * into package_row
  from public.provider_onboarding_release_packages
  where organization_id=p_organization_id and id=p_package_id
  for update;

  if not found then
    raise exception 'Release package not found.' using errcode='P0002';
  end if;
  if package_row.revoked_at is not null then
    raise exception 'Release package has been revoked.' using errcode='23514';
  end if;
  if package_row.package_status <> 'pending_approval' then
    raise exception 'Release package is not pending approval.' using errcode='23514';
  end if;
  if package_row.expires_at is not null and package_row.expires_at <= now() then
    raise exception 'Release package authorization has expired.' using errcode='23514';
  end if;

  -- Separation of duties stays the default. It is waived only for a package that was
  -- deliberately cut as self-approving, and the waiving is recorded on the approval.
  if package_row.requested_by_actor_id = normalized_actor then
    if not package_row.self_approval_permitted then
      raise exception 'The requester cannot approve their own release package.' using errcode='23514';
    end if;
    is_self_approval := true;
  end if;

  -- Scoped to the current revision: an approval recorded against earlier
  -- contents neither counts toward nor blocks the current revision.
  select * into existing
  from public.provider_onboarding_release_package_approvals
  where organization_id=p_organization_id
    and package_id=p_package_id
    and package_revision=package_row.revision
    and approver_actor_id=normalized_actor;

  if found then
    if existing.decision = normalized_decision then
      return jsonb_build_object(
        'package_id', p_package_id,
        'decision', existing.decision,
        'package_status', package_row.package_status,
        'package_revision', package_row.revision,
        'idempotent_replay', true
      );
    end if;
    raise exception 'This approver has already decided this package revision.' using errcode='23505';
  end if;

  insert into public.provider_onboarding_release_package_approvals
    (organization_id,package_id,package_revision,requested_by_actor_id,approver_actor_id,approval_role,decision,decision_note,self_approved)
  values
    (p_organization_id,p_package_id,package_row.revision,package_row.requested_by_actor_id,normalized_actor,normalized_role,normalized_decision,normalized_note,is_self_approval);

  if normalized_decision = 'rejected' then
    update public.provider_onboarding_release_packages
    set package_status='rejected', updated_at=now()
    where organization_id=p_organization_id and id=p_package_id;

    insert into public.provider_onboarding_release_package_events
      (organization_id,package_id,event_type,previous_revision,revision,actor_id,payload)
    values
      (p_organization_id,p_package_id,'package_rejected',package_row.revision,package_row.revision,normalized_actor,
       jsonb_build_object('approval_role',normalized_role,'self_approved',is_self_approval));

    return jsonb_build_object('package_id',p_package_id,'decision','rejected','package_status','rejected','package_revision',package_row.revision,'idempotent_replay',false);
  end if;

  select count(*) into approved_count
  from public.provider_onboarding_release_package_approvals
  where organization_id=p_organization_id
    and package_id=p_package_id
    and package_revision=package_row.revision
    and decision='approved';

  if approved_count >= package_row.required_approval_count then
    -- An approved package must carry an expiry: the table refuses 'approved' without
    -- one. Nothing on the write path was setting it, so this function could never
    -- actually approve a package the release-package command had cut -- the update
    -- failed the check every time. The TTL is the one recorded when the package was
    -- requested; the bounds mirror the command's own limits, and a metadata value that
    -- is not a plain integer falls back rather than raising.
    approval_ttl_hours := coalesce(
      (case when package_row.metadata->>'approval_ttl_hours' ~ '^[0-9]+$'
            then (package_row.metadata->>'approval_ttl_hours')::integer end), 24);
    approval_ttl_hours := greatest(1, least(168, approval_ttl_hours));

    update public.provider_onboarding_release_packages
    set package_status='approved', approved_at=now(),
        expires_at=now()+make_interval(hours => approval_ttl_hours), updated_at=now()
    where organization_id=p_organization_id and id=p_package_id;
    became_approved := true;

    insert into public.provider_onboarding_release_package_events
      (organization_id,package_id,event_type,previous_revision,revision,actor_id,payload)
    values
      (p_organization_id,p_package_id,'package_approved',package_row.revision,package_row.revision,normalized_actor,
       jsonb_build_object('approved_count',approved_count,'required',package_row.required_approval_count,
                          'self_approved',is_self_approval,'approval_ttl_hours',approval_ttl_hours));
  end if;

  return jsonb_build_object(
    'package_id', p_package_id,
    'decision', 'approved',
    'package_status', case when became_approved then 'approved' else 'pending_approval' end,
    'package_revision', package_row.revision,
    'approved_count', approved_count,
    'required_approval_count', package_row.required_approval_count,
    'self_approved', is_self_approval,
    'expires_in_hours', approval_ttl_hours,
    'idempotent_replay', false
  );
end;
$function$;

comment on function public.provider_onboarding_decide_release_package_approval(uuid,uuid,text,text,text,text) is
'One decision per approver per package revision. Revision scope is required so a re-cut package can be re-approved by the same approver set. The requester is refused unless the package was cut as self-approving, in which case the approval is recorded as a self-approval. Sets the package expiry from the TTL recorded at request time.';;
