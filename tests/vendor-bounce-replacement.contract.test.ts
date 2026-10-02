// Real handler, synthetic rows/principals; no network or production writes.
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";
const serve = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const { createRatewareApiHandler } = await import(
  "../supabase/functions/rateware-api/index.ts"
);
Object.defineProperty(Deno, "serve", { configurable: true, value: serve });
const ID = "00000000-0000-4000-8000-000000000001";
const BAD = "bad@example.test",
  GOOD = "good@example.test",
  OTHER = "other@example.test";
async function call(
  options: {
    primary?: string;
    replacement?: string;
    role?: string;
    blocked?: boolean;
    foreign?: boolean;
    suppressionFail?: boolean;
  } = {},
) {
  const vendor: Record<string, unknown> = {
    id: ID,
    owner_email: "org:a",
    vendor_name: "Synthetic carrier",
    primary_email: options.primary ?? GOOD,
    secondary_emails: [BAD, OTHER],
    tags: ["email_bounce", "keep"],
    profile_data: {
      note: "keep",
      bounced_emails: [{ email: BAD, reason: "5.1.1" }],
    },
  };
  const queries: {
    table: string;
    filters: Record<string, unknown>;
    patch?: Record<string, unknown>;
  }[] = [];
  const client = {
    from(table: string) {
      const q: typeof queries[number] = { table, filters: {} };
      queries.push(q);
      const result = () => {
        if (table === "vendors") {
          if (options.foreign) {
            return {
              data: null,
              error: { message: "Synthetic foreign row absent" },
            };
          }
          if (q.patch) Object.assign(vendor, structuredClone(q.patch));
          return { data: structuredClone(vendor), error: null };
        }
        if (table === "email_suppression_list") {
          return {
            data: !q.patch && options.blocked ? { id: "blocked" } : null,
            error: q.patch && options.suppressionFail
              ? { message: "Synthetic suppression failure" }
              : null,
          };
        }
        return { data: { id: "synthetic-audit" }, error: null };
      };
      const chain = {
        select() {
          return chain;
        },
        eq(key: string, value: unknown) {
          q.filters[key] = value;
          return chain;
        },
        is(key: string, value: unknown) {
          q.filters[key] = value;
          return chain;
        },
        in() {
          return chain;
        },
        update(patch: Record<string, unknown>) {
          q.patch = patch;
          return chain;
        },
        insert() {
          return chain;
        },
        single() {
          return Promise.resolve(result());
        },
        maybeSingle() {
          return Promise.resolve(result());
        },
        then(resolve: (result: unknown) => unknown) {
          return Promise.resolve(result()).then(resolve);
        },
      };
      return chain;
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
        bounced_email: BAD,
        replacement_email: options.replacement ?? GOOD,
        owner_email: "org:foreign",
      }),
    }),
  );
  return {
    status: response.status,
    body: await response.json(),
    vendor,
    queries,
  };
}
for (const primary of [GOOD, BAD, ""]) {
  Deno.test(`confirmed replacement excludes primary from secondary (${primary || "missing primary"})`, async () => {
    const r = await call({ primary });
    assertEquals(r.status, 200);
    assertEquals(r.body.row.primary_email, GOOD);
    assertEquals(r.body.row.secondary_emails, [OTHER]);
    assertEquals(r.body.row.tags, ["keep"]);
    assertEquals(r.body.row.profile_data.note, "keep");
    assert(r.body.row.profile_data.bounced_emails[0].resolved_at);
    assertEquals(
      r.queries.filter((q) => q.table === "vendors" && q.patch).length,
      1,
    );
    for (
      const q of r.queries.filter((q) =>
        ["vendors", "email_suppression_list"].includes(q.table)
      )
    ) assertEquals(q.filters.owner_email, "org:a");
  });
}
Deno.test("secondary replacement preserves the current primary and other contacts", async () => {
  const r = await call({ replacement: "new@example.test" });
  assertEquals(r.status, 200);
  assertEquals(r.body.row.primary_email, GOOD);
  assertEquals(r.body.row.secondary_emails, ["new@example.test", OTHER]);
});
Deno.test("blocked replacement does not write contacts or suppressions", async () => {
  const r = await call({ blocked: true });
  assertEquals(r.status, 400);
  assert(!r.queries.some((q) => q.patch));
});
Deno.test("viewer cannot replace even with vendors permission", async () => {
  const r = await call({ role: "viewer" });
  assertEquals(r.status, 403);
  assert(!r.queries.some((q) => q.patch));
});
Deno.test("foreign row never receives an update", async () => {
  const r = await call({ foreign: true });
  assert(r.status >= 400);
  assert(!r.queries.some((q) => q.patch));
});
Deno.test("suppression failure is not represented as confirmed success", async () => {
  const r = await call({ suppressionFail: true });
  assert(r.status >= 400);
  // Existing two-table handler is not transactional; document this acceptance gap.
  assertEquals(
    r.queries.filter((q) => q.table === "vendors" && q.patch).length,
    1,
  );
});
