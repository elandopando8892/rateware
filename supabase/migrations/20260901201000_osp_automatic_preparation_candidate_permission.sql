-- Automatic preparation runs inside the tenant-scoped workflow transaction.
-- Grant only the read-only candidate loader it already calls. The function
-- remains security-definer and rejects any organization other than the active
-- osp.organization_id. This does not grant document disclosure or outbound work.

grant execute on function
  osp_private.load_xbf_customer_setup_candidates_for_case(uuid, uuid)
to osp_workflow_api;

comment on function
  osp_private.load_xbf_customer_setup_candidates_for_case(uuid, uuid)
is 'Tenant-scoped reviewed XBF fact candidates for internal automatic preparation. No document bytes or outbound effects.';
