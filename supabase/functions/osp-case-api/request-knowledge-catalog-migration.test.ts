import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const sql = await Deno.readTextFile(
  new URL(
    "../../migrations/20260902053000_osp_supervised_request_knowledge_catalog.sql",
    import.meta.url,
  ),
);
const executableSql = sql.replace(/^--.*$/gm, "");
const hotfixSql = await Deno.readTextFile(
  new URL(
    "../../migrations/20260902054500_osp_request_knowledge_idempotency_regex_hotfix.sql",
    import.meta.url,
  ),
);
const reusePolicySql = await Deno.readTextFile(
  new URL(
    "../../migrations/20260902070000_osp_request_knowledge_reuse_policy.sql",
    import.meta.url,
  ),
);
const reuseQualifierHotfixSql = await Deno.readTextFile(
  new URL(
    "../../migrations/20260902074000_osp_request_knowledge_reuse_qualifiers_hotfix.sql",
    import.meta.url,
  ),
);

Deno.test("request knowledge catalog is human-promoted, tenant-scoped and has no external effects", () => {
  assertMatch(
    sql,
    /create table osp_private\.request_knowledge_catalog_entries/i,
  );
  assertMatch(sql, /create table osp_private\.request_knowledge_promotions/i);
  assertMatch(sql, /review\.status = 'resolved'/i);
  assertMatch(
    sql,
    /p_actor_permission not in \('osp:operate', 'osp:superuser'\)/i,
  );
  assertMatch(sql, /REQUEST_KNOWLEDGE_CANDIDATE_CHANGED/);
  assertMatch(sql, /unique \(organization_id, idempotency_key\)/i);
  assertMatch(sql, /REQUEST_KNOWLEDGE_IDEMPOTENCY_CONFLICT/);
  assertNotMatch(sql, /idempotencyKey=' \|\| p_idempotency_key/i);
  assertMatch(sql, /REQUEST_KNOWLEDGE_LEDGER_APPEND_ONLY/);
  assertMatch(sql, /force row level security/i);
  assertMatch(sql, /current_setting\('osp\.organization_id', true\)/i);
  assertMatch(
    sql,
    /grant select on osp_private\.request_knowledge_catalog_entries to osp_worker/i,
  );
  assertNotMatch(
    executableSql,
    /\b(?:http_post|net\.http|pg_net|cron\.|gmail_send|webhook)\b/i,
  );
  assertNotMatch(
    executableSql,
    /\b(?:fact_value|reviewer_value|proposed_value|signature_bytes)\b/i,
  );
});

Deno.test("request knowledge promotion keeps the 256-character contract without unsupported ARE bounds", () => {
  assertMatch(hotfixSql, /REQUEST_KNOWLEDGE_HOTFIX_TARGET_MISMATCH/);
  assertMatch(hotfixSql, /\^\[A-Za-z0-9:_-\]\+\$/);
  assertMatch(
    hotfixSql,
    /char_length\(p_idempotency_key\) not between 1 and 256/i,
  );
  assertMatch(
    hotfixSql,
    /char_length\(idempotency_key\) between 1 and 256/i,
  );
  assertMatch(hotfixSql, /available_candidate\.knowledge_kind/);
  assertMatch(hotfixSql, /PL\/pgSQL record shadowing/);
  assertNotMatch(
    hotfixSql.replace(/invalid_bound constant text :=[\s\S]*?;/, ""),
    /\{1,256\}/,
  );
  assertNotMatch(
    hotfixSql.replace(/^--.*$/gm, ""),
    /\b(?:http_post|net\.http|pg_net|cron\.|gmail_send|webhook)\b/i,
  );
});

Deno.test("request knowledge reuse policy normalizes common concepts and rejects provider forms", () => {
  assertMatch(
    reusePolicySql,
    /create or replace function osp_private\.request_knowledge_reuse_policy/i,
  );
  assertMatch(reusePolicySql, /'case_specific'/);
  assertMatch(reusePolicySql, /'provider_specific_requirement'/);
  assertMatch(reusePolicySql, /'fiscal\.tax_status_certificate'/);
  assertMatch(reusePolicySql, /'legal\.articles_of_incorporation'/);
  assertMatch(reusePolicySql, /REQUEST_KNOWLEDGE_SELECTION_NOT_REUSABLE/);
  assertMatch(
    reusePolicySql,
    /candidate_policy\.target_canonical_key/i,
  );
  assertNotMatch(
    reusePolicySql.replace(/^--.*$/gm, ""),
    /\b(?:http_post|net\.http|pg_net|cron\.|gmail_send|webhook)\b/i,
  );
});

Deno.test("request knowledge reuse policy accepts supplier qualifiers without promoting supplier forms", () => {
  assertMatch(reuseQualifierHotfixSql, /car\[aá\]tula/);
  assertMatch(reuseQualifierHotfixSql, /acta\[\[:space:\]\]\+constitutiva/);
  assertMatch(reuseQualifierHotfixSql, /constancia\(\[\[:space:\]\]\+de\)\?/);
  assertMatch(reuseQualifierHotfixSql, /cww\[- _\]\?qf/);
  assertNotMatch(
    reuseQualifierHotfixSql.replace(/^--.*$/gm, ""),
    /\b(?:http_post|net\.http|pg_net|cron\.|gmail_send|webhook)\b/i,
  );
});
