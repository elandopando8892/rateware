// Does QuoteDesk's copy of the FCM engine (../quotedesk-api/fcm.mjs) still
// calculate like the FCM? QuoteDesk copies the FCM's values every hour, but not
// its formulas, so after each copy sync-fcm-bases checks:
// - the formula: the FCM files the copy mirrors, read from GitHub at the release
//   the FCM API reports live, still hash like the ones that were ported;
// - the values: the copied bases carry no parameter the copy doesn't know (a new
//   one means the FCM calculates with something the copy ignores);
// - the results: the FCM's latest saved calculations (Quote.explanation.snapshot:
//   input, output and engine version) come out the same through the copy, the
//   way the FCM's own verifyQuoteCalculationSnapshot replays them.
// A miss puts QuoteDesk's FCM estimates "en revisión" until the copy catches up.

import { calculate } from "../quotedesk-api/fcm.mjs";

export const FCM_HEALTH_URL = "https://freight-cost-api.vercel.app/health";
export const FCM_SOURCE_URL = "https://raw.githubusercontent.com/elandopando8892/freight-cost-api";
export const FORMULA_DIR = "apps/api/src/modules/engine";
// sha256 of the FCM files the copy mirrors, as ported (FCM bbf4716, byte for
// byte the same files as release 3414f95f). When the FCM changes one, run the
// golden scenarios (tests/fixtures/fcm-engine-golden.json) on the new release:
// refresh these if the copy still matches; port the change if it doesn't.
export const FORMULA_FILES = {
  "engine.calculator.ts": "20d57f910107fa2449aca488a8692e04ebee678c531336ea82a5a5d2c08d8ace",
  "engine.commercial.ts": "ea6fcfe774a7f8b6154daef9c23feb1291b827b631b2053e4ee93909a1e67c45",
  "engine.factors.ts": "80f639334b3a205ce358b9a69ababba3386463b260c774bb1a5745c9422325d9",
  "engine.mex.ts": "f66ff88ae2b2ce604d9ef9e3c24a74f66d808f2af8910cd44a097cd87bd1c615",
  "engine.outputs.ts": "b10bb0cc36a65a0888eb50cca709fdb2ea0ea1598fbd97bb8777355704ee6f32",
  "engine.usa.ts": "061f762cdc7e6ac1e6f83af6b291d22b105dcd2c8326b10a538b061e2c29b0c5"
};

/** FCM quote-snapshot.ts: the snapshot format and the engine versions the copy reproduces. */
export const SNAPSHOT_FORMAT = "fcm.calculation-snapshot.v1";
export const COPIED_ENGINE_VERSIONS = ["fcm-v3", "fcm-v3.1-profiled"];
/** The FCM's own SNAPSHOT_NUMERIC_TOLERANCE. */
export const TOLERANCE = 1e-9;
/** How many of the FCM's latest saved calculations each run replays. */
export const REPLAY_LIMIT = 20;

// Every parameter the copy knows: the ones fcm.mjs reads (with the 29 FACTORS__*
// the FCM also reads with defaults), the drayage ones QuoteDesk skips on purpose,
// and the catalog ones the FCM engine itself doesn't read (FCM bbf4716).
const KNOWN_PARAMS = {
  BORDER: ["Border Friction Time", "Border Transactional Cost", "Inspection Delay Reserve",
    "Yard Transfer Cost"],
  CONFIG: ["Chassis Day Cost USD", "Drayage Drop-Off Factor", "Drayage Final Reposition Factor",
    "Drayage Port Pickup Factor", "Tandem CFU Factor", "Tandem Fuel Penalty", "Tandem Maint/Tires Factor",
    "Tandem Second Unit Monthly USD", "Tandem Toll Premium"],
  COST_CAPITAL: ["Asset Finance Annual Rate", "LTV Asset Financing", "Periodo Depreciacion", "PU Dolly",
    "PU Remolque", "PU Rescue Remolque", "PU Rescue Tracto", "PU Tracto", "Qty Dolly", "Qty Remolque",
    "Qty Rescue Remolque", "Qty Rescue Tracto", "Qty Tracto"],
  COST_COMPANY: ["PU Agua", "PU Banking", "PU Capacitaciones", "PU Comb Otros", "PU Depr Equipos",
    "PU Depr Otros", "PU Gestorias", "PU Imprenta", "PU Internet", "PU Legal", "PU Luz", "PU Mant Otros",
    "PU Office Cleaning", "PU Office Equip", "PU Renta Patio", "PU Representacion", "PU Security",
    "PU Seguros Otros", "PU Software", "PU Subscriptions", "PU Telefonia Celular", "PU Telefonia Fija",
    "PU Utiles", "Qty Agua", "Qty Banking", "Qty Capacitaciones", "Qty Comb Otros", "Qty Depr Equipos",
    "Qty Depr Otros", "Qty Gestorias", "Qty Imprenta", "Qty Internet", "Qty Legal", "Qty Luz",
    "Qty Mant Otros", "Qty Office Cleaning", "Qty Office Equip", "Qty Renta Patio", "Qty Representacion",
    "Qty Security", "Qty Seguros Otros", "Qty Software", "Qty Subscriptions", "Qty Telefonia Celular",
    "Qty Telefonia Fija", "Qty Utiles"],
  COST_CROSSBORDER: ["Ajustes Regulatorios", "BOC-3", "Border Yard Minimum", "Capacitacion Operadores",
    "Costos Comunicacion", "CTPAT", "FMCSA", "GPS", "Mantenimientos", "Registro doble matricula",
    "Renta Oficinas Patios", "Safety Audit", "SCAC", "Seguros adicionales", "TMS"],
  COST_INSURANCE: ["Periodo de Poliza", "Poliza x Vehiculo", "Prima Anual por Vehiculo"],
  COST_MAINT: ["100k PU Aceite Caja Cambios", "100k PU Aceite Caja Transmision", "100k PU Aceite Hidraulico",
    "100k PU Filtros", "100k PU Filtros Aire", "100k Qty Aceite Caja Cambios",
    "100k Qty Aceite Caja Transmision", "100k Qty Aceite Hidraulico", "100k Qty Filtros",
    "100k Qty Filtros Aire", "10k PU Aceite de Motor", "10k PU Filtros de Aceite", "10k PU Filtros de Diesel",
    "10k PU Mano de Obra", "10k Qty Aceite de Motor", "10k Qty Filtros de Aceite", "10k Qty Filtros de Diesel",
    "10k Qty Mano de Obra", "250k PU Baterias", "250k PU Calibracion Inyectores", "250k PU Clutch",
    "250k PU Frenos", "250k Qty Baterias", "250k Qty Calibracion Inyectores", "250k Qty Clutch",
    "250k Qty Frenos", "Reserve Coolant", "Reserve DEF Urea", "Reserve DPF", "Reserve Lubricants",
    "Reserve PM Unscheduled"],
  COST_PAYROLL: ["PU Billing Admin", "PU Despachador", "PU Gerente Comercial", "PU Gerente Operaciones",
    "PU Jefe Trafico", "PU Safety Manager", "PU Tracking CS", "Qty Billing Admin", "Qty Despachador",
    "Qty Gerente Comercial", "Qty Gerente Operaciones", "Qty Jefe Trafico", "Qty Safety Manager",
    "Qty Tracking CS"],
  COST_TIRES: ["Life KM Direccion", "Life KM Recapeadas", "Life KM Remolque", "Life KM Traccion",
    "PU Direccion", "PU Recapeadas", "PU Remolque", "PU Traccion", "Qty Direccion", "Qty Recapeadas",
    "Qty Remolque", "Qty Traccion"],
  FACTORS: ["Driver B1", "Driver CDL", "Driver Interstate", "Driver Intrastate", "Driver Licencia E",
    "Lane Curvy & Danger", "Lane Mixed & Danger", "Lane Mixed Lane", "Lane Mostly Curvy",
    "Lane Mostly Straight", "Lane Straight & Danger", "Op D2D Export", "Op D2D Import", "Op Drayage",
    "Op Intra-Mex", "Op Local", "Op MX Northbound", "Op MX Southbound", "Svc Backhaul", "Svc Expedited",
    "Svc One Way", "Svc Roundtrip", "Trailer Chassis", "Trailer Dry Van", "Trailer Flatbed", "Trailer Hazmat",
    "Trailer Overdim", "Trailer Power Only", "Trailer Reefer"],
  FINANCE: ["Carrier Payment Days", "Cost of Capital MX", "Cost of Capital US", "Customer Collection Days",
    "Inflation Buffer", "Monthly COGS Proxy", "Tipo de Cambio"],
  FUEL: ["Diesel MX", "Diesel US Border", "Fuel Escalation Buffer", "Fuel Purchase Mix MX",
    "Fuel Purchase Mix US", "Rendimiento Cargado", "Rendimiento Vacío"],
  GENERAL_BASE: ["Gasto Adicional sobre Ruta", "Índice de Operatividad", "Kilómetros promedio x operador",
    "Operadores", "Periodo de Operación", "Tamaño de Flota"],
  LABOR: ["Carga Social", "Hazmat Driver Premium", "Sueldo Base Operador MX", "Tarifa Operador MX",
    "Tarifa Operador US", "Team Driver Premium", "Viáticos MX"],
  RISK: ["Config Risk Premium Tandem", "Expedited Premium", "Flatbed Complexity Factor", "Hazmat Premium",
    "MX Security Risk Reserve", "Tight Market Premium", "Weather Disruption Buffer"],
  TECHNICAL_MARGIN: ["Buy Market Weight", "Minimum Gross Margin", "Premium Gross Margin",
    "Rate Rounding MEX USD", "Rate Rounding USA USD", "Target Gross Margin", "UT Rate Backhaul",
    "UT Rate One Way", "UT Rate Roundtrip"],
  UTILIZATION: ["Backhaul Deadhead Factor", "Billable Day Floor Drayage", "Billable Day Floor Local",
    "Billable Day Floor Long-haul", "Billable Day Floor Short-haul", "Deadhead Base", "Delivery Service Hours",
    "Detention Rate", "Empty KM Min Local", "Empty KM Min Short-haul", "Free Time", "Load Time",
    "Min Trip Cost Local USD", "Min Trip Cost Short-haul USD", "Port Dwell Hours", "Roundtrip Empty Factor",
    "Tandem Maneuver Hours", "Trailer Utilization", "Truck Utilization Days", "Unload Time"]
};

export const KNOWN_PARAM_KEYS = new Set(
  Object.entries(KNOWN_PARAMS).flatMap(([section, fields]) => fields.map((field) => `${section}__${field}`))
);

/**
 * The live formula against the copy's. `hashes`: each formula file's sha256 at
 * `release`, or null where GitHub doesn't have it (none at all: the release
 * can't be read there; some: the FCM moved them). The hashes are kept so a
 * release already read is compared again with FORMULA_FILES as they are now.
 */
export function formulaCheck(release, hashes) {
  const files = Object.keys(FORMULA_FILES);
  if (files.every((file) => hashes[file] == null)) return { read: "not_published", release, changed: [], hashes };
  return { read: "ok", release, changed: files.filter((file) => hashes[file] !== FORMULA_FILES[file]), hashes };
}

/** Parameters of a copied base that the copy doesn't know. */
export function unknownParams(params) {
  return Object.keys(params || {}).filter((key) => !KNOWN_PARAM_KEYS.has(key)).sort();
}

const stable = (value) => Number(value.toFixed(9));

/** The output the FCM stores with a calculation (quote-snapshot.ts payloadFor), from an engine result. */
export function snapshotOutput(result) {
  return {
    freightBaselineUsd: stable(result.freightBaselineUsd),
    requiredTariffUsd: stable(result.requiredTariffUsd),
    fxRateUsed: stable(result.fxRateUsed),
    mexTariffUsd: result.mexLeg ? stable(result.mexLeg.requiredTariffUsd) : null,
    usaFlatUsd: result.usaLeg ? stable(result.usaLeg.flatUsd) : null,
    costFloorUsd: stable(result.commercial.costFloorUsd),
    recommendedSellUsd: stable(result.commercial.recommendedSellUsd)
  };
}

/**
 * One FCM calculation replayed through the copy: "same", "different" (with the
 * fields that differ), "new_engine" / "new_format" (the FCM moved on), or
 * "skipped" (drayage, which QuoteDesk doesn't price).
 */
export function replaySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || snapshot.format !== SNAPSHOT_FORMAT || !snapshot.input || !snapshot.output) {
    return { outcome: "new_format", format: String(snapshot?.format ?? "") };
  }
  if (!COPIED_ENGINE_VERSIONS.includes(snapshot.engineVersion)) {
    return { outcome: "new_engine", engine_version: String(snapshot.engineVersion ?? "") };
  }
  const input = { ...snapshot.input };
  if (input.drayageLeg || input.operation === "Drayage") return { outcome: "skipped" };
  // As the FCM's calculateForQuoteSnapshot: v3 evidence replays with the legacy semantics.
  delete input.compatibilityMode;
  if (snapshot.engineVersion === "fcm-v3" && (input.policy ?? "OPERATIONAL_V3") === "OPERATIONAL_V3") {
    input.compatibilityMode = "LEGACY_FCM_V3";
  }
  let actual;
  try {
    actual = snapshotOutput(calculate(input));
  } catch (error) {
    return { outcome: "different", error: String(error instanceof Error ? error.message : error).slice(0, 200) };
  }
  const differences = Object.entries(snapshot.output).flatMap(([field, fcm]) => {
    const copy = actual[field] ?? null;
    if (fcm === null || copy === null) return fcm === copy ? [] : [{ field, fcm, copy }];
    return Math.abs(Number(fcm) - copy) <= TOLERANCE ? [] : [{ field, fcm, copy }];
  });
  return differences.length ? { outcome: "different", differences } : { outcome: "same" };
}

const short = (release) => String(release || "").slice(0, 7);

/**
 * The check stored with each sync run. `bases`: the copied fcm_cost_bases rows;
 * `formula`: formulaCheck's result, or { read: "unavailable" } when the FCM or
 * GitHub didn't answer (a previous result carried over is marked `stale`);
 * `snapshots`: the FCM's latest saved calculations ({ id, created_at, snapshot })
 * and `snapshotsRead` how reading them went ("ok", "no_access" until the reader
 * is granted "Quote", or "error" with `snapshotsError`, the Postgres code).
 *
 * `status` and `reasons` are the engine's, the same for every workspace. A base
 * with parameters the copy doesn't know only concerns its workspace: those are
 * listed per owner in `unknown_params`, each with its own reason.
 * @param {{ bases: Record<string, any>[], formula: Record<string, any>, snapshots?: Record<string, any>[], snapshotsRead?: string, snapshotsError?: string | null, checkedAt: string }} input
 */
export function engineCheck({ bases, formula, snapshots = [], snapshotsRead = "ok", snapshotsError = null, checkedAt }) {
  const unknown = bases
    .filter((base) => base.usable)
    .map((base) => ({ owner_email: base.owner_email, base: base.name, keys: unknownParams(base.params) }))
    .filter((entry) => entry.keys.length)
    .map((entry) => {
      const shown = entry.keys.slice(0, 3).map((key) => key.replace("__", " · ")).join(", ");
      const more = entry.keys.length > 3 ? ` y ${entry.keys.length - 3} más` : "";
      return { ...entry, reason: `La base «${entry.base}» trae valores que QuoteDesk no sabe usar: ${shown}${more}.` };
    });
  const replays = snapshots.map((row) => ({ quote_id: row.id, created_at: row.created_at, ...replaySnapshot(row.snapshot) }));
  const count = (outcome) => replays.filter((replay) => replay.outcome === outcome).length;
  const replay = {
    read: snapshotsRead,
    ...(snapshotsError ? { error_code: snapshotsError } : {}),
    checked: replays.length,
    same: count("same"),
    different: count("different"),
    new_engine: count("new_engine"),
    new_format: count("new_format"),
    skipped: count("skipped"),
    findings: replays.filter((item) => item.outcome !== "same" && item.outcome !== "skipped").slice(0, 5)
  };

  const reasons = [];
  if (formula.read === "ok" && formula.changed.length) {
    const files = formula.changed.map((file) => file.replace(/^engine\.|\.ts$/g, "")).join(", ");
    reasons.push(`El FCM publicó cambios en su fórmula (versión ${short(formula.release)}: ${files}); QuoteDesk sigue con la anterior.`);
  }
  if (formula.read === "not_published") {
    reasons.push(`No se pudo leer en GitHub la fórmula de la versión publicada del FCM (${short(formula.release)}), así que no se puede comparar.`);
  }
  if (replay.new_engine) {
    const versions = [...new Set(replay.findings.filter((item) => item.outcome === "new_engine").map((item) => item.engine_version))];
    reasons.push(`El FCM ya calcula con otra versión de su fórmula (${versions.join(", ") || "sin nombre"}).`);
  }
  if (replay.new_format) reasons.push("El FCM guarda sus cálculos en un formato que QuoteDesk no conoce.");
  if (replay.different) {
    reasons.push(`${replay.different} de ${replay.checked} cálculos recientes del FCM no dan lo mismo con la fórmula de QuoteDesk.`);
  }

  const verified = (formula.read === "ok" && !formula.stale) || replay.same > 0;
  const status = reasons.length ? "review" : verified ? "ok" : "unverified";
  return { status, checked_at: checkedAt, reasons, formula, unknown_params: unknown, replay };
}
