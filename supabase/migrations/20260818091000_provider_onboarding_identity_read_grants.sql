-- The same grant hole, one layer down.
--
-- Found while adding an operator helper that lists organizations and legal entities:
-- service_role could read neither. public.organizations and public.vendors carry only
-- REFERENCES/TRIGGER/TRUNCATE, which are not read privileges.
--
-- public.vendors matters beyond the helper: loadProviderMatchCandidates joins
-- relationships to the Carrier CRM vendor row for name, domain and known addresses.
-- Without SELECT there, the agent's provider matching returns no candidates at all —
-- it would have reported every inbound thread as unmatched and looked like a scoring
-- problem rather than a permission one.
--
-- Read-only. Nothing here grants a write.
grant select on table
  public.organizations,
  public.vendors
to service_role;
