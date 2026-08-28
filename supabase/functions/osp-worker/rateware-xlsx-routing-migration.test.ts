import { assert, assertEquals } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260828030000_osp_rateware_xlsx_routing.sql",
  import.meta.url,
);
const activationUrl = new URL(
  "../../migrations/20260828031500_activate_osp_rateware_xlsx_routing.sql",
  import.meta.url,
);
const disableUrl = new URL(
  "../../migrations/20260828033000_disable_misdirected_osp_rateware_xlsx_routing.sql",
  import.meta.url,
);
const correctionUrl = new URL(
  "../../migrations/20260828034500_correct_osp_xlsx_customer_setup_intake.sql",
  import.meta.url,
);
const correctedActivationUrl = new URL(
  "../../migrations/20260828040000_activate_osp_xlsx_customer_setup_intake.sql",
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

Deno.test("misdirected Rateware routing is disabled before the OSP correction", async () => {
  const sql = (await Deno.readTextFile(disableUrl)).replace(/\s+/g, " ")
    .trim().toLowerCase();
  assert(sql.includes("rateware_xlsx_routing_enabled = false"));
  assert(sql.includes("rateware_xlsx_routing_active_after = null"));
  assert(sql.includes("release_mode = 'shadow'"));
  assert(sql.includes("outbound_enabled = false"));
});

Deno.test("corrected XLSX intake stays in OSP and removes worker rate-staging authority", async () => {
  const sql = (await Deno.readTextFile(correctionUrl)).replace(/\s+/g, " ")
    .trim().toLowerCase();
  assert(
    sql.includes(
      "add column osp_xlsx_intake_enabled boolean not null default false",
    ),
  );
  assert(sql.includes("control.osp_xlsx_intake_enabled"));
  assert(
    sql.includes(
      "message.received_at >= control.osp_xlsx_intake_active_after",
    ),
  );
  assert(sql.includes("safety.reason_code = 'strict_xlsx_package_policy'"));
  assert(
    sql.includes(
      "revoke all on function osp_private.stage_rateware_xlsx_quote(",
    ),
  );
  assert(
    sql.includes(
      "revoke all on function osp_private.stage_rateware_xlsx_quote_from_lease(",
    ),
  );
  assertEquals(
    /grant\s+execute\s+on\s+function\s+osp_private\.stage_rateware_xlsx_quote/
      .test(sql),
    false,
  );
  assertEquals(/outbound_enabled\s*=\s*true/.test(sql), false);
  assertEquals(/insert\s+into\s+public\.rate_staging/.test(sql), false);
  assert(
    sql.includes(
      "create function osp_private.load_xbf_customer_setup_candidates(",
    ),
  );
  assert(sql.includes("from public.legal_entities entity"));
  assert(sql.includes("join public.provider_legal_entity_facts fact"));
  assert(sql.includes("if eligible_entities <> 1 then return"));
  assert(
    sql.includes(
      "grant execute on function osp_private.load_xbf_customer_setup_candidates(uuid) to osp_worker",
    ),
  );
});

Deno.test("corrected OSP XLSX intake activates from now without Rateware routing or outbound", async () => {
  const sql = (await Deno.readTextFile(correctedActivationUrl)).replace(
    /\s+/g,
    " ",
  ).trim().toLowerCase();
  assert(sql.includes("osp_xlsx_intake_enabled = true"));
  assert(sql.includes("osp_xlsx_intake_active_after = statement_timestamp()"));
  assert(sql.includes("rateware_xlsx_routing_enabled = false"));
  assert(sql.includes("rateware_xlsx_routing_active_after is null"));
  assert(sql.includes("release_mode = 'shadow'"));
  assert(sql.includes("outbound_enabled = false"));
  assertEquals(/outbound_enabled\s*=\s*true/.test(sql), false);
  assertEquals(/rateware_xlsx_routing_enabled\s*=\s*true/.test(sql), false);
});
