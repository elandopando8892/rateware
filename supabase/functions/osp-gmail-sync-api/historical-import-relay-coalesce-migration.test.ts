import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const sourceGate = await Deno.readTextFile(
  new URL(
    "../../migrations/20260909054400_osp_internal_sales_relay_source_gate.sql",
    import.meta.url,
  ),
);
const repair = await Deno.readTextFile(
  new URL(
    "../../migrations/20260909055929_osp_internal_sales_relay_coalesce_fix.sql",
    import.meta.url,
  ),
);

Deno.test("internal relay gate uses SQL COALESCE syntax and repairs the live qualified form", () => {
  assertNotMatch(sourceGate, /pg_catalog\.coalesce\(/i);
  assertMatch(
    repair,
    /pg_catalog\.replace\([\s\S]*'pg_catalog\.coalesce\('[\s\S]*'coalesce\('/i,
  );
  assertMatch(repair, /message\/rfc822/i);
  assertMatch(repair, /OSP_INTERNAL_SALES_RELAY_COALESCE_FIX_PRECONDITION/);
});
