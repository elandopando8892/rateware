-- Onboarding release package approval commands.
--
-- These are the gates the whole onboarding workflow funnels through: nothing is
-- assembled, signed or sent without an approved, unexpired, unrevoked package.
-- Both functions are security definer with a fixed search_path, take the acting
-- identity as an explicit argument, and are idempotent on re-submission of the
-- same decision by the same approver.

create or replace function public.provider_onboarding_decide_release_package_approval(
  p_organization_id uuid,
  p_package_id uuid,
  p_approver_actor_id text,
  p_approval_role text,
  p_decision text,
  p_decision_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  package_row public.provider_onboarding_release_packages%rowtype;
  existing public.provider_onboarding_release_package_approvals%rowtype;
  normalized_decision text;
  normalized_role text;
  normalized_actor text;
  normalized_note text;
  approved_count integer;
  became_approved boolean := false;
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
  -- A decision without a reason is not auditable, so the note is mandatory for
  -- rejections and approvals alike.
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
  -- Separation of duties. The table constraint rejects this too; failing here
  -- returns a comprehensible error instead of a constraint violation.
  if package_row.requested_by_actor_id = normalized_actor then
    raise exception 'The requester cannot approve their own release package.' using errcode='23514';
  end if;

  select * into existing
  from public.provider_onboarding_release_package_approvals
  where organization_id=p_organization_id
    and package_id=p_package_id
    and approver_actor_id=normalized_actor;

  if found then
    -- Idempotent replay of an identical decision; a changed decision is not a
    -- silent overwrite, because an approval already counted must be revoked
    -- through the package rather than edited in place.
    if existing.decision = normalized_decision and existing.package_revision = package_row.revision then
      return jsonb_build_object(
        'package_id', p_package_id,
        'decision', existing.decision,
        'package_status', package_row.package_status,
        'idempotent_replay', true
      );
    end if;
    raise exception 'This approver has already decided this release package.' using errcode='23505';
  end if;

  insert into public.provider_onboarding_release_package_approvals
    (organization_id,package_id,package_revision,requested_by_actor_id,approver_actor_id,approval_role,decision,decision_note)
  values
    (p_organization_id,p_package_id,package_row.revision,package_row.requested_by_actor_id,normalized_actor,normalized_role,normalized_decision,normalized_note);

  if normalized_decision = 'rejected' then
    update public.provider_onboarding_release_packages
    set package_status='rejected', updated_at=now()
    where organization_id=p_organization_id and id=p_package_id;

    insert into public.provider_onboarding_release_package_events
      (organization_id,package_id,event_type,previous_revision,revision,actor_id,payload)
    values
      (p_organization_id,p_package_id,'package_rejected',package_row.revision,package_row.revision,normalized_actor,
       jsonb_build_object('approval_role',normalized_role));

    return jsonb_build_object('package_id',p_package_id,'decision','rejected','package_status','rejected','idempotent_replay',false);
  end if;

  -- Only approvals recorded against the current revision may satisfy the
  -- threshold; a re-cut package cannot inherit approvals granted for different
  -- contents.
  select count(*) into approved_count
  from public.provider_onboarding_release_package_approvals
  where organization_id=p_organization_id
    and package_id=p_package_id
    and package_revision=package_row.revision
    and decision='approved';

  if approved_count >= package_row.required_approval_count then
    update public.provider_onboarding_release_packages
    set package_status='approved', approved_at=now(), updated_at=now()
    where organization_id=p_organization_id and id=p_package_id;
    became_approved := true;

    insert into public.provider_onboarding_release_package_events
      (organization_id,package_id,event_type,previous_revision,revision,actor_id,payload)
    values
      (p_organization_id,p_package_id,'package_approved',package_row.revision,package_row.revision,normalized_actor,
       jsonb_build_object('approved_count',approved_count,'required',package_row.required_approval_count));
  end if;

  return jsonb_build_object(
    'package_id', p_package_id,
    'decision', 'approved',
    'package_status', case when became_approved then 'approved' else 'pending_approval' end,
    'approved_count', approved_count,
    'required_approval_count', package_row.required_approval_count,
    'idempotent_replay', false
  );
end;
$$;

create or replace function public.provider_onboarding_revoke_release_package(
  p_organization_id uuid,
  p_package_id uuid,
  p_actor_id text,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  package_row public.provider_onboarding_release_packages%rowtype;
  normalized_actor text;
  normalized_reason text;
begin
  normalized_actor := nullif(btrim(coalesce(p_actor_id,'')),'');
  normalized_reason := nullif(btrim(coalesce(p_reason_code,'')),'');
  if normalized_actor is null then
    raise exception 'Revocation requires an identified actor.' using errcode='22023';
  end if;
  if normalized_reason is null then
    raise exception 'Revocation requires a reason code.' using errcode='22023';
  end if;

  select * into package_row
  from public.provider_onboarding_release_packages
  where organization_id=p_organization_id and id=p_package_id
  for update;

  if not found then
    raise exception 'Release package not found.' using errcode='P0002';
  end if;
  if package_row.revoked_at is not null then
    return jsonb_build_object('package_id',p_package_id,'package_status','revoked','idempotent_replay',true);
  end if;

  update public.provider_onboarding_release_packages
  set package_status='revoked', revoked_at=now(), revocation_reason_code=normalized_reason, updated_at=now()
  where organization_id=p_organization_id and id=p_package_id;

  -- Revoking the package must also strip any signature authorization scoped to
  -- it, otherwise a consent issued against approved contents outlives the
  -- approval that justified it.
  update public.provider_onboarding_signature_authorizations
  set authorization_status='revoked', revoked_at=now(), revocation_reason_code='package_revoked'
  where organization_id=p_organization_id
    and package_id=p_package_id
    and authorization_status='active';

  insert into public.provider_onboarding_release_package_events
    (organization_id,package_id,event_type,previous_revision,revision,actor_id,payload)
  values
    (p_organization_id,p_package_id,'package_revoked',package_row.revision,package_row.revision,normalized_actor,
     jsonb_build_object('reason_code',normalized_reason));

  return jsonb_build_object('package_id',p_package_id,'package_status','revoked','idempotent_replay',false);
end;
$$;

revoke all on function public.provider_onboarding_decide_release_package_approval(uuid,uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.provider_onboarding_revoke_release_package(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.provider_onboarding_decide_release_package_approval(uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.provider_onboarding_revoke_release_package(uuid,uuid,text,text) to service_role;

comment on function public.provider_onboarding_decide_release_package_approval(uuid,uuid,text,text,text,text) is
'Records one onboarding release package approval decision. Enforces separation of duties, a mandatory decision note, current-revision approval counting and idempotent replay of an identical decision.';
comment on function public.provider_onboarding_revoke_release_package(uuid,uuid,text,text) is
'Revokes an onboarding release package and cascades revocation to any active signature authorization scoped to it.';
