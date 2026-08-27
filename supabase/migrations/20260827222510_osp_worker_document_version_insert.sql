-- The OSP attachment promotion path inserts immutable document-version rows
-- directly as the tenant-scoped worker role. Keep the grant limited to the
-- columns used by that insert; RLS remains enabled and forced on the table.
grant insert (
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
) on table osp_private.document_versions to osp_worker;
