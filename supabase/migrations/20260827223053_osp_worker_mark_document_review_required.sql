-- Attachment promotion records a safe source and must move only that new
-- tenant-scoped version into human review. The command validates the tenant
-- session and the matching safe assessment; approval remains operator-only.
grant execute on function osp_private.mark_document_review_required_command(
  uuid,
  uuid
) to osp_worker;
