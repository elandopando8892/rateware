import { assert, assertEquals } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260828030000_osp_rateware_xlsx_routing.sql",
  import.meta.url,
);
const activationUrl = new URL(
  "../../migrations/20260828031500_activate_osp_rateware_xlsx_routing.sql",
  import.meta.url,
);

Deno.test("Rateware XLSX routing migration stays shadow-only, lease-bound and review-gated", async () => {
  const sql = (await Deno.readTextFile(migrationUrl)).replace(/\s+/g, " ")
    .trim().toLowerCase();
  assert(
    sql.includes(
      "add column rateware_xlsx_routing_enabled boolean not null default false",
    ),
  );
  assert(sql.includes("rateware_xlsx_routing_active_after timestamptz"));
  assert(sql.includes("control.release_mode = 'shadow'"));
  assert(sql.includes("control.outbound_enabled = false"));
  assert(sql.includes("job.lease_token = p_lease_token"));
  assert(sql.includes("job.leased_until > clock_timestamp()"));
  assert(
    sql.includes(
      "message.received_at >= control.rateware_xlsx_routing_active_after",
    ),
  );
  assert(sql.includes("safety.reason_code = 'strict_xlsx_package_policy'"));
  assert(sql.includes("'pending_review'"));
  assert(sql.includes("'needs_review'"));
  assert(
    sql.includes(
      "grant execute on function osp_private.stage_rateware_xlsx_quote_from_lease",
    ),
  );
  assertEquals(
    /grant\s+(?:select|insert|update|delete|all)[^;]+rateware_document_bridges/
      .test(
        sql,
      ),
    false,
  );
  assertEquals(/outbound_enabled\s*=\s*true/.test(sql), false);
});

Deno.test("Rateware XLSX activation starts at deployment time without enabling outbound", async () => {
  const sql = (await Deno.readTextFile(activationUrl)).replace(/\s+/g, " ")
    .trim().toLowerCase();
  assert(sql.includes("rateware_xlsx_routing_enabled = true"));
  assert(
    sql.includes("rateware_xlsx_routing_active_after = statement_timestamp()"),
  );
  assert(sql.includes("release_mode = 'shadow'"));
  assert(sql.includes("outbound_enabled = false"));
  assert(sql.includes("get diagnostics affected = row_count"));
  assertEquals(/outbound_enabled\s*=\s*true/.test(sql), false);
});
