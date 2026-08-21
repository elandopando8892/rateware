-- Recovered from rateware-prod: applied there, never committed. See
-- docs/osp-recovered-migrations.md.
--
-- The read-model views are security_invoker, so they check the CALLER's privileges, not
-- the view owner's. Granting the views was not enough: the base tables each view reaches
-- through need the grant too. These five were found by walking the view dependency chain
-- rather than by chasing one permission error at a time.
grant select on table
  public.provider_document_reviews,
  public.provider_approval_requests,
  public.provider_compliance_evaluations,
  public.provider_portal_invitations,
  public.provider_system_links
to service_role;
