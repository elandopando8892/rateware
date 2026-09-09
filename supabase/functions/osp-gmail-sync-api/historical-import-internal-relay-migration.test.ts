import { assertMatch } from "jsr:@std/assert@1.0.14";

const migration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260909054400_osp_internal_sales_relay_source_gate.sql",
    import.meta.url,
  ),
);

Deno.test("historical import admits only evidence-backed internal Sales relays", () => {
  assertMatch(migration, /sales@heymarksman\.com/i);
  assertMatch(migration, /message\.subject ~\* '\^fwd:/i);
  assertMatch(migration, /attachment\.mime_type = 'message\/rfc822'/i);
  assertMatch(migration, /attachment\.processing_status = 'received'/i);
  assertMatch(migration, /application\/msword/i);
  assertMatch(
    migration,
    /not exists[\s\S]*xbfreight\.com[\s\S]*heymarksman\.com/i,
  );
  assertMatch(migration, /OSP_INTERNAL_SALES_RELAY_SOURCE_GATE_PRECONDITION/);
});
