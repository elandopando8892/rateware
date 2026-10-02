// Actual Edge handler, synthetic RPC/auth. Does NOT prove SQL transaction behavior.
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";
const serve = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const { createRatewareApiHandler } = await import(
  "../supabase/functions/rateware-api/index.ts"
);
Object.defineProperty(Deno, "serve", { configurable: true, value: serve });
const ID = "00000000-0000-4000-8000-000000000001";
const OP = "00000000-0000-4000-8000-000000000002";
const BAD = "bad@example.test", GOOD = "good@example.test";
async function call(
  options: {
    role?: string;
    operation?: string;
    omitOperation?: boolean;
    rpcError?: { code: string; message: string };
    replayed?: boolean;
    missingRow?: boolean;
    bounced?: string;
    replacement?: string;
  } = {},
) {
  const rpcs: { name: string; args: Record<string, unknown> }[] = [];
  const tables: string[] = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      rpcs.push({ name, args });
      return Promise.resolve({
        error: options.rpcError ?? null,
        data: options.missingRow ? {} : {
          row: {
            id: ID,
            vendor_name: "Synthetic carrier",
            primary_email: GOOD,
            secondary_emails: [],
          },
          operation_id: args.p_operation_id,
          replayed: options.replayed ?? false,
          bounced_email: BAD,
          replacement_email: GOOD,
        },
      });
    },
    from(table: string) {
      tables.push(table);
      // Only the optional post-commit audit is allowed outside the RPC.
      if (table !== "saas_audit_log") {
        throw Error(`Unexpected direct table access: ${table}`);
      }
      return { insert: () => Promise.resolve({ data: null, error: null }) };
    },
  };
  const handler = createRatewareApiHandler({
    getClient: () => client as never,
    authenticate: () =>
      Promise.resolve(
        {
          sub: ID,
          email: "operator@example.test",
          roles: [options.role ?? "operator"],
          permissions: ["vendors:manage"],
          rateware_organization_id: "a",
        } as never,
      ),
    resolveUser: () =>
      Promise.resolve(
        {
          owner_email: "org:a",
          owner_user_id: ID,
          organization_id: "a",
        } as never,
      ),
  });
  const response = await handler(
    new Request("https://rateware.test/functions/v1/rateware-api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "replace_bounced_vendor_email",
        id: ID,
        bounced_email: options.bounced ?? BAD,
        replacement_email: options.replacement ?? GOOD,
        owner_email: "org:foreign",
        ...(options.omitOperation
          ? {}
          : { operation_id: options.operation ?? OP }),
      }),
    }),
  );
  return { status: response.status, body: await response.json(), rpcs, tables };
}
Deno.test("one RPC uses resolved owner and caller operation; no direct contact/suppression writes", async () => {
  const r = await call();
  assertEquals(r.status, 200);
  assertEquals(r.rpcs, [{
    name: "resolve_vendor_email_bounce",
    args: {
      p_owner_email: "org:a",
      p_vendor_id: ID,
      p_bounced_email: BAD,
      p_replacement_email: GOOD,
      p_operation_id: OP,
    },
  }]);
  assertEquals(r.body.operation_id, OP);
  assertEquals(r.body.replayed, false);
  assertEquals(r.tables, ["saas_audit_log"]);
});
Deno.test("confirmed replay skips the non-transactional audit", async () => {
  const r = await call({ replayed: true });
  assertEquals(r.status, 200);
  assertEquals(r.tables, []);
});
Deno.test("legacy caller without operation receives a generated UUID", async () => {
  const r = await call({ omitOperation: true });
  assertEquals(r.status, 200);
  assert(/^[0-9a-f-]{36}$/.test(String(r.rpcs[0].args.p_operation_id)));
});
for (const code of ["PGRST202", "42883"]) {
  Deno.test(`missing RPC ${code} fails closed`, async () => {
    const r = await call({
      rpcError: { code, message: "Synthetic missing RPC" },
    });
    assertEquals(r.status, 503);
    assertEquals(r.body.code, "bounce_resolution_unavailable");
    assertEquals(r.tables, []);
  });
}
for (
  const [message, status] of [
    ["bounce_resolution_invalid_input", 400],
    ["bounce_vendor_not_found", 404],
    ["bounce_not_unresolved", 400],
    ["bounce_replacement_blocked", 400],
    ["bounce_operation_conflict", 409],
    ["bounce_resolution_state_changed", 409],
  ] as const
) {
  Deno.test(`RPC denial ${message}`, async () => {
    const r = await call({ rpcError: { code: "P0001", message } });
    assertEquals(r.status, status);
    assertEquals(r.body.code, message);
    assertEquals(r.tables, []);
  });
}
Deno.test("unexpected transaction failure is an error, never confirmed success", async () => {
  const r = await call({
    rpcError: { code: "P0001", message: "Synthetic suppression failure" },
  });
  assert(r.status >= 500);
  assertEquals(r.tables, ["saas_audit_log"]); // Existing error incident audit only.
});
Deno.test("missing RPC result is not represented as success", async () => {
  const r = await call({ missingRow: true });
  assert(r.status >= 500);
  assertEquals(r.tables, ["saas_audit_log"]); // Existing error incident audit only.
});
Deno.test("viewer cannot call the RPC even with vendors permission", async () => {
  const r = await call({ role: "viewer" });
  assertEquals(r.status, 403);
  assertEquals(r.rpcs, []);
});
for (
  const options of [{ operation: "not-a-uuid" }, { bounced: "invalid" }, {
    replacement: BAD,
  }]
) {
  Deno.test(`invalid request rejected before RPC ${JSON.stringify(options)}`, async () => {
    const r = await call(options);
    assertEquals(r.status, 400);
    assertEquals(r.rpcs, []);
  });
}
