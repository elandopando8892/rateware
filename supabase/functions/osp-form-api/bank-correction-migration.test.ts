import assert from 'node:assert/strict';

const migration = await Deno.readTextFile(new URL('../../migrations/20260828160018_osp_correct_case_prefill_with_corporate_evidence.sql', import.meta.url));

Deno.test('bank correction command is tenant scoped, evidence gated, and outbound free', () => {
  assert.match(migration, /current_setting\('osp\.organization_id'/);
  assert.match(migration, /version\.document_type = 'bank_statement'/);
  assert.match(migration, /version\.status = 'approved'/);
  assert.match(migration, /decision\.reason_code = 'DOCUMENT_APPROVED'/);
  assert.match(migration, /bank_value #>> '\{\}' !~ '\^\[0-9\]\{4,34\}\$'/);
  assert.match(migration, /'externalEffects', false/);
  assert.match(migration, /'MAPPING_CORRECTED'/);
  assert.match(migration, /set state = 'preparing'/);
  assert.doesNotMatch(migration, /set state = 'operations_review'|ready_to_send|send_email|webhook/i);
  assert.match(migration, /revoke all on function osp_private\.correct_case_bank_prefill_command/);
  assert.match(migration, /grant execute on function osp_private\.correct_case_bank_prefill_command[\s\S]*to osp_workflow_api/);
});
