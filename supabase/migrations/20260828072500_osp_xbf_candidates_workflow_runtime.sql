-- The automatic form preparation store runs under osp_workflow_api so it can
-- atomically update the governed OSP form and case tables. The candidate
-- loader is tenant-bound through osp.organization_id and exposes only the
-- canonical XBF customer-setup fields needed by that workflow.
grant execute on function osp_private.load_xbf_customer_setup_candidates(uuid)
  to osp_workflow_api;

