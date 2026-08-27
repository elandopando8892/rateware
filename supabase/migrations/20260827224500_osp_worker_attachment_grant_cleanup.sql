-- Attachment promotion uses the tenant-scoped workflow role. The worker role
-- only claims jobs and must not retain document mutation privileges.
revoke insert (
  id,
  organization_id,
  document_id,
  version,
  document_type,
  status,
  source_sha256,
  bucket_id,
  opaque_object_key,
  content_type,
  valid_from,
  expires_at,
  uploaded_by_subject,
  review_before_sha256,
  review_after_sha256
) on table osp_private.document_versions from osp_worker;

revoke execute on function osp_private.mark_document_review_required_command(
  uuid,
  uuid
) from osp_worker;
