-- Every onboarding command was unable to run.
--
-- Found by running the importer's commit path against a live database: the first
-- write returned `permission denied for table provider_entity_document_ingestions`.
-- An audit of service_role grants across the module then showed the same hole almost
-- everywhere — 30 of 35 onboarding tables had no grant at all, and the five that did
-- had SELECT only, granted in 20260815032049 for the Build 30 read model.
--
-- Consequence: the bounded upload, all three review commands, fact promotion, the
-- case workflow, release package creation, the agent intake, and the Gmail sync's own
-- thread and message writes would every one have failed at runtime with permission
-- denied. Each of them passed its structural test, the runtime syntax gate, the action
-- contract validator and a clean migration replay — none of which executes a query.
--
-- Grants below are least-privilege per table, derived from what each wired command
-- actually does, not blanket ALL. Browser roles stay revoked and RLS stays on; the
-- security definer RPCs are unaffected because they run as the function owner.

-- Bounded upload: begin/confirm signed upload.
grant select, insert, update on table
  public.provider_entity_document_ingestions
to service_role;
grant insert on table public.provider_entity_document_ingestion_events to service_role;

-- Human document review: claim, decide field, finalize.
-- finalize writes verification_status back onto the asset, so UPDATE is required
-- there and not merely on the review.
grant update on table
  public.provider_entity_document_reviews,
  public.provider_entity_document_review_fields,
  public.provider_legal_entity_document_assets
to service_role;
grant insert on table public.provider_entity_document_review_events to service_role;
grant insert on table public.provider_legal_entity_document_assets to service_role;

-- Reviewed fact promotion.
grant select, insert, update on table public.provider_legal_entity_facts to service_role;
grant insert on table
  public.provider_legal_entity_fact_events,
  public.provider_legal_entity_fact_promotions
to service_role;
grant select on table public.provider_legal_entity_profile_fields to service_role;

-- Onboarding case workflow: open, reconcile, cancel.
grant insert, update on table
  public.provider_onboarding_cases,
  public.provider_onboarding_case_tasks
to service_role;
grant insert on table public.provider_onboarding_case_events to service_role;
grant select on table
  public.provider_onboarding_requirements,
  public.provider_onboarding_readiness_evaluations,
  public.provider_onboarding_readiness_results
to service_role;

-- Release packages. Approval and revocation are security definer RPCs and need no
-- grant; creation runs as service_role and does.
grant insert, update on table
  public.provider_onboarding_release_packages,
  public.provider_onboarding_release_package_items
to service_role;
grant insert on table public.provider_onboarding_release_package_events to service_role;

-- Form assembly reads its template and mapping configuration and writes the assembly
-- record. Signature authorizations are read here; they are only ever written by the
-- security definer consent and revocation paths.
grant select on table
  public.provider_onboarding_form_templates,
  public.provider_onboarding_form_field_mappings,
  public.provider_onboarding_signature_authorizations
to service_role;
grant insert, update on table public.provider_onboarding_form_assemblies to service_role;
grant insert on table public.provider_onboarding_form_assembly_events to service_role;

-- Gmail delivery. Still unwired pending a sender allowlist, but its read model and
-- the workspace view depend on these being readable.
grant select on table
  public.provider_onboarding_mailbox_policies,
  public.provider_onboarding_message_templates
to service_role;
grant insert, update on table public.provider_onboarding_outbound_messages to service_role;
grant insert on table public.provider_onboarding_outbound_message_events to service_role;

-- Gmail intake writes threads, messages and attachments. The Gmail connection and
-- sync-run tables were granted correctly in Build 16; these were not, so intake could
-- store a connection but never a message.
grant insert, update on table public.provider_communication_threads to service_role;
grant select, insert on table
  public.provider_communication_messages,
  public.provider_communication_attachments,
  public.provider_communication_case_links
to service_role;
grant select on table public.provider_communication_threads to service_role;
grant insert on table public.provider_communication_events to service_role;

-- Agent thread resolution writes explainable match candidates.
grant select, insert, update on table public.provider_communication_match_candidates to service_role;

-- Agent runs: the §17 audit ledger the intake writes on every inbound message.
grant select, insert, update on table public.provider_agent_runs to service_role;
grant insert on table
  public.provider_agent_events,
  public.provider_agent_context_snapshots,
  public.provider_agent_action_proposals
to service_role;

-- Provider matching reads relationships and their external references.
grant select on table public.provider_relationship_contacts to service_role;
