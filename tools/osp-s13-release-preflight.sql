-- READ ONLY. Run only against the already-approved shared Rateware/OSP project.
-- Returns metadata/counts, not document values, messages, secrets or Vault data.
-- This is deployment discovery, NOT permission to deploy or execute a canary.
begin transaction read only;
set local statement_timeout = '8s';

with expected_migrations(version, name) as (values
  ('20260902120000', 'osp_request_contract_semantic_stop'),
  ('20260902130000', 'osp_operations_review_contract_gate'),
  ('20260905050000', 'osp_approved_profile_memory_reuse'),
  ('20260905053000', 'osp_case_answer_memory_candidates'),
  ('20260905060000', 'osp_answer_memory_human_review'),
  ('20260905083000', 'osp_answer_memory_evidence_preflight'),
  ('20260905110000', 'osp_answer_memory_evidence_links'),
  ('20260905143000', 'osp_profile_complete_batch_confirmation'),
  ('20260905173000', 'osp_request_constraint_actor_regex_hotfix')
), required_relations(name) as (values
  ('osp_private.customer_registration_cases'),
  ('osp_private.request_manifest_drafts'),
  ('osp_private.request_manifest_decision_reviews'),
  ('osp_private.request_knowledge_promotions'),
  ('osp_private.case_form_instances'),
  ('osp_private.form_template_versions'),
  ('osp_private.form_fields'),
  ('osp_private.case_profile_bindings'),
  ('public.legal_entities'),
  ('public.provider_legal_entity_facts'),
  ('public.provider_legal_entity_fact_promotions'),
  ('public.provider_entity_document_reviews'),
  ('public.provider_entity_document_review_fields'),
  ('public.provider_legal_entity_document_assets')
), new_relations(name) as (values
  ('osp_private.request_knowledge_constraint_rules'),
  ('osp_private.case_answer_memory_candidates'),
  ('osp_private.case_answer_memory_reviews'),
  ('osp_private.answer_memory_evidence_links')
), canary_cases as (
  select id, organization_id, state, aggregate_version
  from osp_private.customer_registration_cases
  where organization_id = 'ca0a8f30-1382-4316-9bd5-cb76d9ab4920'
    and id in ('ddbb675c-a769-4741-9b85-7d4798509913',
               'f2fa004f-d674-446c-80ca-e929cce75b51')
)
select jsonb_build_object(
  'observedAt', statement_timestamp(),
  'transactionReadOnly', current_setting('transaction_read_only'),
  'serverVersion', current_setting('server_version'),
  'migrationLedger', (
    select jsonb_agg(jsonb_build_object(
      'expectedVersion', e.version, 'expectedName', e.name,
      'exactEntry', exists(select 1 from supabase_migrations.schema_migrations m
        where m.version = e.version and m.name = e.name),
      'sameNameVersions', (select coalesce(jsonb_agg(m.version order by m.version), '[]'::jsonb)
        from supabase_migrations.schema_migrations m where m.name = e.name),
      'sameVersionNames', (select coalesce(jsonb_agg(m.name order by m.name), '[]'::jsonb)
        from supabase_migrations.schema_migrations m where m.version = e.version)
    ) order by e.version) from expected_migrations e
  ),
  'requiredRelations', (select jsonb_agg(jsonb_build_object(
    'name', name, 'exists', to_regclass(name) is not null) order by name) from required_relations),
  'newRelations', (select jsonb_agg(jsonb_build_object(
    'name', name, 'exists', to_regclass(name) is not null) order by name) from new_relations),
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'signature', p.oid::regprocedure::text,
      'definitionMd5', md5(pg_get_functiondef(p.oid)),
      'hasUnsupportedActorBound', strpos(pg_get_functiondef(p.oid), '{1,256}') > 0
    ) order by p.oid::regprocedure::text), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'osp_private' and p.proname in (
      'record_request_knowledge_constraints_command', 'assert_request_contract_ready',
      'guard_operations_review_contract', 'load_xbf_customer_setup_candidates_for_case',
      'capture_case_answer_memory_candidates', 'review_case_answer_memory',
      'load_answer_memory_evidence', 'load_answer_memory_evidence_intents',
      'link_answer_memory_evidence', 'load_profile_review_promotion_batch',
      'promote_profile_review_complete_batch', 'promote_profile_review_facts_command'
    )
  ),
  'derivedBucket', (select jsonb_build_object(
    'id', id, 'public', public, 'fileSizeLimit', file_size_limit, 'allowedMimeTypes', allowed_mime_types
  ) from storage.buckets where id = 'osp-derived-documents'),
  'controls', (select jsonb_agg(jsonb_build_object(
    'id', id, 'outboundEnabled', outbound_enabled, 'releaseMode', release_mode
  )) from osp_private.production_controls),
  'ospCron', (select coalesce(jsonb_agg(jsonb_build_object(
    'name', jobname, 'active', active, 'schedule', schedule
  ) order by jobname), '[]'::jsonb) from cron.job where jobname ilike '%osp%'),
  'unfinishedJobs', (select coalesce(jsonb_agg(jsonb_build_object(
    'kind', j.kind, 'count', j.total
  ) order by j.kind), '[]'::jsonb) from (
    select kind, count(*) as total from osp_private.background_jobs
    where completed_at is null group by kind
  ) j),
  'caseBaselines', (select jsonb_agg(jsonb_build_object(
    'id', c.id, 'state', c.state, 'aggregateVersion', c.aggregate_version,
    'forms', (select count(*) from osp_private.case_form_instances f
      where f.organization_id = c.organization_id and f.case_id = c.id),
    'manifests', (select count(*) from osp_private.request_manifest_drafts m
      where m.organization_id = c.organization_id and m.case_id = c.id),
    'payloads', (select count(*) from osp_private.outbound_payloads p
      where p.organization_id = c.organization_id and p.case_id = c.id),
    'signatureReceipts', (select count(*) from osp_private.signature_application_receipts s
      where s.organization_id = c.organization_id and s.case_id = c.id),
    'gmailLedgerReceipts', (select count(*) from osp_private.outbound_gmail_receipts r
      where r.organization_id = c.organization_id and r.case_id = c.id)
  ) order by c.id) from canary_cases c)
) as preflight;

commit;
