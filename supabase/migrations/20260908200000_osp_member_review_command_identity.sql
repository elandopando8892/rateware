-- Preserve earlier evidence; new application commands carry an immutable digest.
-- No backfill, business transition, endpoint activation or outbound action.
alter table osp_private.package_set_member_reviews
  add column command_sha256 text
  check (command_sha256 is null or command_sha256 ~ '^[0-9a-f]{64}$');
