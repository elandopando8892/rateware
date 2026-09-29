import { assert, assertEquals } from "jsr:@std/assert@1.0.14";
import {
  adminOnlyDenial,
  belongsToOrganization,
  CARRIER_ARCHIVE_ERROR,
  RATE_BASE_REMOVAL_ERROR,
  SHIPPER_ARCHIVE_ERROR,
  teamRoleAllows,
  teamRoleDenial,
  teamRoleFromClaims,
  teamRoleNeed,
} from "../supabase/functions/_shared/team-roles.ts";

const originalServe = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const ratewareApi = await import("../supabase/functions/rateware-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: originalServe });

const org = { sub: "user-1", email: "buyer@example.com", rateware_organization_id: "org-a" };

Deno.test("the role is the highest one the account carries, and none means viewer", () => {
  assertEquals(teamRoleFromClaims({}), "viewer");
  assertEquals(teamRoleFromClaims({ roles: [] }), "viewer");
  assertEquals(teamRoleFromClaims({ roles: ["operator"] }), "operator");
  assertEquals(teamRoleFromClaims({ roles: ["operator", "Admin"] }), "admin");
  assertEquals(teamRoleFromClaims({ roles: ["superuser"] }), "viewer");
  assertEquals(teamRoleFromClaims({ roles: "admin" }), "viewer");
});

Deno.test("what each action asks of the role", () => {
  assertEquals(teamRoleNeed("rateware-api", "list_rfx_events"), "read");
  assertEquals(teamRoleNeed("rateware-api", "list_rfx_invitation_wave_reviews", { rfx_event_id: "e-1" }), "read", "anyone may see who reviewed a contact");
  assertEquals(teamRoleNeed("rateware-api", "record_rfx_invitation_wave_review", { rfx_event_id: "e-1" }), "operate", "reviewing one is day-to-day work");
  assertEquals(teamRoleNeed("rateware-api", "create_rfx_event"), "operate");
  assertEquals(teamRoleNeed("rateware-api", "invite_rfx_lane_vendors"), "operate");
  assertEquals(teamRoleNeed("rateware-api", "suppress_outreach_contact"), "operate", "an opt-out is anyone's to record");
  assertEquals(teamRoleNeed("rateware-api", "update_onboarding_task"), "operate", "the contract calls it a read, but it writes");
  for (const action of ["award_rfx_lane_vendor", "closeout_awarded_rfx_to_rateware", "publish_ratebook", "archive_rfx_event", "save_catalog_value", "remove_vendors"]) {
    assertEquals(teamRoleNeed("rateware-api", action), "admin", action);
  }
  assertEquals(teamRoleNeed("rateware-api", "update_rfx_event", { patch: { status: "closed" } }), "admin", "closing hands the awards to rateware");
  assertEquals(teamRoleNeed("rateware-api", "update_rfx_event", { patch: { status: "draft" } }), "admin", "restoring from the archive");
  assertEquals(teamRoleNeed("rateware-api", "update_rfx_event", { patch: { status: "open" } }), "operate");
  assertEquals(teamRoleNeed("rateware-api", "update_rfx_event", { patch: { name: "Renamed" } }), "operate");
  assertEquals(teamRoleNeed("rateware-api", "update_rfx_process_project", { status: "archived" }), "admin");
  assertEquals(teamRoleNeed("rateware-api", "update_rfx_process_project", { patch: { status: "bid_evaluation" } }), "operate");
  assertEquals(teamRoleNeed("rateware-api", "update_staging", { id: "r-1", patch: { status: "approved" } }), "admin", "approving puts the rate in the rate base");
  assertEquals(teamRoleNeed("rateware-api", "bulk_update_staging", { ids: ["r-1"], patch: { status: " Approved " } }), "admin");
  assertEquals(teamRoleNeed("rateware-api", "bulk_update_rate_rows_by_filter", { filters: {}, patch: { status: "approved" } }), "admin");
  assertEquals(teamRoleNeed("rateware-api", "update_staging", { id: "r-1", patch: { currency: "USD" } }), "operate", "correcting a staged rate");
  assertEquals(teamRoleNeed("rateware-api", "bulk_update_staging", { ids: ["r-1"], patch: { status: "rejected" } }), "operate");
  assertEquals(teamRoleNeed("rateware-api", "archive_staging", { ids: ["r-1"] }), "operate");
  assertEquals(teamRoleNeed("rateware-api", "return_rateware_to_staging", { ids: ["r-1"] }), "admin", "reopening approved rates takes them out of the rate base");
  assertEquals(teamRoleNeed("rateware-api", "merge_shipper_accounts"), "admin", "merging archives the duplicate");
  assertEquals(teamRoleNeed("rateware-api", "update_shipper", { id: "s-1", patch: { status: "archived" } }), "admin");
  assertEquals(teamRoleNeed("rateware-api", "update_shipper", { id: "s-1", patch: { industry: "Food" } }), "operate");
  assertEquals(teamRoleNeed("rateware-api", "consolidate_exact_vendor_duplicates", { dry_run: true }), "read", "the merge preview only reads");
  assertEquals(teamRoleNeed("rateware-api", "consolidate_exact_vendor_duplicates"), "read");
  assertEquals(teamRoleNeed("rateware-api", "consolidate_exact_vendor_duplicates", { dry_run: false, preview_count: 1 }), "admin", "merging deletes the duplicate carrier");
  assertEquals(teamRoleNeed("rateware-api", "bulk_update_vendors", { ids: ["v-1"], patch: { base_stage: " Archived " } }), "admin", "archiving carriers");
  assertEquals(teamRoleNeed("rateware-api", "update_vendor", { id: "v-1", patch: { base_stage: "archived" } }), "admin");
  assertEquals(teamRoleNeed("rateware-api", "bulk_update_vendors", { ids: ["v-1"], patch: { base_stage: "procurement", funnel_stage: "invited" } }), "operate", "moving carriers through the pipeline");
  assertEquals(teamRoleNeed("rateware-api", "bulk_update_vendors", { ids: ["v-1"], patch: { status: "inactive" } }), "operate", "the TMS status is not archiving");
  assertEquals(teamRoleNeed("quotedesk-api", "set_quote_status", { status: "archived" }), "admin");
  assertEquals(teamRoleNeed("quotedesk-api", "set_quote_status", { status: "won" }), "operate");
  assertEquals(teamRoleNeed("quotedesk-api", "get_quote"), "read");
  assertEquals(teamRoleNeed("quotedesk-api", "save_accessorial"), "admin");
});

Deno.test("who may do what", () => {
  assert(teamRoleAllows("viewer", "read") && !teamRoleAllows("viewer", "operate"));
  assert(teamRoleAllows("operator", "operate") && !teamRoleAllows("operator", "admin"));
  assert(teamRoleAllows("admin", "admin"));
  assert(belongsToOrganization(org) && belongsToOrganization({ organization_id: "org-a" }));
  assert(!belongsToOrganization({ sub: "outsider" }));
});

Deno.test("what only the rows can tell is an Administrador's too", () => {
  assertEquals(adminOnlyDenial("rateware-api", { sub: "outsider" }, "archive_staging", RATE_BASE_REMOVAL_ERROR), null);
  assertEquals(adminOnlyDenial("rateware-api", { ...org, roles: ["admin"] }, "archive_staging", RATE_BASE_REMOVAL_ERROR), null);
  const operator = adminOnlyDenial("rateware-api", { ...org, roles: ["operator"] }, "update_shipper", SHIPPER_ARCHIVE_ERROR);
  assertEquals(operator?.code, "role_forbidden");
  assertEquals(operator?.required, "admin");
  assertEquals(operator?.error, SHIPPER_ARCHIVE_ERROR);
});

Deno.test("only accounts of an organization are held to a role", () => {
  assertEquals(teamRoleDenial("rateware-api", { sub: "outsider" }, { action: "create_rfx_event" }), null);
  assertEquals(teamRoleDenial("rateware-api", { ...org, roles: ["admin"] }, { action: "award_rfx_lane_vendor" }), null);
  const operator = teamRoleDenial("rateware-api", { ...org, roles: ["operator"] }, { action: "award_rfx_lane_vendor" });
  assertEquals(operator?.code, "role_forbidden");
  assertEquals(operator?.required, "admin");
  assertEquals(operator?.error, "Solo un Administrador puede hacer esto.");
  const viewer = teamRoleDenial("rateware-api", org, { action: "create_rfx_event" });
  assertEquals(viewer?.role, "viewer", "an organization account without a role reads only");
  assertEquals(viewer?.required, "operate");
  assertEquals(teamRoleDenial("rateware-api", org, { action: "list_rfx_events" }), null);
});

/** A database that records any use and fails it, so a denied call can be told from an allowed one. */
function recordingClient() {
  const touched: string[] = [];
  const fail = (name: string) => () => {
    touched.push(name);
    throw new Error(`database touched: ${name}`);
  };
  const client = new Proxy({}, { get: (_target, name) => fail(String(name)) });
  return { client, touched };
}

async function call(claims: Record<string, unknown>, body: Record<string, unknown>) {
  const { client, touched } = recordingClient();
  const handler = ratewareApi.createRatewareApiHandler({
    getClient: () => client as never,
    authenticate: () => Promise.resolve(claims as never),
    resolveUser: () => Promise.resolve({ owner_user_id: "user-1", owner_email: "org:org-a", organization_id: "org-a" } as never),
  });
  const response = await handler(new Request("https://rateware.test/functions/v1/rateware-api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json(), touched };
}

/** A database whose every query answers `result`, recording what was asked of it. */
function answeringClient(result: Record<string, unknown>) {
  const touched: string[] = [];
  const chain: unknown = new Proxy(() => chain, {
    get: (_target, name) => {
      if (name === "then") return (resolve: (value: unknown) => void) => resolve(result);
      touched.push(String(name));
      return chain;
    },
    apply: () => chain,
  });
  return { client: chain, touched };
}

async function callWith(result: Record<string, unknown>, claims: Record<string, unknown>, body: Record<string, unknown>) {
  const { client, touched } = answeringClient(result);
  const handler = ratewareApi.createRatewareApiHandler({
    getClient: () => client as never,
    authenticate: () => Promise.resolve(claims as never),
    resolveUser: () => Promise.resolve({ owner_user_id: "user-1", owner_email: "org:org-a", organization_id: "org-a" } as never),
  });
  const response = await handler(new Request("https://rateware.test/functions/v1/rateware-api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json(), touched };
}

const RATE = "00000000-0000-4000-8000-000000000001";
const CARRIER = "00000000-0000-4000-8000-000000000003";
const approvedRate = { data: { id: RATE, status: "approved" }, count: 1, error: null };
const pendingRate = { data: { id: RATE, status: "pending_review" }, count: 0, error: null };
const archiving = { action: "archive_staging", ids: [RATE], confirmed: true, confirmation_action: "archive_staging" };

Deno.test("an operator can't take approved rates out of the rate base", async () => {
  const archived = await callWith(approvedRate, { ...org, roles: ["operator"] }, archiving);
  assertEquals(archived.status, 403);
  assertEquals(archived.body.error, RATE_BASE_REMOVAL_ERROR);
  assert(!archived.touched.includes("update"), "nothing was archived");
  const reopened = await callWith(approvedRate, { ...org, roles: ["operator"] }, { action: "update_staging", id: RATE, patch: { status: "pending_review" } });
  assertEquals(reopened.status, 403);
  assert(!reopened.touched.includes("update"));
  const removed = await callWith(approvedRate, { ...org, roles: ["operator"] }, { action: "remove_upload", id: RATE, confirmed: true, confirmation_action: "remove_upload" });
  assertEquals(removed.status, 403, "its approved rates would be deleted with the upload");
  assert(!removed.touched.includes("delete") && !removed.touched.includes("storage"));
});

Deno.test("an operator still archives rates in review, and an admin takes approved ones out", async () => {
  const pending = await callWith(pendingRate, { ...org, roles: ["operator"] }, archiving);
  assert(pending.status !== 403 && pending.touched.includes("update"), "archiving a rate in review is day-to-day work");
  const admin = await callWith(approvedRate, { ...org, roles: ["admin"] }, archiving);
  assert(admin.status !== 403 && admin.touched.includes("update"));
});

Deno.test("an operator can't restore an archived shipper", async () => {
  const SHIPPER = "00000000-0000-4000-8000-000000000002";
  const archivedShipper = { data: { id: SHIPPER, status: "archived", shipper_name: "Ejemplo" }, error: null };
  const restored = await callWith(archivedShipper, { ...org, roles: ["operator"] }, { action: "update_shipper", id: SHIPPER, patch: { status: "prospect" } });
  assertEquals(restored.status, 403);
  assertEquals(restored.body.error, SHIPPER_ARCHIVE_ERROR);
  assert(!restored.touched.includes("update"));
  const edited = await callWith(archivedShipper, { ...org, roles: ["operator"] }, { action: "update_shipper", id: SHIPPER, patch: { notes: "Llamar el lunes" } });
  assert(edited.status !== 403 && edited.touched.includes("update"), "editing an archived shipper's notes is not restoring it");
});

Deno.test("an operator can't merge duplicate carriers or archive one, and still previews and moves them", async () => {
  const operator = { ...org, roles: ["operator"] };
  const merge = await call(operator, {
    action: "consolidate_exact_vendor_duplicates", dry_run: false, preview_count: 1,
    confirmed: true, confirmation_action: "consolidate_exact_vendor_duplicates",
  });
  assertEquals(merge.status, 403);
  assertEquals(merge.body.required, "admin");
  assertEquals(merge.touched, []);
  const preview = await call(org, { action: "consolidate_exact_vendor_duplicates", dry_run: true });
  assert(preview.status !== 403 && preview.touched.length > 0, "anyone may look at the duplicates");
  const archive = await call(operator, {
    action: "bulk_update_vendors", ids: [CARRIER], patch: { base_stage: "archived" },
    confirmed: true, confirmation_action: "bulk_update_vendors",
  });
  assertEquals(archive.status, 403);
  assertEquals(archive.touched, []);
  const edit = await call(operator, { action: "update_vendor", id: CARRIER, patch: { base_stage: "archived" } });
  assertEquals(edit.status, 403);
  assertEquals(edit.touched, []);
  const move = await call(operator, { action: "bulk_update_vendors", ids: [CARRIER], patch: { base_stage: "procurement", funnel_stage: "invited" } });
  assert(move.status !== 403 && move.touched.length > 0, "moving a carrier through the pipeline is day-to-day work");
});

Deno.test("an operator can't archive a carrier through the CRM template or an import", async () => {
  const carrier = { data: [{ id: CARRIER, vendor_name: "Ejemplo SA", domain: "ejemplo.mx", base_stage: "procurement", status: "active" }], error: null };
  const template = {
    action: "apply_vendor_template_updates", dry_run: false,
    rows: [{ vendor_id: CARRIER, base_stage: "archived" }],
    confirmed: true, confirmation_action: "apply_vendor_template_updates",
  };
  const byOperator = await callWith(carrier, { ...org, roles: ["operator"] }, template);
  assertEquals(byOperator.status, 403);
  assertEquals(byOperator.body.error, CARRIER_ARCHIVE_ERROR);
  assert(!byOperator.touched.includes("update"), "nothing was archived");
  const byAdmin = await callWith(carrier, { ...org, roles: ["admin"] }, template);
  assert(byAdmin.status !== 403 && byAdmin.touched.includes("update"));
  const notes = await callWith(carrier, { ...org, roles: ["operator"] }, { ...template, rows: [{ vendor_id: CARRIER, notes: "Llamar el lunes" }] });
  assert(notes.status !== 403 && notes.touched.includes("update"), "the template still edits carriers");

  const imported = await callWith(carrier, { ...org, roles: ["operator"] }, {
    action: "import_vendors", vendors: [{ vendor_name: "Ejemplo SA", domain: "ejemplo.mx", base_stage: "archived" }],
  });
  assertEquals(imported.status, 403);
  assertEquals(imported.body.error, CARRIER_ARCHIVE_ERROR);
  assert(!imported.touched.includes("upsert"), "nothing was imported");
});

Deno.test("an operator can't take a carrier out of the archive, however it's asked", async () => {
  const operator = { ...org, roles: ["operator"] };
  const archivedRows = { data: [{ id: CARRIER, vendor_name: "Ejemplo SA", domain: "ejemplo.mx", base_stage: "archived", status: "active" }], error: null };
  const liveRows = { data: [{ id: CARRIER, vendor_name: "Ejemplo SA", domain: "ejemplo.mx", base_stage: "sourcing", status: "active" }], error: null };
  const move = { action: "bulk_update_vendors", ids: [CARRIER], patch: { base_stage: "sourcing" } };

  const moved = await callWith(archivedRows, operator, move);
  assertEquals(moved.status, 403);
  assertEquals(moved.body.error, CARRIER_ARCHIVE_ERROR);
  assert(!moved.touched.includes("update"), "nothing was restored");
  const promoted = await callWith(liveRows, operator, { ...move, patch: { base_stage: "procurement", funnel_stage: "targeted" } });
  assert(promoted.status !== 403 && promoted.touched.includes("update"), "moving a live carrier between bases is day-to-day work");
  const byAdmin = await callWith(archivedRows, { ...org, roles: ["admin"] }, move);
  assert(byAdmin.status !== 403 && byAdmin.touched.includes("update"));

  const archivedOne = { data: archivedRows.data[0], error: null };
  const edited = await callWith(archivedOne, operator, { action: "update_vendor", id: CARRIER, patch: { base_stage: "procurement" } });
  assertEquals(edited.status, 403);
  assert(!edited.touched.includes("update"));
  const notes = await callWith(archivedOne, operator, { action: "update_vendor", id: CARRIER, patch: { notes: "Sigue archivado" } });
  assert(notes.status !== 403 && notes.touched.includes("update"), "editing an archived carrier's notes is not restoring it");

  const template = await callWith(archivedRows, operator, {
    action: "apply_vendor_template_updates", dry_run: false,
    rows: [{ vendor_id: CARRIER, base_stage: "sourcing" }],
    confirmed: true, confirmation_action: "apply_vendor_template_updates",
  });
  assertEquals(template.status, 403);
  assert(!template.touched.includes("update"));

  const imported = await callWith(archivedRows, operator, {
    action: "import_vendors", vendors: [{ vendor_name: "Ejemplo SA", domain: "ejemplo.mx", base_stage: "sourcing" }],
  });
  assertEquals(imported.status, 403);
  assert(!imported.touched.includes("upsert"));
});

Deno.test("rateware-api refuses an operator's award before touching the database", async () => {
  const result = await call({ ...org, roles: ["operator"] }, { action: "award_rfx_lane_vendor", invitation_id: "i-1" });
  assertEquals(result.status, 403);
  assertEquals(result.body.code, "role_forbidden");
  assertEquals(result.touched, []);
});

Deno.test("rateware-api refuses an operator's close, which hands the awards to rateware", async () => {
  const result = await call({ ...org, roles: ["operator"] }, { action: "update_rfx_event", id: "e-1", patch: { status: "closed" } });
  assertEquals(result.status, 403);
  assertEquals(result.touched, []);
});

Deno.test("rateware-api refuses an operator's approval, which puts the rate in the rate base", async () => {
  const approval = await call({ ...org, roles: ["operator"] }, { action: "update_staging", id: "r-1", patch: { status: "approved" } });
  assertEquals(approval.status, 403);
  assertEquals(approval.body.required, "admin");
  assertEquals(approval.touched, []);
  const correction = await call({ ...org, roles: ["operator"] }, { action: "update_staging", id: "r-1", patch: { currency: "USD" } });
  assert(correction.status !== 403 && correction.touched.length > 0, "an operator still corrects a staged rate");
});

Deno.test("rateware-api lets an organization account without a role only read", async () => {
  const write = await call(org, { action: "create_rfx_event", event: { name: "Test" } });
  assertEquals(write.status, 403);
  assertEquals(write.body.required, "operate");
  assertEquals(write.touched, []);
  const read = await call(org, { action: "list_rfx_events" });
  assert(read.status !== 403 && read.touched.length > 0, "a read goes through the gate");
});

Deno.test("rateware-api lets the right role through the gate", async () => {
  const opening = await call({ ...org, roles: ["operator"] }, { action: "update_rfx_event", id: "e-1", patch: { status: "open" } });
  assert(opening.status !== 403 && opening.touched.length > 0, "an operator opens an event");
  const award = await call({ ...org, roles: ["admin"] }, { action: "award_rfx_lane_vendor", invitation_id: "i-1" });
  assert(award.status !== 403 && award.touched.length > 0, "an admin awards");
  const outsider = await call({ sub: "outsider" }, { action: "create_rfx_event", event: { name: "Test" } });
  assert(outsider.status !== 403 && outsider.touched.length > 0, "an account outside every organization keeps working in its own space");
});
