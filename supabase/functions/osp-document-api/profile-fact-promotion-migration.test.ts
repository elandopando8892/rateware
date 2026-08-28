import { assert, assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const sql = await Deno.readTextFile(
  new URL(
    "../../migrations/20260828213328_osp_profile_fact_promotion.sql",
    import.meta.url,
  ),
);

Deno.test("profile fact promotion is atomic, tenant-bound and outbound-free", () => {
  assertMatch(
    sql,
    /create or replace function osp_private\.promote_profile_review_facts_command/,
  );
  assertMatch(sql, /pg_advisory_xact_lock/);
  assertMatch(sql, /current_setting\('osp\.organization_id', true\)/);
  assertNotMatch(sql, /current_setting\('app\.organization_id', true\)/);
  assertMatch(sql, /review_status <> 'approved'/);
  assertMatch(sql, /PROFILE_FACT_CANDIDATE_CHANGED/);
  assertMatch(sql, /PROFILE_FACT_CURRENT_VERSION_CONFLICT/);
  assertMatch(sql, /promotion_status = 'applied'/);
  assertMatch(
    sql,
    /revoke all on function osp_private\.promote_profile_review_facts_command[\s\S]*from public, anon, authenticated/,
  );
  assertMatch(
    sql,
    /grant execute on function osp_private\.promote_profile_review_facts_command[\s\S]*to osp_workflow_api/,
  );
  assertNotMatch(
    sql,
    /http_post|net\.http|pg_net|cron\.|send_email|provider_legal_entity_release_packages/i,
  );
});

Deno.test("candidate fingerprint is deterministic and bound to exact review values", () => {
  assertMatch(sql, /osp-profile-fact-promotion-v1/);
  assertMatch(
    sql,
    /create or replace function osp_private\.canonical_jsonb_text/,
  );
  assertMatch(
    sql,
    /string_agg\([\s\S]*order by member\.key\)[\s\S]*jsonb_each\(p_value\)/,
  );
  assertMatch(sql, /jsonb_array_elements\(p_value\) with ordinality/);
  assertMatch(sql, /string_agg\([\s\S]*order by field\.field_code, field\.id/);
  assertMatch(
    sql,
    /case when field\.field_status = 'corrected' then field\.reviewer_value else field\.proposed_value end/,
  );
  assertMatch(sql, /extensions\.digest/);
});
