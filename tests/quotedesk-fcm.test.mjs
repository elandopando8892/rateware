import assert from "node:assert/strict";
import test from "node:test";
import {
  baseRefusal,
  crossingCarriesBorder,
  customerService,
  equipmentCaveats,
  equipmentLabel,
  fcmEquipment,
  mexLaneUnits,
  readEquipment,
  fcmOperation,
  fcmService,
  pickCostBase,
  scopeForOperation
} from "../supabase/functions/quotedesk-api/fcm.mjs";

test("QuoteDesk operations, services and equipment map onto the FCM's", () => {
  assert.equal(fcmOperation("D2D Export", "MX", "US"), "D2D Export");
  assert.equal(fcmOperation("Cross-border", "US", "MX"), "D2D Import");
  assert.equal(fcmOperation("Domestic MX", "MX", "MX"), "Intra-Mex");
  assert.equal(fcmOperation("D2D Export", "MX", "MX"), "Intra-Mex", "the countries win over a mislabeled operation");
  assert.equal(fcmOperation("", "US", "US"), "Intra-US");
  assert.equal(fcmOperation("MX Southbound", "MX", "MX"), "MX Southbound");

  // The RFI template's names price as the FCM's own.
  assert.equal(fcmOperation("Intra-MX", "MX", "MX"), "Intra-Mex");
  assert.equal(fcmOperation("Local MX", "MX", "MX"), "Local");
  assert.equal(fcmOperation("Local US/CA", "US", "US"), "Intra-US", "a US local lane uses the US engine, not the FCM's Mexican Local");
  assert.equal(fcmOperation("Intra-US/CA", "US", "CA"), "Intra-US");
  assert.equal(fcmOperation("US/CA Northbound", "US", "US"), "US Northbound");
  assert.equal(fcmOperation("US/CA Southbound", "US", "US"), "US Southbound");
  assert.equal(fcmOperation("Local US/CA", "MX", "MX"), "Intra-Mex", "the countries win over a mislabeled template name");
  assert.equal(fcmOperation("Intra-MX", "MX", "US"), "D2D Export");
  assert.equal(fcmOperation("MX Drayage", "MX", "MX"), "Intra-Mex", "the FCM's Drayage is the US leg; a Mexican one goes by the countries");

  assert.equal(fcmService("", "D2D Import"), "Backhaul", "imports default to the carrier's backhaul");
  assert.equal(fcmService("", "D2D Export"), "One Way");
  assert.equal(fcmService("Expedited", "D2D Import"), "Expedited", "an expedited load is never a backhaul");
  assert.equal(fcmService("RT", "Intra-Mex"), "Roundtrip");
  assert.equal(fcmService("OW Import", "D2D Import"), "One Way");
  assert.equal(fcmService("Milkrun", "Intra-Mex"), "One Way", "the FCM prices a milk run's legs as one-way trips");
  assert.equal(fcmService("Dedicated", "Intra-Mex"), "One Way");

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
