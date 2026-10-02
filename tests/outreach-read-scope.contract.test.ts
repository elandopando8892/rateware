// Real handler, synthetic principals and database. No network or write permissions.
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";

const serve = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const { createRatewareApiHandler } = await import(
  "../supabase/functions/rateware-api/index.ts"
);
Object.defineProperty(Deno, "serve", { configurable: true, value: serve });

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EVENT_A = id(1), EVENT_B = id(2), MESSAGE_A = id(3), MESSAGE_B = id(4);
const messages = [
  {
    id: MESSAGE_A,
    owner_email: "org:team-a",
    rfx_event_id: EVENT_A,
    channel: "email",
    status: "drafted",
    subject: "Synthetic A",
    recipient_email: "a@example.test",
    metadata: {},
  },
  {
    id: MESSAGE_B,
    owner_email: "org:team-b",
    rfx_event_id: EVENT_B,
    channel: "email",
    status: "drafted",
    subject: "Synthetic B",
    recipient_email: "b@example.test",
    metadata: {},
  },
];
type Options = {
  role?: string;
  team?: "a" | "b";
  unauthenticated?: boolean;
  fail?: boolean;
  rpcLeak?: boolean;
};
type Query = {
  table: string;
  filters: Record<string, unknown>;
  lists: Record<string, unknown[]>;
};

async function call(body: Record<string, unknown>, options: Options = {}) {
  const queries: Query[] = [];
  const rpcs: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    from(table: string) {
      const query: Query = { table, filters: {}, lists: {} };
      queries.push(query);
      let single = false;
      let range = [0, 999];
      const chain = {
        select() {
          return chain;
        },
        eq(column: string, value: unknown) {
          query.filters[column] = value;
          return chain;
        },
        in(column: string, values: unknown[]) {
          query.lists[column] = values;
          return chain;
        },
        neq() {
          return chain;
        },
        order() {
          return chain;
        },
        or() {
          return chain;
        },
        range(from: number, to: number) {
          range = [from, to];
          return chain;
        },
        maybeSingle() {
          single = true;
          return chain;
        },
        then(resolve: (value: unknown) => void) {
          assertEquals(
            table,
            "outreach_messages",
            "Only the expected read table may be queried",
          );
          const matching = messages.filter((row) =>
            Object.entries(query.filters).every(([key, value]) =>
              row[key as keyof typeof row] === value
            ) &&
            Object.entries(query.lists).every(([key, values]) =>
              values.includes(row[key as keyof typeof row])
            )
          );
          resolve({
            data: options.fail
              ? null
              : single
              ? matching[0] ?? null
              : matching.slice(range[0], range[1] + 1),
            count: matching.length,
            error: options.fail
              ? { message: "Synthetic database unavailable" }
              : null,
          });
        },
      };
      // Deliberately no insert, update, delete or upsert methods.
      return chain;
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcs.push({ name, args });
      assertEquals(name, "rateware_outreach_tracking_page");
      const matching = options.rpcLeak
        ? messages
        : messages.filter((row) =>
          row.owner_email === args.p_owner_email &&
          (!args.p_rfx_event_id || row.rfx_event_id === args.p_rfx_event_id)
        );
      return Promise.resolve({
        data: { ids: matching.map((row) => row.id), total: matching.length },
        error: options.fail ? { message: "Synthetic RPC unavailable" } : null,
      });
    },
  };
  const team = options.team ?? "a";
  const handler = createRatewareApiHandler({
    getClient: () => client as never,
    authenticate: () =>
      options.unauthenticated
        ? Promise.reject(new Error("Unauthorized"))
        : Promise.resolve(
          {
            sub: `user-${team}`,
            email: `${team}@example.test`,
            roles: [options.role ?? "viewer"],
            rateware_organization_id: `team-${team}`,
          } as never,
        ),
    resolveUser: () =>
      Promise.resolve(
        {
          owner_email: `org:team-${team}`,
          owner_user_id: `user-${team}`,
          organization_id: `team-${team}`,
        } as never,
      ),
  });
  const response = await handler(
    new Request("https://rateware.test/functions/v1/rateware-api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        owner_email: "org:team-b",
        organization_id: "team-b",
        ...body,
      }),
    }),
  );
  return {
    status: response.status,
    body: await response.json(),
    queries,
    rpcs,
  };
}

const request = (mode: string, event = EVENT_A, message = MESSAGE_A) =>
  mode === "reader"
    ? { action: "get_outreach_message", id: message, rfx_event_id: event }
    : {
      action: "list_outreach_messages",
      rfx_event_id: event,
      compact: true,
      limit: 25,
      ...(mode === "tracking"
        ? { tracking_status: "drafted", enforce_rfx_event_scope: true }
        : {}),
    };
const rows = (result: { body: Record<string, unknown> }, mode: string) =>
  mode === "reader"
    ? result.body.row ? [result.body.row] : []
    : result.body.rows as { id: string }[];

for (const role of ["viewer", "operator", "admin"]) {
  for (const mode of ["list", "tracking", "reader"]) {
    Deno.test(`${role}: ${mode} usa el workspace resuelto e ignora el alcance del body`, async () => {
      const result = await call(request(mode), { role });
      assertEquals(result.status, 200);
      assertEquals(rows(result, mode).map((row: { id: string }) => row.id), [
        MESSAGE_A,
      ]);
      assert(result.queries.length > 0);
      for (const query of result.queries) {
        assertEquals(query.filters.owner_email, "org:team-a");
      }
      if (mode === "tracking") {
        assertEquals(result.rpcs[0].args.p_owner_email, "org:team-a");
        assertEquals(result.rpcs[0].args.p_rfx_event_id, EVENT_A);
        assertEquals(result.rpcs[0].args.p_enforce_event_scope, true);
      } else assertEquals(result.queries[0].filters.rfx_event_id, EVENT_A);
    });
  }
}

for (const mode of ["list", "tracking", "reader"]) {
  Deno.test(`${mode}: no devuelve el evento de otra organización`, async () => {
    const result = await call(request(mode, EVENT_B, MESSAGE_B));
    assertEquals(result.status, 200);
    assertEquals(rows(result, mode), []);
  });
}

Deno.test("lector: ID ajeno sin evento y evento incorrecto no filtran contenido", async () => {
  for (
    const body of [
      { action: "get_outreach_message", id: MESSAGE_B },
      request("reader", EVENT_B, MESSAGE_A),
    ]
  ) {
    const result = await call(body);
    assertEquals(result.status, 200);
    assertEquals(result.body.row, null);
  }
});

Deno.test("la identidad resuelta B solo recupera sus mensajes en las tres lecturas", async () => {
  for (const mode of ["list", "tracking", "reader"]) {
    const result = await call({
      ...request(mode, EVENT_B, MESSAGE_B),
      owner_email: "org:team-a",
    }, { team: "b" });
    assertEquals(result.status, 200);
    assertEquals(rows(result, mode).map((row: { id: string }) => row.id), [
      MESSAGE_B,
    ]);
    for (const query of result.queries) {
      assertEquals(query.filters.owner_email, "org:team-b");
    }
  }
});

Deno.test("el listado por estado vuelve a filtrar owner aun si el RPC incluye IDs ajenos", async () => {
  const result = await call(request("tracking"), { rpcLeak: true });
  assertEquals(result.status, 200);
  assertEquals(rows(result, "tracking").map((row: { id: string }) => row.id), [
    MESSAGE_A,
  ]);
});

Deno.test("sin autenticación no consulta mensajes ni RPC", async () => {
  for (const mode of ["list", "tracking", "reader"]) {
    const result = await call(request(mode), { unauthenticated: true });
    assert(result.status >= 400);
    assert(
      !result.queries.some((query) => query.table === "outreach_messages"),
    );
    assertEquals(result.rpcs, []);
    assert(!result.body.rows && !result.body.row);
  }
});

Deno.test("errores de lectura no se presentan como lista vacía o mensaje recuperado", async () => {
  for (const mode of ["list", "tracking", "reader"]) {
    const result = await call(request(mode), { fail: true });
    assert(result.status >= 400);
    assert(!result.body.rows && !result.body.row);
  }
});

Deno.test("lector sin ID rechaza antes de consultar mensajes", async () => {
  const result = await call({
    action: "get_outreach_message",
    rfx_event_id: EVENT_A,
  });
  assert(result.status >= 400);
  assert(!result.queries.some((query) => query.table === "outreach_messages"));
});
