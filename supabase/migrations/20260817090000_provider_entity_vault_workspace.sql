-- Sanitized Entity Vault read model for the private onboarding operator UI.
--
-- The vault holds articles of organization, tax evidence, bank letters, identity
-- documents and signature specimens. The operator surface must show custody and
-- disclosure posture without ever exposing the documents themselves, so this view
-- deliberately omits storage_bucket, storage_path, file_sha256, original_filename
-- and the free-form metadata jsonb. Only metadata a reviewer needs to make a
-- release decision is projected.
create or replace view public.provider_entity_vault_workspace
with (security_invoker = true)
as
select
  d.id,
  d.organization_id,
  d.legal_entity_id,
  d.document_type,
  d.document_key,
  d.document_name,
  d.mime_type,
  d.file_size_bytes,
  d.sensitivity,
  d.release_policy,
  d.lifecycle_status,
  d.verification_status,
  d.issuer_name,
  d.effective_date,
  d.expiration_date,
  d.created_at,
  d.updated_at,
  case
    when d.expiration_date is null then 'no_expiry'
    when d.expiration_date < current_date then 'expired'
    when d.expiration_date <= current_date + 30 then 'expiring_soon'
    else 'current'
  end as expiry_state,
  -- Releasable means "may be considered for a package", never "may be sent".
  -- Sending still requires an approved release package and, for restricted or
  -- highly restricted documents, explicit human approval.
  (
    d.lifecycle_status = 'active'
    and d.verification_status = 'verified'
    and d.release_policy <> 'never_release'
    and (d.expiration_date is null or d.expiration_date >= current_date)
  ) as is_releasable,
  (d.sensitivity in ('restricted','highly_restricted')) as requires_human_release_approval,
  coalesce(u.package_use_count, 0)::integer as package_use_count,
  u.last_packaged_at,
  count(*) over (partition by d.organization_id)::integer as total_documents,
  count(*) filter (
    where d.expiration_date is not null and d.expiration_date < current_date
  ) over (partition by d.organization_id)::integer as expired_documents,
  count(*) filter (
    where d.verification_status <> 'verified'
  ) over (partition by d.organization_id)::integer as unverified_documents,
  count(*) filter (
    where d.sensitivity in ('restricted','highly_restricted')
  ) over (partition by d.organization_id)::integer as restricted_documents
from public.provider_legal_entity_document_assets d
left join lateral (
  select count(*) as package_use_count, max(i.included_at) as last_packaged_at
  from public.provider_onboarding_release_package_items i
  where i.organization_id = d.organization_id
    and i.source_document_asset_id = d.id
) u on true;

revoke all on public.provider_entity_vault_workspace from public, anon, authenticated;
grant select on public.provider_entity_vault_workspace to service_role;

-- security_invoker means the view executes with the caller's privileges, so the
-- backend service role also needs read access to each underlying table. Without
-- this the view exists but every read fails with "permission denied". Browser
-- roles stay revoked and RLS stays on, exactly as for the onboarding workspace.
grant select on table
  public.provider_legal_entity_document_assets,
  public.provider_onboarding_release_package_items
to service_role;

comment on view public.provider_entity_vault_workspace is
'Sanitized service-role read model for the private Entity Vault operator surface; projects custody and disclosure metadata only and excludes storage buckets, storage paths, file hashes, original filenames and free-form document metadata.';
