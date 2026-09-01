import { assertEquals, assertMatch } from "jsr:@std/assert@1.0.14";

const migration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260901120000_osp_adaptive_human_approved_runtime.sql",
    import.meta.url,
  ),
);

Deno.test("adaptive runtime migration admits manifests and DOCX but keeps outbound locked", () => {
  assertMatch(migration, /'request_manifest'/);
  assertMatch(migration, /adaptive_manifest_enabled\s*=\s*true/i);
  assertMatch(migration, /approval_mode\s*=\s*'human_approved'/i);
  assertMatch(migration, /outbound_enabled\s*=\s*false/i);
  assertMatch(migration, /wordprocessingml\.document/i);
  assertEquals(/set\s+outbound_enabled\s*=\s*true/i.test(migration), false);
});
