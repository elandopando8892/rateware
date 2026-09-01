import { assert, assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const migration = await Deno.readTextFile(new URL(
  "../../migrations/20260901130000_osp_adaptive_attachment_promotion_jobs.sql",
  import.meta.url,
));

Deno.test("attachment promotion recovery remains exact, shadow-only and no-send", () => {
  assertMatch(migration, /'attachment_promote'/);
  assertMatch(migration, /control\.release_mode = 'shadow'/);
  assertMatch(migration, /control\.outbound_enabled = false/);
  assertMatch(migration, /control\.adaptive_manifest_enabled/);
  assertMatch(migration, /control\.approval_mode = 'human_approved'/);
  assertMatch(migration, /case_record\.blocked_by_duplicate_review = false/);
  assertNotMatch(migration, /not exists \(\s*select 1\s*from osp_private\.document_versions/is);
  assertMatch(migration, /'image\/png'/);
  assertMatch(migration, /'application\/pdf'/);
  assertMatch(migration, /wordprocessingml\.document/);
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(migration));
  assertNotMatch(migration, /insert\s+into\s+(?:osp_private\.)?(?:outbound|sales_authorization|case_events)/i);
  assertNotMatch(migration, /gmail\.send|net\.http|http_post/i);
});
