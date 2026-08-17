-- Bind signature consent to the exact document that will be signed.
--
-- provider_onboarding_signature_authorizations scoped consent to a package, a
-- recipient, a purpose and a manifest — but not to the form template. Assembly
-- validated only that an active authorization existed for the package, so a
-- consent granted while reviewing one template was consumable against a
-- different active template of the same program. An approver could authorize a
-- signature on a tax form and have it applied to a personal-guarantee form.
--
-- Onboarding brief §10 requires the hash of the document to be signed to be part
-- of the consent, and forbids signing a different version. These columns make
-- that enforceable.
alter table public.provider_onboarding_signature_authorizations
  add column if not exists template_id uuid,
  add column if not exists template_sha256 text;

-- Nullable so existing rows remain valid; every new authorization is written
-- with both populated by authorizeProviderOnboardingSignature, and assembly
-- refuses any authorization whose template binding does not match.
alter table public.provider_onboarding_signature_authorizations
  drop constraint if exists provider_signature_authorizations_template_fkey;
alter table public.provider_onboarding_signature_authorizations
  add constraint provider_signature_authorizations_template_fkey
  foreign key (organization_id, template_id)
  references public.provider_onboarding_form_templates(organization_id, id)
  on delete restrict;

alter table public.provider_onboarding_signature_authorizations
  drop constraint if exists provider_signature_authorizations_template_hash_check;
alter table public.provider_onboarding_signature_authorizations
  add constraint provider_signature_authorizations_template_hash_check
  check (
    (template_id is null and template_sha256 is null)
    or (template_id is not null and template_sha256 ~ '^[0-9a-f]{64}$')
  );

-- Revoking consent explicitly, without revoking the whole package. Used when a
-- signer withdraws authorization or a template is re-cut.
create or replace function public.provider_onboarding_revoke_signature_authorization(
  p_organization_id uuid,
  p_authorization_id uuid,
  p_actor_id text,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  authorization_row public.provider_onboarding_signature_authorizations%rowtype;
  normalized_actor text;
  normalized_reason text;
begin
  normalized_actor := nullif(btrim(coalesce(p_actor_id,'')),'');
  normalized_reason := nullif(btrim(coalesce(p_reason_code,'')),'');
  if normalized_actor is null then
    raise exception 'Signature revocation requires an identified actor.' using errcode='22023';
  end if;
  if normalized_reason is null then
    raise exception 'Signature revocation requires a reason code.' using errcode='22023';
  end if;

  select * into authorization_row
  from public.provider_onboarding_signature_authorizations
  where organization_id=p_organization_id and id=p_authorization_id
  for update;

  if not found then
    raise exception 'Signature authorization not found.' using errcode='P0002';
  end if;
  if authorization_row.authorization_status = 'revoked' then
    return jsonb_build_object('authorization_id',p_authorization_id,'authorization_status','revoked','idempotent_replay',true);
  end if;
  -- A consumed authorization has already produced a signed artifact. Revoking it
  -- would misrepresent history; the artifact must be withdrawn instead.
  if authorization_row.authorization_status = 'consumed' then
    raise exception 'A consumed signature authorization cannot be revoked; revoke the release package instead.' using errcode='23514';
  end if;

  update public.provider_onboarding_signature_authorizations
  set authorization_status='revoked', revoked_at=now(), revocation_reason_code=normalized_reason
  where organization_id=p_organization_id and id=p_authorization_id;

  insert into public.provider_onboarding_form_assembly_events
    (organization_id,assembly_id,event_type,actor_id,payload)
  select a.organization_id, a.id, 'signature_authorization_revoked', normalized_actor,
         jsonb_build_object('authorization_id',p_authorization_id,'reason_code',normalized_reason)
  from public.provider_onboarding_form_assemblies a
  where a.organization_id=p_organization_id
    and a.signature_authorization_id=p_authorization_id;

  return jsonb_build_object('authorization_id',p_authorization_id,'authorization_status','revoked','idempotent_replay',false);
end;
$$;

revoke all on function public.provider_onboarding_revoke_signature_authorization(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.provider_onboarding_revoke_signature_authorization(uuid,uuid,text,text) to service_role;

comment on function public.provider_onboarding_revoke_signature_authorization(uuid,uuid,text,text) is
'Revokes an unconsumed signature authorization. Consumed authorizations are refused because a signed artifact already exists; revoke the release package instead.';
comment on column public.provider_onboarding_signature_authorizations.template_sha256 is
'Hash of the form template the consent was granted against. Assembly refuses an authorization whose template binding does not match the template being assembled, so a re-cut template invalidates consent.';
