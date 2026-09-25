import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  baseRefusal,
  calculate,
  crossingCarriesBorder,
  customerService,
  equipmentCaveats,
  equipmentLabel,
  estimateQuoteLane,
  fcmEquipment,
  mexLaneUnits,
  readEquipment,
  fcmOperation,
  fcmService,
  getParam,
  pickCostBase,
  round2,
  scopeForOperation
} from "../supabase/functions/quotedesk-api/fcm.mjs";

const golden = JSON.parse(readFileSync(new URL("./fixtures/fcm-engine-golden.json", import.meta.url), "utf8"));

// The port skips the FCM's reference-key strings (display only) and drayage cycles.
const SKIPPED = new Set(["referenceKey", "drayageCycle"]);

function assertSameNumbers(actual, expected, path) {
  if (typeof expected === "number") {
    assert.equal(typeof actual, "number", `${path} should be a number`);
    const tolerance = Math.max(1e-9, Math.abs(expected) * 1e-12);
    assert.ok(Math.abs(actual - expected) <= tolerance, `${path}: port ${actual} vs FCM ${expected}`);
    return;
  }
  if (expected === null || typeof expected !== "object") {
    assert.deepEqual(actual, expected, path);
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path} should be an array`);
    assert.equal(actual.length, expected.length, `${path} length`);
    expected.forEach((item, index) => assertSameNumbers(actual[index], item, `${path}[${index}]`));
    return;
  }
  for (const [key, value] of Object.entries(expected)) {
    if (SKIPPED.has(key)) continue;
    assertSameNumbers(actual?.[key], value, `${path}.${key}`);
  }
}

test("the port reproduces the FCM engine on every golden scenario", () => {
  assert.ok(golden.scenarios.length >= 12);
  for (const scenario of golden.scenarios) {
    assertSameNumbers(calculate(scenario.input), scenario.output, scenario.name);
  }
});

const EXPORT_LANE = {
  params: {},
  operation: "D2D Export",
  service: "One Way",
  equipment: fcmEquipment({ equipment: "Truck Trailer", trailer: "Dry Van", config: "Single" }),
  crossingModel: "transfer",
  fxUsdMxn: 17.5,
  tier: "target",
  mex: { km: 225, tollsMxn: 732.86, hours: 3.5 },
  usa: { miles: 435, transitDays: 0, driverExpenses: 0, outState: "TX", dieselUsdGal: 3.759, fscPerMile: 1.01, originCondition: "Balanced", destCondition: "Moderately Tight" }
};

test("QuoteDesk operations, services and equipment map onto the FCM's", () => {
  assert.equal(fcmOperation("D2D Export", "MX", "US"), "D2D Export");
  assert.equal(fcmOperation("Cross-border", "US", "MX"), "D2D Import");
  assert.equal(fcmOperation("Domestic MX", "MX", "MX"), "Intra-Mex");
  assert.equal(fcmOperation("D2D Export", "MX", "MX"), "Intra-Mex", "the countries win over a mislabeled operation");
  assert.equal(fcmOperation("", "US", "US"), "Intra-US");
  assert.equal(fcmOperation("MX Southbound", "MX", "MX"), "MX Southbound");

  assert.equal(fcmService("", "D2D Import"), "Backhaul", "imports default to the carrier's backhaul");
  assert.equal(fcmService("", "D2D Export"), "One Way");
  assert.equal(fcmService("Expedited", "D2D Import"), "Expedited", "an expedited load is never a backhaul");
  assert.equal(fcmService("RT", "Intra-Mex"), "Roundtrip");
  assert.equal(fcmService("OW Import", "D2D Import"), "One Way");

  assert.equal(customerService("Backhaul"), "One Way", "the shipper always sees one-way");
  assert.equal(customerService("Roundtrip"), "Roundtrip");

  assert.deepEqual(fcmEquipment({ equipment: "DV53", trailer: "DV53", config: "53 ft" }), { truckType: "Truck Trailer", trailer: "Dry Van", config: "Single", driver: "B1" });
  assert.equal(fcmEquipment({ equipment: "Thorton", trailer: "Reefer", config: "Tandem" }).config, "Tandem");
});

test("the equipment people actually type is read as the FCM's", () => {
  const read = (equipment, trailer = "", config = "") => {
    const result = readEquipment({ equipment, trailer, config });
    return [equipmentLabel(result.equipment), result.notes];
  };
  assert.deepEqual(read("Reefer 53'", "53'"), ["Tractocamión · Refrigerado · Sencillo", []], "a reefer typed in Equipo is not priced as dry van");
  assert.deepEqual(read("Truck Trailer", "Plataforma 48'"), ["Tractocamión · Plataforma · Sencillo", []]);
  assert.deepEqual(read("Rabón")[0], "Rabón · Caja seca · Sencillo");
  assert.deepEqual(read("Straight Truck")[0], "Rabón · Caja seca · Sencillo");
  assert.deepEqual(read("Torton", "Caja seca")[0], "Torton · Caja seca · Sencillo");
  assert.deepEqual(read("Camioneta 3.5")[0], "Camioneta 3.5 t · Caja seca · Sencillo");
  assert.deepEqual(read("Box Truck")[0], "Camioneta 3.5 t · Caja seca · Sencillo");
  assert.deepEqual(read("Sprinter")[0], "Camioneta 1.5 t · Caja seca · Sencillo");
  assert.deepEqual(read("Cargo Van")[0], "Camioneta 1.5 t · Caja seca · Sencillo");
  assert.deepEqual(read("Dry Van")[0], "Tractocamión · Caja seca · Sencillo", "a dry van is a trailer, not a cargo van");
  assert.deepEqual(read("T3-S2-R4")[0], "Tractocamión · Caja seca · Full");
  assert.deepEqual(read("Truck Trailer", "Dry Van", "Full")[0], "Tractocamión · Caja seca · Full");

  const [reeferHazmat, hazmatNotes] = read("Reefer Hazmat");
  assert.equal(reeferHazmat, "Tractocamión · Refrigerado · Sencillo");
  assert.match(hazmatNotes[0], /no combina hazmat con refrigerado/);
  assert.match(read("Grúa")[1][0], /No reconocí el equipo "Grúa"; se calculó como tractocamión/);
  assert.match(read("Camioneta")[1][0], /Se interpretó "Camioneta" como camioneta 1.5 t/);
  assert.match(read("Reefer 12t")[1][0], /Se interpretó "12 t" como torton/);
  assert.deepEqual(read("Rabon")[1], [], "exact FCM names need no note");
});

test("equipment caveats say what the FCM does not model, and 1.5 t lanes use both keys", () => {
  const caveats = equipmentCaveats({ truckType: "Rabon", trailer: "Reefer", config: "Single", driver: "B1" }, {});
  assert.match(caveats[0], /Rabón: el FCM lo estima escalando el costo del tractocamión con factores fijos/);
  assert.match(caveats[1], /Refrigerado: el FCM sólo suma un recargo de riesgo de 50 %/);
  assert.deepEqual(equipmentCaveats(fcmEquipment({ equipment: "Truck Trailer", trailer: "Dry Van" }), {}), []);
  assert.deepEqual(mexLaneUnits("1.5 tons"), ["1.5 tons", "< 1.5 tons"]);
  assert.deepEqual(mexLaneUnits("Rabon"), ["Rabon"]);
});

test("interchange carries the cruce and blue plates do not", () => {
  assert.deepEqual(crossingCarriesBorder("transfer"), { carries: true, known: true });
  assert.deepEqual(crossingCarriesBorder("Drayage"), { carries: true, known: true });
  assert.deepEqual(crossingCarriesBorder("direct"), { carries: false, known: true });
  assert.equal(crossingCarriesBorder("b1").carries, false);
  assert.deepEqual(crossingCarriesBorder(""), { carries: true, known: false });

  const interchange = estimateQuoteLane(EXPORT_LANE);
  const bluePlates = estimateQuoteLane({ ...EXPORT_LANE, crossingModel: "direct" });
  assert.equal(interchange.components.border_amount, 200);
  assert.equal(bluePlates.components.border_amount, 0);
  assert.equal(interchange.components.linehaul_mx, bluePlates.components.linehaul_mx, "the cruce is its own line, outside the MX all-in");
  assert.equal(round2(interchange.carrierPriceUsd - bluePlates.carrierPriceUsd), 200);
});

test("the carrier's price is the cost floor over (1 - tier margin), per leg", () => {
  const estimate = estimateQuoteLane(EXPORT_LANE);
  const { components, us, mx } = estimate;
  assert.equal(estimate.margin, 0.18);
  assert.ok(components.linehaul_mx > 0 && components.linehaul_us > 0);
  assert.equal(components.fuel_amount, round2(1.01 * 435), "US fuel is the weekly FSC times the loaded miles");
  assert.equal(us.fscPerMile, 1.01);
  assert.equal(us.dieselUsdGal, 3.759);
  assert.equal(us.rpm, Math.round(components.linehaul_us / 435 * 10000) / 10000);
  assert.equal(mx.tollsMxn, 732.86);
  assert.equal(estimate.carrierPriceUsd, round2(components.linehaul_mx + components.linehaul_us + components.fuel_amount + components.border_amount));

  const minimum = estimateQuoteLane({ ...EXPORT_LANE, tier: "minimum" });
  const premium = estimateQuoteLane({ ...EXPORT_LANE, tier: "premium" });
  assert.ok(minimum.carrierPriceUsd < estimate.carrierPriceUsd && estimate.carrierPriceUsd < premium.carrierPriceUsd);
  // Floors are identical across tiers, so the ratio between tiers is (1 - m1) / (1 - m2).
  assert.ok(Math.abs(minimum.components.linehaul_mx / premium.components.linehaul_mx - (1 - 0.25) / (1 - 0.12)) < 1e-3);
});

test("casetas, the FX and the trip type move the estimate the right way", () => {
  const base = estimateQuoteLane(EXPORT_LANE);
  const noTolls = estimateQuoteLane({ ...EXPORT_LANE, mex: { ...EXPORT_LANE.mex, tollsMxn: 0 } });
  assert.ok(base.components.linehaul_mx > noTolls.components.linehaul_mx, "casetas are inside the MX all-in");
  const strongPeso = estimateQuoteLane({ ...EXPORT_LANE, fxUsdMxn: 16.5 });
  assert.ok(strongPeso.components.linehaul_mx > base.components.linehaul_mx, "the Banxico FX replaces the base's fixed 17.5");
  assert.equal(strongPeso.components.linehaul_us, base.components.linehaul_us, "the US leg has no pesos");

  const importOneWay = estimateQuoteLane({ ...EXPORT_LANE, operation: "D2D Import", service: "One Way" });
  const importBackhaul = estimateQuoteLane({ ...EXPORT_LANE, operation: "D2D Import", service: "Backhaul" });
  assert.ok(importBackhaul.carrierPriceUsd < importOneWay.carrierPriceUsd);
  const expedited = estimateQuoteLane({ ...EXPORT_LANE, service: "Expedited" });
  assert.ok(expedited.components.linehaul_us > base.components.linehaul_us, "expedited adds the US service uplift");

  const intraMex = estimateQuoteLane({ ...EXPORT_LANE, operation: "Intra-Mex", usa: null, mex: { km: 850, tollsMxn: 2006.4, hours: 23 } });
  assert.equal(intraMex.components.linehaul_us, null);
  assert.equal(intraMex.components.border_amount, null, "no cruce on a domestic lane");
  assert.equal(getParam({}, "BORDER", "Border Transactional Cost", 200), 200);
});


const legacyD2D = { id: "legacy", name: "Default — D2D Base", scope: null, profile: null, is_default: true };
const intraMex = {
  id: "std-mx", name: "FTL Intra-México Estándar", scope: "INTRA_MEX", is_default: false,
  profile: {
    operations: ["Intra-Mex", "MX Northbound", "MX Southbound"], services: ["One Way", "Roundtrip", "Backhaul"],
    truckTypes: ["Truck Trailer"], trailerTypes: ["Dry Van"], configurations: ["Single"], driverTypes: ["B1", "Licencia E"]
  }
};
const dryVan = { truckType: "Truck Trailer", trailer: "Dry Van", config: "Single", driver: "B1" };

test("each route gets a base of its scope, the way the FCM enforces it", () => {
  assert.equal(scopeForOperation("D2D Export"), "CROSS_BORDER");
  assert.equal(scopeForOperation("MX Southbound"), "INTRA_MEX");
  assert.equal(scopeForOperation("Intra-US"), "INTRA_US");

  const national = { operation: "Intra-Mex", service: "One Way", equipment: dryVan };
  const crossing = { operation: "D2D Export", service: "One Way", equipment: dryVan };
  assert.equal(pickCostBase([legacyD2D, intraMex], national).id, "std-mx", "national routes use the Intra-México base");
  assert.equal(pickCostBase([legacyD2D, intraMex], crossing).id, "legacy", "crossings fall back to the org's D2D base");

  assert.match(baseRefusal(intraMex, crossing), /Intra-México; esta ruta es D2D Export/);
  assert.equal(baseRefusal(legacyD2D, national), null, "a legacy set prices any operation");
  assert.match(baseRefusal(intraMex, { ...national, equipment: { ...dryVan, trailer: "Reefer" } }), /no cubre el remolque Reefer; permite Dry Van/);
  assert.match(baseRefusal(intraMex, { ...national, service: "Expedited" }), /no cubre el servicio Expedited/);
  // A reefer national lane: the Intra-México base refuses it, so the D2D default takes it.
  assert.equal(pickCostBase([legacyD2D, intraMex], { ...national, equipment: { ...dryVan, trailer: "Reefer" } }).id, "legacy");
  assert.equal(pickCostBase([intraMex], crossing), null, "no base covers it");
});
