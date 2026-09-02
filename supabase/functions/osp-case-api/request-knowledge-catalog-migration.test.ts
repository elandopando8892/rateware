import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const sql = await Deno.readTextFile(
  new URL(
    "../../migrations/20260902053000_osp_supervised_request_knowledge_catalog.sql",
    import.meta.url,
  ),
);
const executableSql = sql.replace(/^--.*$/gm, "");

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
