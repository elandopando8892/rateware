import { assertEquals } from "jsr:@std/assert@1.0.14";

const serve = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const { createRatewareApiHandler } = await import("../supabase/functions/rateware-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: serve });

function item(category: string, value: string, active: unknown, source = "rateware_seed", metadata = {}) {
  return { id: `${category}:${value}:${active}`, category, raw_value: value, normalized_value: value, active, source, metadata };
}

async function options(catalog: Record<string, unknown>[], pairs: Record<string, unknown>[] = []) {
  const calls: { table: string; filters: Record<string, unknown>; ranges: number[][] }[] = [];
  const client = {
    from(table: string) {
      const call = { table, filters: {} as Record<string, unknown>, ranges: [] as number[][] };
      calls.push(call);
      let start = 0, end = 999;
      const chain = {
        select() { return chain; },
        eq(key: string, value: unknown) { call.filters[key] = value; return chain; },
        order() { return chain; },
        limit() { return chain; },
        range(from: number, to: number) { start = from; end = to; call.ranges.push([from, to]); return chain; },
        then(resolve: (value: unknown) => void) {
          const rows = table === "rateware_catalog_items" ? catalog.slice(start, end + 1)
            : table === "border_crossing_pairs" ? pairs : [];
          resolve({ data: rows, error: null });
        },
      };
      // Solo lectura: cualquier insert/update/delete falla el arnés.
      return chain;
    },
  };
  const handler = createRatewareApiHandler({
    getClient: () => client as never,
    authenticate: () => Promise.resolve({ sub: "user-a", email: "viewer@example.test", roles: ["viewer"], rateware_organization_id: "team-a" } as never),
    resolveUser: () => Promise.resolve({ owner_email: "org:team-a", owner_user_id: "user-a", organization_id: "team-a" } as never),
  });
  const response = await handler(new Request("https://rateware.test/functions/v1/rateware-api", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "list_staging_options" }),
  }));
  return { status: response.status, body: await response.json(), calls };
}

Deno.test("Laredo inactivo sale de México y el par legítimo permanece en EE. UU.", async () => {
  const result = await options([
    item("border_crossing", "Laredo, TX", false, "rateware_google_catalog"),
    item("border_crossing", "Nuevo Laredo / Laredo", false),
    item("mx_border_crossing", "Colombia, NL", true),
  ], [{ mx_city: "Nuevo Laredo", mx_state: "TM", us_city: "Laredo", us_state: "TX" }]);
  assertEquals(result.status, 200);
  assertEquals(result.body.mx_crossings, ["Colombia, NL", "Nuevo Laredo, TM"]);
  assertEquals(result.body.us_crossings, ["Laredo, TX"]);
  assertEquals(result.body.categories.border_crossing, undefined);
});

Deno.test("todas las categorías excluyen inactivos y preservan alias activos y propiedad manual", async () => {
  const categories = ["equipment", "trailer", "config", "operation", "service", "driver", "mx_border_crossing", "us_border_crossing", "border_crossing"];
  const result = await options(categories.flatMap(category => [
    item(category, "Activo", true), item(category, "Activo", false),
    item(category, "Inactivo", false), item(category, "Sin estado", null),
    item(category, "Manual propio", true, "rateware_manual_catalog", { owner_email: "org:team-a" }),
    item(category, "Manual ajeno", true, "rateware_manual_catalog", { owner_email: "org:team-b" }),
  ]));
  assertEquals(result.status, 200);
  for (const category of categories) assertEquals(result.body.categories[category], ["Activo", "Manual propio"]);
  assertEquals(result.calls.find(c => c.table === "vendors")?.filters.owner_email, "org:team-a");
  assertEquals(result.calls.find(c => c.table === "border_crossing_pairs")?.filters.active, true);
});

Deno.test("el filtro conserva opciones activas después de la primera página del catálogo", async () => {
  const result = await options([
    ...Array.from({ length: 1000 }, (_, i) => item("border_crossing", `Inactivo ${i}`, false)),
    item("equipment", "Rabon", true),
  ]);
  assertEquals(result.status, 200);
  assertEquals(result.body.categories, { equipment: ["Rabon"] });
  assertEquals(result.calls.filter(c => c.table === "rateware_catalog_items").flatMap(c => c.ranges), [[0, 999], [1000, 1999]]);
});
