import { assert, assertEquals } from "jsr:@std/assert@1.0.14";
import {
  belongsToOrganization,
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
