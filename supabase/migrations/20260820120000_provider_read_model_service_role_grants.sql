-- Two read actions returned 500 in production. Found by calling them.
--
-- This is the read-side twin of 20260818090000, which found the same class of hole on
-- the write side. That migration's comment is worth repeating, because it happened
-- again: every one of these passed its structural test, the runtime syntax gate, the
-- action contract validator and a clean migration replay -- none of which executes a
-- query. The failure only appeared when the actions were called with a real token
-- against the real database.
--
--   list_provider_service_command_center
--     500 permission denied for table provider_document_versions
--   list_provider_document_reviews
--     500 permission denied for view provider_entity_document_review_queue
--
-- The command centre one has been broken in production on main, not just on this
-- branch: calling it against the old shipper-directory-api runtime fails identically.
-- It is not a consequence of moving the actions to their own function.
--
-- WHY THE COMMAND CENTRE ONE IS SUBTLE
--
-- provider_service_command_center reads provider_document_version_effective_state,
-- which carries security_invoker=true. Permissions inside an invoker view are checked
-- against the caller rather than the view owner, so service_role needs SELECT on the
-- base tables that view reads -- and it had none. Granting the view alone would not
-- have been enough, which is why the grant is on the tables.
--
-- The review queue is simpler: security_barrier, no invoker, and no grant on the view
-- at all.
--
-- Least privilege: SELECT only, on the three relations the two failing reads actually
-- need. Browser roles stay revoked and RLS stays on.

-- The command centre reads through a chain of views, and the invoker ones check the
-- caller at every level. Granting the two tables the first error named only moved the
-- error to the next table down. The set below is the whole chain, taken from a
-- recursive walk of the view dependencies rather than one failure at a time -- which is
-- how this was being discovered until the third round trip made the pattern obvious.
grant select on table
  public.provider_document_versions,
  public.provider_documents,
  public.provider_document_reviews,
  public.provider_approval_requests,
  public.provider_compliance_evaluations,
  public.provider_portal_invitations,
  public.provider_system_links
to service_role;

-- The human document review queue, read by list_provider_document_reviews.
grant select on public.provider_entity_document_review_queue to service_role;

-- WRITE SIDE
--
-- evaluate_provider_onboarding_readiness then failed with
--   permission denied for table provider_onboarding_readiness_evaluations
-- so the same audit was done for every table the thirteen wired commands touch,
-- derived by parsing each `.from(table)` statement to the end of the statement rather
-- than by reading the first error. An earlier one-line scan under-reported: it missed a
-- `.select('id')` that sat on the next line, which is exactly how
-- provider_legal_entity_fact_promotions would have been left half-granted.
--
-- Four tables were short. Least privilege per table, as before.

-- Fact promotion inserts the promotion, reads its id back, then marks it applied.
grant select, update on table public.provider_legal_entity_fact_promotions to service_role;

-- Readiness writes an evaluation and reads its id back, then writes the result rows.
grant insert on table
  public.provider_onboarding_readiness_evaluations,
  public.provider_onboarding_readiness_results
to service_role;

-- Recording an approval decision on a release package.
grant insert on table public.provider_onboarding_release_package_approvals to service_role;
