-- Bind the exact Kinde identity that the user verified by fresh email OTP and
-- explicitly authorized for the no-cost OSP operator entitlement. The
-- organization mapping remains independently reviewed and fail-closed.
insert into public.external_identities (
  provider,
  external_subject,
  email,
  status,
  reviewed_at,
  reviewed_by_user_id,
  metadata
)
values (
  'kinde',
  'kp_318fa265cfc64fa48dd8b9b33ebbea3f',
  'jgonzalez@xbfreight.com',
  'active',
  statement_timestamp(),
  'codex_thread_user_authorization',
  jsonb_build_object(
    'source', 'user_authorized_osp_production_entitlement',
    'authorization_date', '2026-08-28',
    'external_organization_id', 'org_dbc2fd12c76'
  )
)
on conflict (provider, external_subject) do nothing;

do $$
begin
  if not exists (
    select 1
    from public.external_identities identity_record
    where identity_record.provider = 'kinde'
      and identity_record.external_subject = 'kp_318fa265cfc64fa48dd8b9b33ebbea3f'
      and lower(btrim(identity_record.email)) = 'jgonzalez@xbfreight.com'
      and identity_record.status = 'active'
      and identity_record.reviewed_at is not null
  ) then
    raise exception using
      errcode = '23514',
      message = 'OSP_AUTHORIZED_KINDE_IDENTITY_CONFLICT';
  end if;
end
$$;
