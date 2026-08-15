create or replace view public.provider_signature_ready_operations
with (security_invoker = true)
as
select s.id as signature_operation_id,
  s.organization_id,
  s.legal_entity_id,
  s.provider_relationship_id,
  s.approval_request_id,
  s.source_document_version_id,
  s.signer_reference,
  s.status,
  a.approval_mode,
  a.action_code,
  a.expires_at,
  (
    s.status in ('requested','ready')
    and a.status = 'approved'
    and a.approval_mode = 'executive'
    and a.action_code = 'apply_authorized_signature'
    and (a.expires_at is null or a.expires_at > current_timestamp)
  ) as can_apply
from public.provider_signature_operations s
join public.provider_approval_requests a
  on a.organization_id=s.organization_id
 and a.id=s.approval_request_id
 and a.provider_relationship_id=s.provider_relationship_id
 and a.legal_entity_id=s.legal_entity_id;
