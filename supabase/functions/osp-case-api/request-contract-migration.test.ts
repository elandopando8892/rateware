import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const sql = await Deno.readTextFile(
  new URL(
    "../../migrations/20260902120000_osp_request_contract_semantic_stop.sql",
    import.meta.url,
  ),
);

Deno.test("Sprint 11 migration preserves XLSM and stores only supervised append-only constraints", () => {
  assertMatch(sql, /application\/vnd\.ms-excel\.sheet\.macroEnabled\.12/i);
  assertMatch(
    sql,
    /create or replace function osp_private\.valid_outbound_attachments\(value jsonb\)[\s\S]*wordprocessingml\.document/i,
  );
  assertMatch(
    sql,
    /create table osp_private\.request_knowledge_constraint_rules/i,
  );
  assertMatch(
    sql,
    /before update or delete on osp_private\.request_knowledge_constraint_rules/i,
  );
  assertMatch(sql, /humanReviewed"?:?\s*'?\s*,?\s*true|humanReviewed', true/i);
  assertMatch(sql, /externalEffects', false/i);
  assertMatch(sql, /record_request_knowledge_constraints_command/i);
  assertMatch(sql, /position\(lower\(candidate\.display_label\)/i);
  assertMatch(sql, /jsonb_array_elements_text\(candidate\.aliases_json\)/i);
  assertMatch(
    sql,
    /revoke all on osp_private\.request_knowledge_constraint_rules/i,
  );
  assertNotMatch(
    sql,
    /grant\s+(?:select\s*,\s*)?insert\s+on\s+osp_private\.request_knowledge_constraint_rules/i,
  );
  assertMatch(sql, /no provider, billable resource or outbound authority/i);
});
