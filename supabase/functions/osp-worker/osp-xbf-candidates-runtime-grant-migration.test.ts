import { assert, assertEquals } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260828072500_osp_xbf_candidates_workflow_runtime.sql",
  import.meta.url,
);

Deno.test("XBF candidate loader is executable only by governed OSP runtime roles", async () => {
  const sql = (await Deno.readTextFile(migrationUrl)).replace(/--.*$/gm, "")
    .replace(/\s+/g, " ").trim().toLowerCase();

  assert(
    sql.includes(
      "grant execute on function osp_private.load_xbf_customer_setup_candidates(uuid) to osp_workflow_api",
    ),
  );
  assertEquals(/\b(public|anon|authenticated|service_role)\b/.test(sql), false);
  assertEquals(/\b(insert|update|delete|truncate|alter|drop)\b/.test(sql), false);
});
