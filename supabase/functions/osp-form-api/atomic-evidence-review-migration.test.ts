import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1.0.14';

const migrationUrl = new URL('../../migrations/20260827175536_osp_atomic_evidence_review.sql', import.meta.url);

Deno.test('atomic evidence review migration keeps the command private and closes every snapshot review gate', async () => {
  const sql = (await Deno.readTextFile(migrationUrl)).replace(/\s+/g, ' ').trim().toLowerCase();

  assertMatch(sql, /create function osp_private\.accept_case_prefill_evidence_command\(/);
  assertMatch(sql, /language plpgsql security definer set search_path = ''/);
  assertMatch(sql, /current_setting\('osp\.organization_id', true\)/);
  assertMatch(sql, /p_actor_permission <> 'osp:operate'/);
  assertMatch(sql, /document_type = 'supplier_requirement'/);
  assertMatch(sql, /approve_document_version_command\(/);
  assertMatch(sql, /'document_version'.*'document_approved'/);
  assertMatch(sql, /'extraction_field'.*'source_confirmed'/);
  assertMatch(sql, /set status = 'reviewed'/);
  assertMatch(sql, /'form_mapping'.*'mapping_confirmed'/);
  assertMatch(sql, /set status = 'accepted', review_decision_id = mapping_decision_id/);
  assertMatch(sql, /field\.validation = 'invalid'/);
  assertMatch(sql, /jsonb_array_length\(field->'evidenceids'\) = 0/);
  assertMatch(sql, /field\.validation in \('low_confidence', 'contradictory'\).*field\.field_key ~ '\^\(fiscal\|banking\)\[\.\]'/);
  assertMatch(sql, /revoke all on function osp_private\.accept_case_prefill_evidence_command.*from public, anon, authenticated, osp_worker/);
  assertMatch(sql, /grant execute on function osp_private\.accept_case_prefill_evidence_command.*to osp_workflow_api/);
  assertEquals(/grant execute on function osp_private\.accept_case_prefill_evidence_command.*to (?:public|anon|authenticated|osp_worker)/.test(sql), false);

  const command = sql.slice(sql.indexOf('create function osp_private.accept_case_prefill_evidence_command'));
  const documentDecision = command.indexOf("'document_version'");
  const fieldDecision = command.indexOf("'extraction_field'", documentDecision);
  const extractionTransition = command.indexOf("set status = 'reviewed'", fieldDecision);
  const mappingDecision = command.indexOf("'form_mapping'", extractionTransition);
  assert(documentDecision >= 0 && fieldDecision > documentDecision && extractionTransition > fieldDecision && mappingDecision > extractionTransition);
});

Deno.test('approved-document backfill is bounded to global quarterly documents', async () => {
  const sql = (await Deno.readTextFile(migrationUrl)).replace(/\s+/g, ' ').trim().toLowerCase();
  const backfill = sql.slice(sql.indexOf('-- earlier approvals'));
  assertMatch(backfill, /document\.case_id is null/);
  assertMatch(backfill, /version\.document_type in \( 'proof_of_address', 'sat_compliance_opinion', 'tax_status_certificate', 'bank_statement' \)/);
  assertEquals(/supplier_requirement/.test(backfill), false);
});
