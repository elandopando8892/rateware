import assert from "node:assert/strict";
import test from "node:test";
import {
  QuoteInputError,
  canTransition,
  catalogKey,
  computeLane,
  folioFor,
  legRouteKeys,
  normalizeAccessorials,
  suggestedFuelAmount,
  summarizeLanes
} from "../supabase/functions/quotedesk-api/calc.mjs";

test("base cost adds the captured components; blanks stay blank", () => {
  const lane = computeLane({ linehaul_mx: 2200, linehaul_us: "1,400", fuel_amount: 520, border_amount: 180 });
  assert.equal(lane.base_cost, 4300);
  assert.equal(computeLane({}).base_cost, null);
  assert.equal(computeLane({ linehaul_mx: 0 }).base_cost, 0);
});

test("percent markup applies on base + accessorials, and margin is the markup", () => {
  const lane = computeLane({
    linehaul_mx: 3600,
    fuel_amount: 520,
    border_amount: 180,
    accessorials: [
      { code: "detention_origin", label: "Detención en origen", unit: "hour", quantity: 2, rate: 45 },
      { code: "layover", label: "Layover", unit: "event", quantity: 1, rate: 60 }
    ],
    markup_mode: "percent_on_cost",
    markup_value: 15
  });
  assert.equal(lane.base_cost, 4300);
  assert.equal(lane.accessorials_total, 150);
  assert.equal(lane.markup_amount, 667.5);
  assert.equal(lane.all_in_rate, 5117.5);
  assert.equal(lane.margin_amount, 667.5);
  assert.equal(lane.margin_pct, 13.0435);
});

test("fixed markup adds the amount as is", () => {
  const lane = computeLane({ carrier_rate: 2800, markup_mode: "fixed_amount", markup_value: 350 });
  assert.equal(lane.all_in_rate, 3150);
  assert.equal(lane.markup_amount, 350);
});

test("target margin solves the price so the margin is that share of the price", () => {
  const lane = computeLane({ linehaul_us: 1000, markup_mode: "target_margin", markup_value: 20 });
  assert.equal(lane.all_in_rate, 1250);
  assert.equal(lane.markup_amount, 250);
  assert.equal(lane.margin_pct, 20);
});

test("no markup value means price equals cost; no cost means no price", () => {
  assert.equal(computeLane({ linehaul_us: 900 }).all_in_rate, 900);
  assert.equal(computeLane({ linehaul_us: 900 }).margin_pct, 0);
  const empty = computeLane({ markup_mode: "percent_on_cost", markup_value: 15 });
  assert.equal(empty.all_in_rate, null);
  assert.equal(empty.margin_pct, null);
});

test("invalid inputs are rejected with a readable error", () => {
  assert.throws(() => computeLane({ linehaul_mx: -1 }), QuoteInputError);
  assert.throws(() => computeLane({ linehaul_us: 100, markup_mode: "target_margin", markup_value: 100 }), QuoteInputError);
  assert.throws(() => computeLane({ linehaul_us: 100, markup_mode: "percent_on_cost", markup_value: -100 }), QuoteInputError);
});

test("accessorial lines need a label and non-negative numbers; unknown units become other", () => {
  const lines = normalizeAccessorials([
    { label: "Escolta", unit: "trip", quantity: 1, rate: 180 },
    { label: "", unit: "trip", quantity: 1, rate: 50 },
    { label: "Negativo", unit: "event", quantity: -1, rate: 50 },
    { label: "Raro", unit: "semana", quantity: 2, rate: "10.5" },
    "not an object"
  ]);
  assert.deepEqual(lines.map((line) => [line.label, line.unit, line.subtotal]), [
    ["Escolta", "trip", 180],
    ["Raro", "other", 21]
  ]);
});

test("quote summary adds only priced routes", () => {
  const summary = summarizeLanes([
    computeLane({ linehaul_us: 1000, markup_mode: "target_margin", markup_value: 20 }),
    computeLane({ linehaul_us: 2000, markup_mode: "percent_on_cost", markup_value: 10 }),
    computeLane({})
  ]);
  assert.equal(summary.lane_count, 3);
  assert.equal(summary.priced_lane_count, 2);
  assert.equal(summary.all_in_total, 3450);
  assert.equal(summary.margin_total, 450);
  assert.equal(summary.margin_pct, 13.0435);
});

test("US fuel surcharge converts to MXN only when the quote is in pesos", () => {
  assert.equal(suggestedFuelAmount({ usMiles: 155, fscPerMile: 0.79, currency: "USD" }), 122.45);
  assert.equal(suggestedFuelAmount({ usMiles: 155, fscPerMile: 0.79, currency: "MXN", fxUsdMxn: 17.5 }), 2142.88);
  assert.equal(suggestedFuelAmount({ usMiles: 0, fscPerMile: 0.79, currency: "USD" }), null);
  assert.equal(suggestedFuelAmount({ usMiles: 100, fscPerMile: 0.79, currency: "MXN" }), null);
});

test("route keys match rateware's lane mileage keys", () => {
  assert.equal(catalogKey("Nuevo León, NL"), "NUEVO LEON NL");
  const mx = legRouteKeys(
    { city: "Monterrey", state_code: "NL", state_name: "Nuevo Leon" },
    { city: "Nuevo Laredo", state_code: "TM", state_name: "Tamaulipas" }
  );
  assert.ok(mx.includes("MONTERREY NL NUEVO LAREDO TAMAULIPAS"));
  assert.ok(mx.includes("MONTERREY NUEVO LEON NUEVO LAREDO TM"));
  const us = legRouteKeys({ market: "Laredo Mkt (TX)" }, { market: "Dallas Mkt (TX)" });
  assert.ok(us.includes("LAREDO MKT TX DALLAS MKT TX"));
});

test("status moves follow the queue", () => {
  assert.ok(canTransition("new", "estimating"));
  assert.ok(canTransition("estimating", "bid_room"));
  assert.ok(canTransition("quoted", "won"));
  assert.ok(canTransition("archived", "new"));
  assert.ok(!canTransition("won", "new"));
  assert.ok(!canTransition("new", "won"));
});

test("folios read Q-<number>", () => {
  assert.equal(folioFor(1001), "Q-1001");
});
