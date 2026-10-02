// Real handler; synthetic identity/database. No provider or network permissions.
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";

const serve = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const { createRatewareApiHandler } = await import(
  "../supabase/functions/rateware-api/index.ts"
);
Object.defineProperty(Deno, "serve", { configurable: true, value: serve });

type Row = Record<string, unknown>;
const edits = {
  name: "Synthetic invitation",
  channel: "email",
  subject: "Invitation {{rfx_id}}",
  html_body: "<p>Hello {{vendor_name}}</p>",
  whatsapp_body: "Synthetic text",
  whatsapp_group_body: "Separate {{group_name}}",
  is_default: true,
  active: true,
  template_scope: "canonical",
  canonical_language: "en",
  placeholders: ["rfx_id", "vendor_name", "group_name"],
  meta_template_name: "synthetic-meta",
  meta_template_language: "en_US",
  meta_template_status: "APPROVED",
  meta_template_components: [{ type: "BODY", text: "synthetic" }],
};
function setup(role = "operator", team = "a") {
  const rows: Row[] = [
    { ...edits, id: "template-a", owner_email: "org:team-a" },
    {
      ...edits,
      id: "template-b",
      owner_email: "org:team-b",
      name: "Private B invitation",
    },
    {
      ...edits,
      id: "template-system",
      owner_email: null,
      name: "System original",
    },
  ];
  const queries: {
    table: string;
    kind: string;
    filters: Row;
    values: Row | null;
  }[] = [];
  const audits: Row[] = [];
  let nextId = 1, failUpdate = false;
  const client = {
    from(table: string) {
      const query = {
        table,
        kind: "read",
        filters: {} as Row,
        values: null as Row | null,
      };
      queries.push(query);
      if (table === "saas_audit_log") {
        return {
          insert(value: Row) {
            audits.push(structuredClone(value));
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      assertEquals(
        table,
        "outreach_templates",
        "No messages, campaigns or other business table may be touched",
      );
      let single = false, optional = false;
      const chain = {
        select() {
          return chain;
        },
        eq(key: string, value: unknown) {
          query.filters[key] = value;
          return chain;
        },
        single() {
          single = true;
          return chain;
        },
        maybeSingle() {
          single = true;
          optional = true;
          return chain;
        },
        insert(value: Row) {
          query.kind = "insert";
          query.values = structuredClone(value);
          return chain;
        },
        update(value: Row) {
          query.kind = "update";
          query.values = structuredClone(value);
          return chain;
        },
        then(resolve: (value: unknown) => void) {
          let matching = rows.filter((row) =>
            Object.entries(query.filters).every(([key, value]) =>
              row[key] === value
            )
          );
          if (query.kind === "update" && failUpdate) {
            failUpdate = false;
            resolve({
              data: null,
              error: { message: "Synthetic update unavailable" },
            });
            return;
          }
          if (query.kind === "insert") {
            const row = { ...query.values, id: `new-${nextId++}` };
            rows.push(row);
            matching = [row];
          } else if (query.kind === "update") {
            for (const row of matching) Object.assign(row, query.values);
          }
          const error = single && matching.length !== 1 &&
              !(optional && matching.length === 0)
            ? { message: "Synthetic single row not found", code: "PGRST116" }
            : null;
          resolve({
            data: error
              ? null
              : single
              ? structuredClone(matching[0] ?? null)
              : structuredClone(matching),
            error,
          });
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
          sub: `user-${team}`,
          email: `${team}@example.test`,
          roles: [role],
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
  async function call(body: Row) {
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
    // Catching a rejected query must not make an unexpected business-table access invisible.
    assert(
      queries.every((q) =>
        ["outreach_templates", "saas_audit_log"].includes(q.table)
      ),
    );
    return { status: response.status, body: await response.json() };
  }
  return {
    rows,
    queries,
    audits,
    call,
    failNextUpdate: () => {
      failUpdate = true;
    },
  };
}

for (
  const action of [
    "create_outreach_template",
    "update_outreach_template",
    "duplicate_outreach_template",
  ]
) {
  Deno.test(`Consulta rechaza ${action} antes de consultar o escribir`, async () => {
    const x = setup("viewer"), before = structuredClone(x.rows);
    const r = await x.call({
      action,
      id: "template-a",
      template: edits,
      patch: edits,
    });
    assertEquals(r.status, 403);
    assertEquals(x.rows, before);
    assertEquals(x.queries, []);
  });
}
Deno.test("crear usa la organización resuelta, ignorando owner del body", async () => {
  const x = setup();
  const beforeB = structuredClone(x.rows[1]);
  const r = await x.call({
    action: "create_outreach_template",
    template: { ...edits, template_scope: "legacy", owner_email: "org:team-b" },
  });
  assertEquals(r.status, 200);
  assertEquals(r.body.row.owner_email, "org:team-a");
  assertEquals(r.body.row.organization_id, "team-a");
  assertEquals(x.rows.length, 4);
  assertEquals(x.rows[1], beforeB);
});
Deno.test("crear canónica reutiliza solo su fila, sin duplicar ni tocar otra organización", async () => {
  const x = setup(), beforeB = structuredClone(x.rows[1]);
  for (let n = 0; n < 2; n++) {
    const r = await x.call({
      action: "create_outreach_template",
      template: { ...edits, subject: `Revision ${n}` },
    });
    assertEquals(r.status, 200);
    assertEquals(r.body.reused, true);
    assertEquals(r.body.row.id, "template-a");
  }
  assertEquals(x.rows.length, 3);
  assertEquals(x.rows[1], beforeB);
  assert(!x.queries.some((q) => q.kind === "insert"));
});
Deno.test("actualizar conserva payload completo y limita la mutación al ID propio", async () => {
  const x = setup(), others = structuredClone(x.rows.slice(1));
  const r = await x.call({
    action: "update_outreach_template",
    id: "template-a",
    patch: {
      ...edits,
      html_body: "<p>Revised {{vendor_name}}</p>",
      owner_email: "org:team-b",
    },
  });
  assertEquals(r.status, 200);
  assertEquals(r.body.row.owner_email, "org:team-a");
  assertEquals(r.body.row.whatsapp_group_body, edits.whatsapp_group_body);
  assertEquals(
    r.body.row.meta_template_components,
    edits.meta_template_components,
  );
  assertEquals(r.body.row.placeholders, edits.placeholders);
  assertEquals(r.body.row.is_default, true);
  assertEquals(r.body.row.canonical_language, "en");
  assertEquals(x.rows.slice(1), others);
  const write = x.queries.find((q) => q.kind === "update");
  assertEquals(write?.filters, { id: "template-a", owner_email: "org:team-a" });
});
for (const target of ["template-b", "template-system"]) {
  Deno.test(`actualizar ${target} no modifica ni devuelve la fila`, async () => {
    const x = setup(), before = structuredClone(x.rows);
    const r = await x.call({
      action: "update_outreach_template",
      id: target,
      patch: edits,
    });
    assert(r.status >= 400);
    assert(!r.body.row);
    assertEquals(x.rows, before);
  });
}
Deno.test("duplicar fila propia crea otro ID conservando original, sin consultar mensajes", async () => {
  const x = setup(), before = structuredClone(x.rows);
  const r = await x.call({
    action: "duplicate_outreach_template",
    id: "template-a",
  });
  assertEquals(r.status, 200);
  assert(r.body.row.id !== "template-a");
  assertEquals(r.body.row.owner_email, "org:team-a");
  assertEquals(r.body.row.is_default, false);
  assertEquals(r.body.row.html_body, edits.html_body);
  assertEquals(x.rows.slice(0, 3), before);
  assertEquals(x.rows.length, 4);
});
Deno.test("duplicar plantilla ajena no devuelve contenido ni crea una copia", async () => {
  const x = setup(), before = structuredClone(x.rows);
  const r = await x.call({
    action: "duplicate_outreach_template",
    id: "template-b",
  });
  assert(r.status >= 400);
  assert(!r.body.row);
  assert(!JSON.stringify(r.body).includes("Private B invitation"));
  assertEquals(x.rows, before);
  assert(!x.queries.some((q) => q.kind === "insert"));
});
Deno.test("duplicar sistema crea copia propia sin modificar original compartido", async () => {
  const x = setup(), before = structuredClone(x.rows[2]);
  const r = await x.call({
    action: "duplicate_outreach_template",
    id: "template-system",
  });
  assertEquals(r.status, 200);
  assertEquals(r.body.row.owner_email, "org:team-a");
  assertEquals(x.rows[2], before);
});
Deno.test("update fallido conserva estado y permite recuperación explícita sin otra fila", async () => {
  const x = setup(),
    before = structuredClone(x.rows),
    request = {
      action: "update_outreach_template",
      id: "template-a",
      patch: { ...edits, subject: "Recovered invitation" },
    };
  x.failNextUpdate();
  const failed = await x.call(request);
  assert(failed.status >= 400);
  assert(!failed.body.row);
  assertEquals(x.rows, before);
  assert(x.audits.some((row) => row.action === "api.error"));
  const recovered = await x.call(request);
  assertEquals(recovered.status, 200);
  assertEquals(recovered.body.row.id, "template-a");
  assertEquals(recovered.body.row.subject, "Recovered invitation");
  assertEquals(x.rows.length, 3);
});
Deno.test("nombre ausente rechaza antes de mutar plantillas", async () => {
  const x = setup(), before = structuredClone(x.rows);
  const r = await x.call({
    action: "create_outreach_template",
    template: { ...edits, name: " " },
  });
  assert(r.status >= 400);
  assertEquals(x.rows, before);
  assert(!x.queries.some((q) => q.table === "outreach_templates"));
});

Deno.test("identidad B opera su plantilla sin aceptar el owner A del body", async () => {
  const x = setup("operator", "b"), beforeA = structuredClone(x.rows[0]);
  const result = await x.call({
    action: "create_outreach_template",
    owner_email: "org:team-a",
    organization_id: "team-a",
    template: { ...edits, subject: "Resolved team B" },
  });
  assertEquals(result.status, 200);
  assertEquals(result.body.row.id, "template-b");
  assertEquals(result.body.row.owner_email, "org:team-b");
  for (
    const action of ["update_outreach_template", "duplicate_outreach_template"]
  ) {
    const denied = await x.call({ action, id: "template-a", patch: edits });
    assert(denied.status >= 400);
    assert(!denied.body.row);
  }
  assertEquals(x.rows[0], beforeA);
  assertEquals(x.rows.length, 3);
});
