import { assertMatch } from "jsr:@std/assert@1.0.14";

const migration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260901035651_osp_request_manifest_review_drafts.sql",
    import.meta.url,
  ),
);

Deno.test("request manifest migration creates an append-only tenant-scoped human-review ledger", () => {
  assertMatch(migration, /create table osp_private\.request_manifest_drafts/i);
  assertMatch(
    migration,
    /status text not null default 'review_required' check \(status = 'review_required'\)/i,
  );
  assertMatch(migration, /"externalEffects":false/i);
  assertMatch(
    migration,
    /before update or delete on osp_private\.request_manifest_drafts/i,
  );
  assertMatch(
    migration,
    /grant select, insert on osp_private\.request_manifest_drafts to osp_worker/i,
  );
  assertMatch(
    migration,
    /grant select on osp_private\.request_manifest_drafts to osp_workflow_api/i,
  );
  assertMatch(migration, /wordprocessingml\.document/i);
  assertMatch(migration, /OSP_ORIGINALS_BUCKET_CONFLICT/);
  assertMatch(migration, /OSP_CORPORATE_BUCKET_CONFLICT/);
  assertMatch(migration, /current_setting\('osp\.organization_id', true\)/i);
  if (
    /\b(?:send|webhook|signature|outbound_payloads|case_events)\b/i.test(
      migration.replace(/^--.*$/gm, ""),
    )
  ) throw new Error("REQUEST_MANIFEST_MIGRATION_EXTERNAL_EFFECT_SURFACE");
});
