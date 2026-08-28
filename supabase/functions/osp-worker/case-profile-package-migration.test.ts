import { assertMatch, assertNotMatch } from 'jsr:@std/assert@1.0.14';

const sql = await Deno.readTextFile(
  new URL(
    '../../migrations/20260828220609_osp_case_profile_package_draft.sql',
    import.meta.url,
  ),
);

Deno.test('case profile binding is tenant-bound and selects one active entity', () => {
  assertMatch(
    sql,
    /create or replace function osp_private\.bind_case_profile_command/,
  );
  assertMatch(sql, /current_setting\('osp\.organization_id', true\)/);
  assertMatch(sql, /entity\.status = 'active'/);
  assertMatch(sql, /CASE_PROFILE_ENTITY_NOT_READY/);
  assertMatch(sql, /blocked_by_duplicate_review/);
  assertMatch(sql, /case_profile_bound/);
});

Deno.test('package draft freezes fact references without outbound authority', () => {
  assertMatch(
    sql,
    /create or replace function osp_private\.assemble_case_profile_draft_command/,
  );
  assertMatch(sql, /case_profile_facts_sha256/);
  assertMatch(sql, /disclosure_mode text not null default 'reference_only'/);
  assertMatch(sql, /'external_effects', false, 'disclosure_locked', true/);
  assertMatch(sql, /load_xbf_customer_setup_candidates_for_case/);
  assertNotMatch(
    sql,
    /http_post|net\.http|pg_net|cron\.|send_email|gmail_send/i,
  );
});
