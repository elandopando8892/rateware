import { assertEquals, assertMatch } from "jsr:@std/assert@1.0.14";

const migration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260919090000_osp_legacy_doc_manual_conversion.sql",
    import.meta.url,
  ),
);

Deno.test("legacy DOC migration persists an explicit manual-only disposition and bounded claim", () => {
  assertMatch(migration, /where id = 'osp-originals'/i);
  assertMatch(migration, /update storage\.buckets set allowed_mime_types = next_types where id = 'osp-originals'/i);
  assertMatch(migration, /'application\/msword' = any\(corporate\.allowed_mime_types\)/i);
  assertMatch(migration, /'application\/msword' = any\(derived\.allowed_mime_types\)/i);
  assertMatch(
    migration,
    /add column if not exists processing_disposition text not null[\s\S]*default 'automatic_eligible'/i,
  );
  assertMatch(
    migration,
    /content_type = 'application\/msword'[\s\S]*processing_disposition = 'manual_conversion_required'/i,
  );
  assertMatch(
    migration,
    /source_role = 'original_attachment'[\s\S]*'application\/msword'/i,
  );
  assertMatch(
    migration,
    /claim_next_background_jobs\(integer,integer\)[\s\S]*'application\/msword'/i,
  );
  assertEquals(
    /insert into osp_private\.(?:documents|document_versions|source_safety_assessments)/i
      .test(migration),
    false,
  );
  assertEquals(/status\s*=\s*'safe'/i.test(migration), false);
});
