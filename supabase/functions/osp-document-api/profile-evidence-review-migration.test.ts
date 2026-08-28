import { assertEquals, assertMatch, assertNotMatch } from 'jsr:@std/assert@1.0.14';

const migrationUrl = new URL('../../migrations/20260828202820_osp_profile_evidence_human_review.sql', import.meta.url);

Deno.test('profile evidence review migration is tenant-bound, atomic and has no outward effects', async () => {
  const sql = (await Deno.readTextFile(migrationUrl)).replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim().toLowerCase();
  for (const command of [
    'claim_profile_evidence_review_command',
    'decide_profile_evidence_field_command',
    'finalize_profile_evidence_review_command',
  ]) {
    assertMatch(sql, new RegExp(`create or replace function osp_private\\.${command}`));
    assertMatch(sql, new RegExp(`${command}[\\s\\S]*language plpgsql security definer set search_path = ''`));
    assertMatch(sql, new RegExp(`revoke all on function osp_private\\.${command}`));
    assertMatch(sql, new RegExp(`grant execute on function osp_private\\.${command}[\\s\\S]*to osp_workflow_api`));
  }
  assertEquals((sql.match(/current_setting\('osp\.organization_id'/g) ?? []).length, 3);
  assertMatch(sql, /assigned_reviewer_user_id = p_actor_subject/);
  assertMatch(sql, /review\.revision = p_expected_revision/);
  assertMatch(sql, /profile_review_separation_required/);
  assertMatch(sql, /profile_review_incomplete/);
  assertMatch(sql, /target_field\.sensitivity in \('restricted', 'highly_restricted'\)/);
  assertMatch(sql, /insert into public\.provider_entity_document_review_events/);
  assertNotMatch(sql, /insert into public\.provider_legal_entity_facts/);
  assertNotMatch(sql, /\b(?:http|send_email|webhook|net\.http|pg_net|vault\.decrypted_secrets)\b/);
});
