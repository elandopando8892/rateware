// Freight Cost Model V3.0 engine, ported from freight-cost-model `master`
// (apps/api/src/modules/engine: engine.factors/outputs/mex/usa/commercial).
// Pure functions: the FCM "bases" (an assumption set's params, the MX lane
// table, US lanes and market conditions) are passed in; quotedesk-api copies
// them from the FCM database. tests/quotedesk-fcm.test.mjs replays the FCM's own
// engine outputs (tests/fixtures/fcm-engine-golden.json) against this port.
//
// QuoteDesk rules on top of the engine (user decisions, 2026-09-24):
// - The MX leg is shown all-in: diesel, casetas, driver, maintenance, fixed cost
//   and risk. Casetas come from the FCM lane table (the FCM screen leaves them out).
// - The US leg is RPM + fuel, the fuel at the weekly FSC with its diesel level.
// - The cruce is its own line and depends on the crossing model: interchange
//   (transfer, swap, drayage) carries it; blue plates (direct, B1) do not.
// - The carrier's price to us = cost floor / (1 - tier margin), with the tier
//   (minimum, target, premium) picked per lane; our markup goes on top.
// - The FX is the quote's Banxico FIX, not the base's fixed value.

const MI_PER_KM = 1 / 1.60934;
const KML_TO_MPG = 2.3521458;
const mround = (x, m) => Math.round(x / m) * m;
export const round2 = (n) => Math.round(n * 100) / 100;
export const round4 = (n) => Math.round(n * 10000) / 10000;

/** FCM ParamMap lookup: "SECTION__Field" → value, else the V3.0 default. */
export function getParam(map, section, field, fallback = 0) {
  return map?.[`${section}__${field}`] ?? fallback;
}

// ---------------------------------------------------------------- factors (engine.factors.ts)

export function laneFactor(route, params) {
  switch (route) {
    case "Mostly Straight": return getParam(params, "FACTORS", "Lane Mostly Straight", 1.0);
    case "Mixed Lane": return getParam(params, "FACTORS", "Lane Mixed Lane", 1.1);
    case "Mostly Curvy": return getParam(params, "FACTORS", "Lane Mostly Curvy", 1.2);
    case "Straight & Danger": return getParam(params, "FACTORS", "Lane Straight & Danger", 1.05);
    case "Mixed & Danger": return getParam(params, "FACTORS", "Lane Mixed & Danger", 1.2);
    case "Curvy & Danger": return getParam(params, "FACTORS", "Lane Curvy & Danger", 1.3);
    default: return getParam(params, "FACTORS", "Lane Mostly Straight", 1.0);
  }
}

export function operationFactor(operation, params) {
  switch (operation) {
    case "MX Northbound": return getParam(params, "FACTORS", "Op MX Northbound", 1.0);
    case "MX Southbound": return getParam(params, "FACTORS", "Op MX Southbound", 0.7);
    case "Intra-Mex": return getParam(params, "FACTORS", "Op Intra-Mex", 1.0);
    case "Local": return getParam(params, "FACTORS", "Op Local", 1.0);
    case "D2D Export": return getParam(params, "FACTORS", "Op D2D Export", 1.15);
    case "D2D Import": return getParam(params, "FACTORS", "Op D2D Import", 0.85);
    case "Drayage": return getParam(params, "FACTORS", "Op Drayage", 1.15);
    default: return 1.0;
  }
}

/** Southbound / import legs are the carrier's backhaul by default; the analyst can change it. */
export function defaultService(operation) {
  switch (operation) {
    case "D2D Import":
    case "MX Southbound":
    case "US Southbound":
      return "Backhaul";
    default:
      return "One Way";
  }
}

export function serviceFactor(service, params) {
  switch (service) {
    case "One Way": return getParam(params, "FACTORS", "Svc One Way", 1.0);
    case "Backhaul": return getParam(params, "FACTORS", "Svc Backhaul", 0.6);
    case "Roundtrip": return getParam(params, "FACTORS", "Svc Roundtrip", 1.6);
    case "Expedited": return getParam(params, "FACTORS", "Svc Expedited", 1.4);
    default: return 1.0;
  }
}

export function trailerFactor(trailer, params) {
  switch (trailer) {
    case "Dry Van": return getParam(params, "FACTORS", "Trailer Dry Van", 1.0);
    case "Flatbed": return getParam(params, "FACTORS", "Trailer Flatbed", 1.3);
    case "Overdim": return getParam(params, "FACTORS", "Trailer Overdim", 1.8);
    case "Hazmat": return getParam(params, "FACTORS", "Trailer Hazmat", 1.2);
    case "Reefer": return getParam(params, "FACTORS", "Trailer Reefer", 1.5);
    case "Chassis": return getParam(params, "FACTORS", "Trailer Chassis", 1.15);
    case "Power Only": return getParam(params, "FACTORS", "Trailer Power Only", 0.8);
    default: return 1.0;
  }
}

export function driverFactor(driver, params) {
  switch (driver) {
    case "Intrastate": return getParam(params, "FACTORS", "Driver Intrastate", 0.9);
    case "Interstate": return getParam(params, "FACTORS", "Driver Interstate", 1.0);
    case "B1": return getParam(params, "FACTORS", "Driver B1", 1.15);
    case "CDL": return getParam(params, "FACTORS", "Driver CDL", 1.0);
    case "Licencia E": return getParam(params, "FACTORS", "Driver Licencia E", 1.35);
    default: return 1.0;
  }
}

// Unlisted conditions (Neutral, Slightly Tight, blank) resolve to 0, as in the V3.0 sheet.
const REPOSITION = { "Very Tight": 0.03, "Moderately Tight": 0.05, Balanced: 0.1, "Slightly Loose": 0.15, "Very Loose": 0.25 };
export function repositionPct(condition) {
  return REPOSITION[String(condition ?? "").trim()] ?? 0;
}

const EQUIPMENT = {
  "Truck Trailer": { fuel: 1, fixed: 1, maint: 1, driver: 1 },
  Thorton: { fuel: 1.33, fixed: 0.72, maint: 0.8, driver: 0.85 },
  Rabon: { fuel: 1.75, fixed: 0.58, maint: 0.65, driver: 0.75 },
  "3.5 tons": { fuel: 2.85, fixed: 0.38, maint: 0.45, driver: 0.55 },
  "1.5 tons": { fuel: 3.5, fixed: 0.25, maint: 0.3, driver: 0.45 }
};
export function equipmentFactors(truckType) {
  return EQUIPMENT[truckType] ?? EQUIPMENT["Truck Trailer"];
}

// ---------------------------------------------------------------- derived costs (engine.outputs.ts)

const P = (m, section, field, d) => getParam(m, section, field, d);

export function deriveMaintTiresPerKm(m, options = {}) {
  const includeTrailerTires = options.includeTrailerTires ?? true;
  const pm10000 =
    P(m, "COST_MAINT", "10k Qty Aceite de Motor", 60) * P(m, "COST_MAINT", "10k PU Aceite de Motor", 5) +
    P(m, "COST_MAINT", "10k Qty Filtros de Aceite", 1) * P(m, "COST_MAINT", "10k PU Filtros de Aceite", 65) +
    P(m, "COST_MAINT", "10k Qty Filtros de Diesel", 2) * P(m, "COST_MAINT", "10k PU Filtros de Diesel", 40) +
    P(m, "COST_MAINT", "10k Qty Mano de Obra", 1) * P(m, "COST_MAINT", "10k PU Mano de Obra", 250);
  const pm100000 =
    P(m, "COST_MAINT", "100k Qty Aceite Caja Cambios", 19) * P(m, "COST_MAINT", "100k PU Aceite Caja Cambios", 8) +
    P(m, "COST_MAINT", "100k Qty Aceite Caja Transmision", 19) * P(m, "COST_MAINT", "100k PU Aceite Caja Transmision", 15) +
    P(m, "COST_MAINT", "100k Qty Filtros", 1) * P(m, "COST_MAINT", "100k PU Filtros", 60) +
    P(m, "COST_MAINT", "100k Qty Aceite Hidraulico", 19) * P(m, "COST_MAINT", "100k PU Aceite Hidraulico", 8) +
    P(m, "COST_MAINT", "100k Qty Filtros Aire", 2) * P(m, "COST_MAINT", "100k PU Filtros Aire", 95);
  const pm250000 =
    P(m, "COST_MAINT", "250k Qty Baterias", 4) * P(m, "COST_MAINT", "250k PU Baterias", 175) +
    P(m, "COST_MAINT", "250k Qty Calibracion Inyectores", 1) * P(m, "COST_MAINT", "250k PU Calibracion Inyectores", 1200) +
    P(m, "COST_MAINT", "250k Qty Clutch", 1) * P(m, "COST_MAINT", "250k PU Clutch", 2750) +
    P(m, "COST_MAINT", "250k Qty Frenos", 1) * P(m, "COST_MAINT", "250k PU Frenos", 1800);
  const scheduledPerKm = pm10000 / 10000 + pm100000 / 100000 + pm250000 / 250000;
  const reservePerKm =
    P(m, "COST_MAINT", "Reserve DEF Urea", 0.025) +
    P(m, "COST_MAINT", "Reserve Lubricants", 0.005) +
    P(m, "COST_MAINT", "Reserve Coolant", 120) / 100000 +
    P(m, "COST_MAINT", "Reserve DPF", 0.015) +
    P(m, "COST_MAINT", "Reserve PM Unscheduled", 0.03);
  // V3.0 maps the tire PUs one row off; replicated so totals match V3.0 exactly.
  const tractorTiresPerKm =
    (P(m, "COST_TIRES", "Qty Direccion", 2) * P(m, "COST_TIRES", "PU Direccion", 600)) / P(m, "COST_TIRES", "Life KM Direccion", 180000) +
    (P(m, "COST_TIRES", "Qty Traccion", 8) * P(m, "COST_TIRES", "PU Recapeadas", 225)) / P(m, "COST_TIRES", "Life KM Traccion", 220000) +
    (P(m, "COST_TIRES", "Qty Recapeadas", 8) * P(m, "COST_TIRES", "PU Remolque", 450)) / P(m, "COST_TIRES", "Life KM Recapeadas", 160000);
  const trailerTiresPerKm = includeTrailerTires
    ? (P(m, "COST_TIRES", "Qty Remolque", 8) * P(m, "COST_TIRES", "PU Traccion", 550)) / P(m, "COST_TIRES", "Life KM Remolque", 250000)
    : 0;
  return scheduledPerKm + reservePerKm + tractorTiresPerKm + trailerTiresPerKm;
}

export const deriveMaintTiresPerMile = (m, options = {}) => deriveMaintTiresPerKm(m, options) * 1.60934;

export function deriveMonthlyFixedCost(m, options = true) {
  const normalized = typeof options === "boolean"
    ? { includeCrossborderCosts: options, workingCapitalCountry: "MX", includeTrailerAssets: true, includeDollyAssets: true }
    : {
      includeCrossborderCosts: options.includeCrossborderCosts ?? true,
      workingCapitalCountry: options.workingCapitalCountry ?? "MX",
      includeTrailerAssets: options.includeTrailerAssets ?? true,
      includeDollyAssets: options.includeDollyAssets ?? true
    };
  const flota = P(m, "GENERAL_BASE", "Tamaño de Flota", 50);
  const cargaSocial = P(m, "LABOR", "Carga Social", 0.3);
  const insurance =
    (P(m, "COST_INSURANCE", "Prima Anual por Vehiculo", 1) * P(m, "COST_INSURANCE", "Poliza x Vehiculo", 12000) * flota) /
    P(m, "COST_INSURANCE", "Periodo de Poliza", 12);
  const payrollBase =
    P(m, "COST_PAYROLL", "Qty Despachador", 2) * P(m, "COST_PAYROLL", "PU Despachador", 2200) +
    P(m, "COST_PAYROLL", "Qty Jefe Trafico", 2) * P(m, "COST_PAYROLL", "PU Jefe Trafico", 2750) +
    P(m, "COST_PAYROLL", "Qty Gerente Operaciones", 1) * P(m, "COST_PAYROLL", "PU Gerente Operaciones", 5500) +
    P(m, "COST_PAYROLL", "Qty Gerente Comercial", 0.5) * P(m, "COST_PAYROLL", "PU Gerente Comercial", 4500) +
    P(m, "COST_PAYROLL", "Qty Safety Manager", 0.5) * P(m, "COST_PAYROLL", "PU Safety Manager", 4500) +
    P(m, "COST_PAYROLL", "Qty Tracking CS", 2) * P(m, "COST_PAYROLL", "PU Tracking CS", 1800) +
    P(m, "COST_PAYROLL", "Qty Billing Admin", 1) * P(m, "COST_PAYROLL", "PU Billing Admin", 2200);
  const payroll = payrollBase * (1 + cargaSocial);
  const company =
    P(m, "COST_COMPANY", "Qty Agua", 1) * P(m, "COST_COMPANY", "PU Agua", 250) +
    P(m, "COST_COMPANY", "Qty Luz", 1) * P(m, "COST_COMPANY", "PU Luz", 900) +
    P(m, "COST_COMPANY", "Qty Telefonia Fija", 1) * P(m, "COST_COMPANY", "PU Telefonia Fija", 50) +
    P(m, "COST_COMPANY", "Qty Telefonia Celular", 60) * P(m, "COST_COMPANY", "PU Telefonia Celular", 30) +
    P(m, "COST_COMPANY", "Qty Internet", 2) * P(m, "COST_COMPANY", "PU Internet", 250) +
    P(m, "COST_COMPANY", "Qty Renta Patio", 1) * P(m, "COST_COMPANY", "PU Renta Patio", 3000) +
    P(m, "COST_COMPANY", "Qty Software", 1) * P(m, "COST_COMPANY", "PU Software", 1250) +
    P(m, "COST_COMPANY", "Qty Capacitaciones", 1) * P(m, "COST_COMPANY", "PU Capacitaciones", 2000) +
    P(m, "COST_COMPANY", "Qty Representacion", 1) * P(m, "COST_COMPANY", "PU Representacion", 500) +
    P(m, "COST_COMPANY", "Qty Utiles", 1) * P(m, "COST_COMPANY", "PU Utiles", 150) +
    P(m, "COST_COMPANY", "Qty Imprenta", 1) * P(m, "COST_COMPANY", "PU Imprenta", 200) +
    P(m, "COST_COMPANY", "Qty Seguros Otros", 1) * P(m, "COST_COMPANY", "PU Seguros Otros", 400) +
    P(m, "COST_COMPANY", "Qty Mant Otros", 1) * P(m, "COST_COMPANY", "PU Mant Otros", 250) +
    P(m, "COST_COMPANY", "Qty Comb Otros", 1) * P(m, "COST_COMPANY", "PU Comb Otros", 500) +
    P(m, "COST_COMPANY", "Qty Depr Otros", 1) * P(m, "COST_COMPANY", "PU Depr Otros", 300) +
    P(m, "COST_COMPANY", "Qty Depr Equipos", 1) * P(m, "COST_COMPANY", "PU Depr Equipos", 250) +
    P(m, "COST_COMPANY", "Qty Gestorias", 1) * P(m, "COST_COMPANY", "PU Gestorias", 300) +
    P(m, "COST_COMPANY", "Qty Office Cleaning", 1) * P(m, "COST_COMPANY", "PU Office Cleaning", 300) +
    P(m, "COST_COMPANY", "Qty Security", 1) * P(m, "COST_COMPANY", "PU Security", 800) +
    P(m, "COST_COMPANY", "Qty Banking", 1) * P(m, "COST_COMPANY", "PU Banking", 250) +
    P(m, "COST_COMPANY", "Qty Legal", 1) * P(m, "COST_COMPANY", "PU Legal", 500) +
    P(m, "COST_COMPANY", "Qty Subscriptions", 1) * P(m, "COST_COMPANY", "PU Subscriptions", 750) +
    P(m, "COST_COMPANY", "Qty Office Equip", 1) * P(m, "COST_COMPANY", "PU Office Equip", 250);
  const assetValue =
    P(m, "COST_CAPITAL", "Qty Tracto", 1) * P(m, "COST_CAPITAL", "PU Tracto", 220000) +
    (normalized.includeTrailerAssets ? P(m, "COST_CAPITAL", "Qty Remolque", 1) * P(m, "COST_CAPITAL", "PU Remolque", 55000) : 0) +
    (normalized.includeDollyAssets ? P(m, "COST_CAPITAL", "Qty Dolly", 0) * P(m, "COST_CAPITAL", "PU Dolly", 25000) : 0);
  const residual =
    P(m, "COST_CAPITAL", "Qty Rescue Tracto", 1) * P(m, "COST_CAPITAL", "PU Rescue Tracto", 60000) +
    (normalized.includeTrailerAssets ? P(m, "COST_CAPITAL", "Qty Rescue Remolque", 1) * P(m, "COST_CAPITAL", "PU Rescue Remolque", 20000) : 0);
  const depPeriod = P(m, "COST_CAPITAL", "Periodo Depreciacion", 60);
  const fleetDepreciation = ((assetValue - residual) / depPeriod) * flota;
  const ltv = P(m, "COST_CAPITAL", "LTV Asset Financing", 0.7);
  const financeRate = P(m, "COST_CAPITAL", "Asset Finance Annual Rate", 0.1);
  const fleetAssetFinance = (assetValue * ltv * financeRate / 12) * flota;
  const capital = fleetDepreciation + fleetAssetFinance;
  const complianceTractor =
    (P(m, "COST_CROSSBORDER", "Registro doble matricula", 3500) + P(m, "COST_CROSSBORDER", "Seguros adicionales", 3000)) * flota;
  const complianceCompany =
    P(m, "COST_CROSSBORDER", "CTPAT", 5000) + P(m, "COST_CROSSBORDER", "FMCSA", 1500) +
    P(m, "COST_CROSSBORDER", "Ajustes Regulatorios", 5000) + P(m, "COST_CROSSBORDER", "SCAC", 1000) +
    P(m, "COST_CROSSBORDER", "BOC-3", 500) + P(m, "COST_CROSSBORDER", "Safety Audit", 2500);
  const monthlyCompliance = (complianceTractor + complianceCompany) / 12;
  const monthlyInfra =
    P(m, "COST_CROSSBORDER", "Renta Oficinas Patios", 2500) + P(m, "COST_CROSSBORDER", "Costos Comunicacion", 700) +
    P(m, "COST_CROSSBORDER", "GPS", 1500) + P(m, "COST_CROSSBORDER", "Capacitacion Operadores", 1000) +
    P(m, "COST_CROSSBORDER", "Mantenimientos", 750) + P(m, "COST_CROSSBORDER", "TMS", 2500) +
    P(m, "COST_CROSSBORDER", "Border Yard Minimum", 1000);
  const crossborderFixed = normalized.includeCrossborderCosts ? monthlyCompliance + monthlyInfra : 0;
  const gapDays = Math.max(P(m, "FINANCE", "Customer Collection Days", 30) - P(m, "FINANCE", "Carrier Payment Days", 14), 0);
  const monthlyCogsProxy = P(m, "FINANCE", "Monthly COGS Proxy", 239577);
  const wcRate = normalized.workingCapitalCountry === "US"
    ? P(m, "FINANCE", "Cost of Capital US", 0.10)
    : P(m, "FINANCE", "Cost of Capital MX", 0.14);
  const workingCapital = (monthlyCogsProxy * gapDays / 30) * wcRate / 12;
  return insurance + payroll + company + capital + crossborderFixed + workingCapital;
}

// ---------------------------------------------------------------- MX leg (engine.mex.ts)

export function calculateMexLeg(lane, params, policy = "OPERATIONAL_V3", legacyOperational = false) {
  const { equipment } = lane;
  const workbookExact = policy === "WORKBOOK_V3";
  const isD2D = lane.operation === "D2D Export" || lane.operation === "D2D Import";
  const isRoundtrip = lane.service === "Roundtrip";
  const isBackhaul = lane.service === "Backhaul";
  const isTandem = equipment.config === "Tandem";
  const includesOwnedTrailer = equipment.trailer !== "Power Only" && equipment.trailer !== "Chassis";

  const deadheadBase = getParam(params, "UTILIZATION", "Deadhead Base", 0.15);
  const backhaulDeadheadFactor = getParam(params, "UTILIZATION", "Backhaul Deadhead Factor", 0.5);
  const loadTime = getParam(params, "UTILIZATION", "Load Time", 2);
  const unloadTime = getParam(params, "UTILIZATION", "Unload Time", 2);
  const rendCargado = getParam(params, "FUEL", "Rendimiento Cargado", 2.8);
  const rendVacio = getParam(params, "FUEL", "Rendimiento Vacío", 3.2);
  const dieselMx = getParam(params, "FUEL", "Diesel MX", 28);
  const dieselUs = getParam(params, "FUEL", "Diesel US Border", 1.49);
  const mixMx = getParam(params, "FUEL", "Fuel Purchase Mix MX", 0.3);
  const mixUs = getParam(params, "FUEL", "Fuel Purchase Mix US", 0.7);
  const fuelEscalation = getParam(params, "FUEL", "Fuel Escalation Buffer", 0.05);
  const tc = getParam(params, "FINANCE", "Tipo de Cambio", 17.5);
  const tarifaMx = getParam(params, "LABOR", "Tarifa Operador MX", 0.18);
  const gastoAdicional = getParam(params, "GENERAL_BASE", "Gasto Adicional sobre Ruta", 0.05);
  const legacyAssetSemantics = workbookExact || legacyOperational;
  const maintTiresPerKm = legacyAssetSemantics
    ? deriveMaintTiresPerKm(params)
    : deriveMaintTiresPerKm(params, { includeTrailerTires: includesOwnedTrailer });
  const borderTransactional = getParam(params, "BORDER", "Border Transactional Cost", 200);
  const monthlyFixedCost = legacyAssetSemantics
    ? deriveMonthlyFixedCost(params, true)
    : deriveMonthlyFixedCost(params, {
      includeCrossborderCosts: isD2D,
      workingCapitalCountry: "MX",
      includeTrailerAssets: includesOwnedTrailer,
      includeDollyAssets: isTandem
    });
  const operadores = getParam(params, "GENERAL_BASE", "Operadores", 52);
  const kmPerOperator = getParam(params, "GENERAL_BASE", "Kilómetros promedio x operador", 22000);
  const flota = getParam(params, "GENERAL_BASE", "Tamaño de Flota", 50);
  const operatividad = getParam(params, "GENERAL_BASE", "Índice de Operatividad", 0.9);
  const periodo = getParam(params, "GENERAL_BASE", "Periodo de Operación", 26);
  const tandemFuelPenalty = getParam(params, "CONFIG", "Tandem Fuel Penalty", 0.12);
  const tandemTollPremium = getParam(params, "CONFIG", "Tandem Toll Premium", 0.3);
  const tandemMaintFactor = getParam(params, "CONFIG", "Tandem Maint/Tires Factor", 1.35);
  const tandemSecondUnitMonthly = getParam(params, "CONFIG", "Tandem Second Unit Monthly USD", 1800);
  const tandemManeuverHours = getParam(params, "UTILIZATION", "Tandem Maneuver Hours", 1.0);
  const flatbedComplexity = getParam(params, "RISK", "Flatbed Complexity Factor", 0.25);
  const mxSecurityRisk = getParam(params, "RISK", "MX Security Risk Reserve", 0.025);
  const configRiskTandem = getParam(params, "RISK", "Config Risk Premium Tandem", 0.1);
  const isLocal = lane.baseKm <= 100;
  const isShortHaul = !isLocal && lane.baseKm <= 300;
  const billableDayFloor = workbookExact ? 0.33 : isLocal
    ? getParam(params, "UTILIZATION", "Billable Day Floor Local", 1.0)
    : isShortHaul
      ? getParam(params, "UTILIZATION", "Billable Day Floor Short-haul", 0.5)
      : getParam(params, "UTILIZATION", "Billable Day Floor Long-haul", 0.33);
  const emptyKmFloor = workbookExact ? 0 : isLocal
    ? getParam(params, "UTILIZATION", "Empty KM Min Local", 20)
    : isShortHaul
      ? getParam(params, "UTILIZATION", "Empty KM Min Short-haul", 40)
      : 0;
  const minTripCostFloor = workbookExact ? 0 : isLocal
    ? getParam(params, "UTILIZATION", "Min Trip Cost Local USD", 200)
    : isShortHaul
      ? getParam(params, "UTILIZATION", "Min Trip Cost Short-haul USD", 150)
      : 0;

  const eq = equipmentFactors(equipment.truckType);

  const roundtripEmptyFactor = workbookExact ? 0.03 : getParam(params, "UTILIZATION", "Roundtrip Empty Factor", 0.03);
  const emptyPct = isRoundtrip
    ? roundtripEmptyFactor
    : isBackhaul
      ? workbookExact ? 0 : deadheadBase * backhaulDeadheadFactor
      : deadheadBase;
  const rtKm = isRoundtrip ? (workbookExact ? lane.baseKm : lane.returnKm ?? lane.baseKm) : 0;
  const returnLoaded = isRoundtrip ? (workbookExact ? true : lane.returnLoaded ?? true) : false;
  const loadedReturnKm = returnLoaded ? rtKm : 0;
  const deadheadReturnKm = returnLoaded ? 0 : rtKm;
  const loadedKm = lane.baseKm + loadedReturnKm;
  const emptyKmComputed = workbookExact
    ? lane.baseKm * emptyPct
    : lane.baseKm * emptyPct + loadedReturnKm * emptyPct + deadheadReturnKm;
  const emptyKm = Math.max(emptyKmComputed, emptyKmFloor);
  const totalKm = loadedKm + emptyKm;
  const loadedMiles = loadedKm * MI_PER_KM;
  const emptyMiles = emptyKm * MI_PER_KM;
  const totalMiles = loadedMiles + emptyMiles;

  const baseHours = lane.baseHours ?? 0;
  const returnBaseHours = !workbookExact && isRoundtrip ? (lane.returnBaseHours ?? baseHours) : 0;
  const loadUnloadCycles = !workbookExact && isRoundtrip && returnLoaded ? 2 : 1;
  const maneuverHours = !workbookExact && isTandem ? tandemManeuverHours : 0;
  const cycleHours = baseHours + returnBaseHours + (loadTime + unloadTime) * loadUnloadCycles + maneuverHours;
  const cycleDays = Math.max(cycleHours / 24, billableDayFloor);

  const utMargin = isBackhaul
    ? getParam(params, "TECHNICAL_MARGIN", "UT Rate Backhaul", 0.1)
    : isRoundtrip
      ? getParam(params, "TECHNICAL_MARGIN", "UT Rate Roundtrip", 0.2)
      : getParam(params, "TECHNICAL_MARGIN", "UT Rate One Way", 0.3);
  const borderUsd = isD2D ? borderTransactional : 0;

  const adjLoadedKmL = rendCargado * eq.fuel * (1 - (isTandem ? tandemFuelPenalty : 0));
  const adjEmptyKmL = rendVacio * eq.fuel * (1 - (isTandem ? tandemFuelPenalty : 0));
  const blendedDieselUsdL = workbookExact || legacyOperational || isD2D
    ? (dieselMx / tc) * mixMx + dieselUs * mixUs
    : dieselMx / tc;
  const fuelUsd = (loadedKm / adjLoadedKmL + emptyKm / adjEmptyKmL) * blendedDieselUsdL * (1 + fuelEscalation);
  const outboundTollsMxn = lane.routeExpensesMxn ?? 0;
  const returnTollsMxn = !workbookExact && isRoundtrip ? (lane.returnRouteExpensesMxn ?? outboundTollsMxn) : 0;
  const routeExpensesUsd = ((outboundTollsMxn + returnTollsMxn) / tc) * (1 + (isTandem ? tandemTollPremium : 0));
  const routeBufferUsd = routeExpensesUsd * gastoAdicional;
  const maintTiresUsd = totalKm * maintTiresPerKm * eq.maint * (isTandem ? tandemMaintFactor : 1);
  const driverUsd = totalMiles * tarifaMx * driverFactor(equipment.driver, params) * eq.driver;
  const cvuUsd = fuelUsd + routeExpensesUsd + routeBufferUsd + maintTiresUsd + driverUsd + borderUsd;

  const monthlyFleetKm = operadores * kmPerOperator;
  const productiveTruckDays = flota * operatividad * periodo;
  const tandemPerKm = !workbookExact && isTandem ? tandemSecondUnitMonthly / kmPerOperator : 0;
  const tandemPerDay = !workbookExact && isTandem ? tandemSecondUnitMonthly / periodo : 0;
  const fixedCostPerKm = monthlyFixedCost / monthlyFleetKm + tandemPerKm;
  const fixedCostPerDay = monthlyFixedCost / productiveTruckDays + tandemPerDay;
  const workbookTandemCfu = workbookExact && isTandem ? getParam(params, "CONFIG", "Tandem CFU Factor", 1.2) : 1;
  const cfuByDistanceUsd = totalKm * fixedCostPerKm * eq.fixed * workbookTandemCfu;
  const cfuByTimeUsd = cycleDays * fixedCostPerDay * eq.fixed * workbookTandemCfu;
  const cfuUsd = Math.max(cfuByDistanceUsd, cfuByTimeUsd);

  const productionCostUsd = Math.max(cvuUsd + cfuUsd, minTripCostFloor);
  const technicalTariffUsd = productionCostUsd / (1 - utMargin);
  const technicalUtilityUsd = technicalTariffUsd - productionCostUsd;

  const routeFactor = laneFactor(lane.route, params);
  const routeRiskUsd = (routeFactor - 1) * (fuelUsd + routeExpensesUsd + maintTiresUsd);
  const trailerFac = trailerFactor(equipment.trailer, params);
  const trailerRiskUsd = (trailerFac - 1) * productionCostUsd;
  const flatbedComplexityUsd = equipment.trailer === "Flatbed" ? productionCostUsd * flatbedComplexity : 0;
  const securityRiskUsd = productionCostUsd * mxSecurityRisk;
  const tandemRiskUsd = isTandem ? productionCostUsd * configRiskTandem : 0;
  const operationFac = operationFactor(lane.operation, params);
  const operationRiskUsd = (operationFac - 1) * productionCostUsd;
  const totalRiskAdjUsd = routeRiskUsd + trailerRiskUsd + flatbedComplexityUsd + securityRiskUsd + tandemRiskUsd + operationRiskUsd;

  const rateRounding = workbookExact ? 100 : getParam(params, "TECHNICAL_MARGIN", "Rate Rounding MEX USD", 100);
  const requiredTariffUsd = mround(technicalTariffUsd + totalRiskAdjUsd, rateRounding);
  const operatingProfitUsd = requiredTariffUsd - productionCostUsd;
  const operatingMargin = requiredTariffUsd > 0 ? operatingProfitUsd / requiredTariffUsd : 0;
  const rpm = totalMiles > 0 ? (requiredTariffUsd - fuelUsd) / totalMiles : 0;
  const fsc = totalMiles > 0 ? fuelUsd / totalMiles : 0;

  return {
    loadedKm, emptyKm, totalKm, loadedMiles, emptyMiles, totalMiles, cycleDays,
    blendedDieselUsdL, fuelUsd, routeExpensesUsd, routeBufferUsd, maintTiresUsd, driverUsd, borderUsd,
    cvuUsd,
    fixedCostPerKm, fixedCostPerDay, cfuByDistanceUsd, cfuByTimeUsd, cfuUsd,
    productionCostUsd, utMargin, technicalUtilityUsd, technicalTariffUsd,
    routeFactor, routeRiskUsd, trailerFactor: trailerFac, trailerRiskUsd, flatbedComplexityUsd,
    securityRiskUsd, tandemRiskUsd, operationFactor: operationFac, operationRiskUsd, totalRiskAdjUsd,
    requiredTariffUsd, operatingProfitUsd, operatingMargin, rpm, fsc
  };
}

// ---------------------------------------------------------------- US leg (engine.usa.ts)

export function calculateUsaLeg(lane, params, policy = "WORKBOOK_V3", legacyOperational = false) {
  const { equipment } = lane;
  const workbookExact = policy === "WORKBOOK_V3";
  const isD2D = lane.operation === "D2D Export" || lane.operation === "D2D Import";
  const isRoundtrip = lane.service === "Roundtrip";
  const isBackhaul = lane.service === "Backhaul";
  const includesOwnedTrailer = equipment.trailer !== "Chassis" && equipment.trailer !== "Power Only";

  const rendCargado = getParam(params, "FUEL", "Rendimiento Cargado", 2.8);
  const rendVacio = getParam(params, "FUEL", "Rendimiento Vacío", 3.2);
  const tarifaUs = getParam(params, "LABOR", "Tarifa Operador US", 0.6);
  const deadheadBase = getParam(params, "UTILIZATION", "Deadhead Base", 0.15);
  const loadTime = getParam(params, "UTILIZATION", "Load Time", 2);
  const unloadTime = getParam(params, "UTILIZATION", "Unload Time", 2);
  const legacyAssetSemantics = workbookExact || legacyOperational;
  const maintTiresPerMile = legacyAssetSemantics
    ? deriveMaintTiresPerMile(params)
    : deriveMaintTiresPerMile(params, { includeTrailerTires: includesOwnedTrailer });
  const monthlyFixedCost = legacyAssetSemantics
    ? deriveMonthlyFixedCost(params, true)
    : deriveMonthlyFixedCost(params, {
      includeCrossborderCosts: isD2D,
      workingCapitalCountry: "US",
      includeTrailerAssets: includesOwnedTrailer,
      includeDollyAssets: false
    });
  const flota = getParam(params, "GENERAL_BASE", "Tamaño de Flota", 50);
  const periodo = getParam(params, "GENERAL_BASE", "Periodo de Operación", 26);
  const kmPerOperator = getParam(params, "GENERAL_BASE", "Kilómetros promedio x operador", 22000);

  const eq = equipmentFactors(equipment.truckType);
  const loaded = lane.loadedMiles;

  const fixedPerDay = monthlyFixedCost / (periodo * flota);
  const fixedPerMile = fixedPerDay / kmPerOperator * 1.60934;

  const loadedMpg = rendCargado * KML_TO_MPG * eq.fuel;
  const emptyMpg = rendVacio * KML_TO_MPG * eq.fuel;

  const originReposPct = repositionPct(lane.originCondition);
  const destReposPct = repositionPct(lane.destCondition);
  const marketBased = originReposPct > 0 || destReposPct > 0;
  const originEmptyMiles = isRoundtrip || isBackhaul ? 0 : loaded * originReposPct;
  const destReposMiles = isRoundtrip || isBackhaul ? 0 : loaded * destReposPct;
  const deadheadFallbackPct = marketBased ? 0 : isBackhaul ? 0 : deadheadBase;
  const totalEmptyMiles = marketBased ? originEmptyMiles + destReposMiles : deadheadFallbackPct * loaded;
  const totalOperationalMiles = loaded + totalEmptyMiles;

  const fuelGallons = (loadedMpg > 0 ? loaded / loadedMpg : 0) + (emptyMpg > 0 ? totalEmptyMiles / emptyMpg : 0);
  const fuelCostUsd = fuelGallons * lane.dieselUsdGal;
  const driverCostUsd = totalOperationalMiles * tarifaUs * driverFactor(equipment.driver, params) * eq.driver + (lane.driverExpenses ?? 0);
  const maintTiresUsd = totalOperationalMiles * maintTiresPerMile * eq.maint;
  const cvuExFuelUsd = driverCostUsd + maintTiresUsd;
  const cvuInclFuelUsd = cvuExFuelUsd + fuelCostUsd;

  const transitDaysRaw = lane.transitDaysRaw ?? 0;
  const cycleDays = (loaded > 0 ? transitDaysRaw * (totalOperationalMiles / loaded) : transitDaysRaw) + (loadTime + unloadTime) / 24;
  const cfuByDistanceUsd = totalOperationalMiles * fixedPerMile * eq.fixed;
  const cfuByTimeUsd = cycleDays * fixedPerDay * eq.fixed;
  const cfuUsd = isBackhaul ? 0 : Math.max(cfuByDistanceUsd, cfuByTimeUsd);

  const utRate = isBackhaul
    ? getParam(params, "TECHNICAL_MARGIN", "UT Rate Backhaul", 0.1)
    : isRoundtrip
      ? getParam(params, "TECHNICAL_MARGIN", "UT Rate Roundtrip", 0.2)
      : getParam(params, "TECHNICAL_MARGIN", "UT Rate One Way", 0.3);
  const technicalTariffExFuelUsd = (cvuExFuelUsd + cfuUsd) / (1 - utRate);
  const technicalTariffInclFuelUsd = (cvuInclFuelUsd + cfuUsd) / (1 - utRate);

  const trailerFac = trailerFactor(equipment.trailer, params);
  const trailerRiskUsd = Math.max(trailerFac - 1, 0) * (cvuInclFuelUsd + cfuUsd);
  const opFactor = operationFactor(workbookExact || legacyOperational ? lane.service : lane.operation, params);
  const operationRiskUsd = Math.max(opFactor - 1, 0) * (cvuInclFuelUsd + cfuUsd);
  const svcFactor = serviceFactor(workbookExact || legacyOperational ? lane.operation : lane.service, params);
  const serviceRiskUsd = lane.service === "Expedited" ? Math.max(svcFactor - 1, 0) * (cvuInclFuelUsd + cfuUsd) : 0;
  const totalRiskAdjUsd = trailerRiskUsd + operationRiskUsd + serviceRiskUsd;

  const requiredTariffExFuelUsd = technicalTariffExFuelUsd + totalRiskAdjUsd;
  const rateRounding = getParam(params, "TECHNICAL_MARGIN", "Rate Rounding USA USD", 50);
  const requiredTariffUsd = mround(technicalTariffInclFuelUsd + totalRiskAdjUsd, rateRounding);
  const rpm = loaded > 0 ? requiredTariffExFuelUsd / loaded : 0;
  const fsc = lane.fscUsdMile;
  const flatUsd = loaded * (rpm + fsc);
  const marketRpm = lane.marketRpm ?? 0;
  const marketRateUsd = marketRpm > 0 ? loaded * (marketRpm + fsc) : 0;

  return {
    loadedMiles: loaded, emptyMiles: totalEmptyMiles, totalOperationalMiles,
    loadedMpg, emptyMpg, fuelGallons, fuelCostUsd, driverCostUsd, maintTiresUsd,
    cvuExFuelUsd, cvuInclFuelUsd, cycleDays,
    cfuByDistanceUsd, cfuByTimeUsd, cfuUsd,
    utRate, technicalTariffExFuelUsd, technicalTariffInclFuelUsd,
    trailerFactor: trailerFac, trailerRiskUsd, operationRiskUsd, serviceRiskUsd, totalRiskAdjUsd,
    requiredTariffExFuelUsd, requiredTariffUsd, rpm, fsc, flatUsd,
    marketRpm, marketRateUsd
  };
}

// ---------------------------------------------------------------- orchestrator + commercial (engine.calculator/commercial.ts)

export function legsFor(operation) {
  switch (operation) {
    case "D2D Export":
    case "D2D Import":
      return { mex: true, usa: true };
    case "Drayage":
    case "Intra-US":
    case "US Northbound":
    case "US Southbound":
      return { mex: false, usa: true };
    default:
      return { mex: true, usa: false };
  }
}

export function calculateCommercial(input) {
  const { params } = input;
  const minMargin = getParam(params, "TECHNICAL_MARGIN", "Minimum Gross Margin", 0.12);
  const targetMargin = getParam(params, "TECHNICAL_MARGIN", "Target Gross Margin", 0.18);
  const premiumMargin = getParam(params, "TECHNICAL_MARGIN", "Premium Gross Margin", 0.25);
  const costFloorUsd = round2(input.productionCostUsd + input.riskAdjUsd);
  const sellAt = (margin) => round2(costFloorUsd / (1 - margin));
  const minSellUsd = sellAt(minMargin);
  const targetSellUsd = sellAt(targetMargin);
  const premiumSellUsd = sellAt(premiumMargin);
  const recommendedSellUsd = round2(input.recommendedSellUsd);
  const grossProfitUsd = round2(recommendedSellUsd - costFloorUsd);
  const grossMarginPct = recommendedSellUsd > 0 ? round4(grossProfitUsd / recommendedSellUsd) : 0;
  const gpPerLoadedMileUsd = input.loadedMiles > 0 ? round2(grossProfitUsd / input.loadedMiles) : 0;
  const gpPerDayUsd = input.cycleDays > 0 ? round2(grossProfitUsd / input.cycleDays) : 0;
  const marketReferenceUsd = round2(input.marketReferenceUsd);
  const marketVsCostSpreadUsd = marketReferenceUsd > 0 ? round2(marketReferenceUsd - costFloorUsd) : 0;
  const marketVsCostSpreadPct = marketReferenceUsd > 0 && costFloorUsd > 0 ? round4(marketVsCostSpreadUsd / costFloorUsd) : 0;
  const notes = [];
  const noGoFlag = recommendedSellUsd < costFloorUsd;
  if (noGoFlag) notes.push("NO-GO: sell below cost floor");
  let reviewFlag = false;
  if (recommendedSellUsd < minSellUsd) { reviewFlag = true; notes.push("REVIEW: below minimum-margin sell"); }
  if (marketReferenceUsd > 0 && recommendedSellUsd > marketReferenceUsd * 1.15) {
    reviewFlag = true; notes.push("REVIEW: 15%+ above market reference");
  }
  if (!input.fuelMixOk) { reviewFlag = true; notes.push("REVIEW: fuel purchase mix MX+US ≠ 1.00"); }
  return {
    costFloorUsd, minSellUsd, targetSellUsd, premiumSellUsd, recommendedSellUsd,
    grossProfitUsd, grossMarginPct, gpPerLoadedMileUsd, gpPerDayUsd,
    marketReferenceUsd, marketVsCostSpreadUsd, marketVsCostSpreadPct,
    noGoFlag, reviewFlag, notes
  };
}

// ---------------------------------------------------------------- QuoteDesk mapping

export const TIERS = {
  minimum: { field: "Minimum Gross Margin", fallback: 0.12, label: "Mínimo" },
  target: { field: "Target Gross Margin", fallback: 0.18, label: "Objetivo" },
  premium: { field: "Premium Gross Margin", fallback: 0.25, label: "Premium" }
};

export function tierMargins(params) {
  return Object.fromEntries(Object.entries(TIERS).map(([key, tier]) => [key, getParam(params, "TECHNICAL_MARGIN", tier.field, tier.fallback)]));
}

const FCM_OPERATIONS = new Set(["D2D Export", "D2D Import", "Intra-Mex", "Local", "MX Northbound", "MX Southbound", "Intra-US", "US Northbound", "US Southbound"]);

/** QuoteDesk's operation (rateware catalog) as an FCM operation; the countries decide when it is ambiguous. */
export function fcmOperation(operation, originCountry, destinationCountry) {
  const value = String(operation || "").trim();
  const from = String(originCountry || "").toUpperCase();
  const to = String(destinationCountry || "").toUpperCase();
  const mx = (country) => country === "MX";
  const byCountries = mx(from) && !mx(to) ? "D2D Export"
    : !mx(from) && mx(to) ? "D2D Import"
      : mx(from) && mx(to) ? "Intra-Mex"
        : "Intra-US";
  if (value === "Domestic MX") return mx(from) && mx(to) ? "Intra-Mex" : byCountries;
  if (value === "Domestic US") return !mx(from) && !mx(to) ? "Intra-US" : byCountries;
  if (!FCM_OPERATIONS.has(value)) return byCountries; // Cross-border, Drayage or blank
  // A cross-border operation needs one leg in each country, and a domestic one none.
  const crossBorder = value === "D2D Export" || value === "D2D Import";
  if (crossBorder !== (mx(from) !== mx(to))) return byCountries;
  return value;
}

/** The carrier's trip type. Expedited is never a backhaul; blank takes the FCM default. */
export function fcmService(service, operation) {
  const value = String(service || "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (!value) return defaultService(operation);
  if (value === "backhaul") return "Backhaul";
  if (["round trip", "roundtrip", "rt"].includes(value)) return "Roundtrip";
  if (["expedited", "expeditado", "urgente"].includes(value)) return "Expedited";
  return "One Way"; // One Way, OW Export/Import, Truckload
}

/** What the shipper sees: a backhaul is our cost assumption, not the service sold. */
export function customerService(service) {
  const value = String(service || "").trim();
  return /^backhaul$/i.test(value) ? "One Way" : value;
}

const TRUCK_TYPES = new Set(["Truck Trailer", "Thorton", "Rabon", "3.5 tons", "1.5 tons"]);
const TRAILERS = new Set(["Dry Van", "Flatbed", "Reefer", "Hazmat", "Chassis", "Power Only", "Overdim"]);

export const TRUCK_LABEL = { "Truck Trailer": "Tractocamión", Thorton: "Torton", Rabon: "Rabón", "3.5 tons": "Camioneta 3.5 t", "1.5 tons": "Camioneta 1.5 t" };
export const TRAILER_LABEL = { "Dry Van": "Caja seca", Reefer: "Refrigerado", Flatbed: "Plataforma", Hazmat: "Hazmat", Overdim: "Sobredimensionado", Chassis: "Chasis", "Power Only": "Sólo tracto" };
export const CONFIG_LABEL = { Single: "Sencillo", Tandem: "Full" };

// What people type in the Bid Room and QuoteDesk ("Reefer 53'", "Plataforma 48'",
// "Rabón", "Camioneta 3.5", "Sprinter") read as the FCM's equipment. First match wins.
const TRUCK_WORDS = [
  ["1.5 tons", /\b1[.,]5\s*(?:t\b|ton)|cargo\s*van|sprinter|^\s*van\s*$|camioneta(?!\s*(?:de\s*)?3[.,]5)/i],
  ["3.5 tons", /\b3[.,]5\s*(?:t\b|ton)|box\s*truck|camioneta\s*(?:de\s*)?3[.,]5/i],
  ["Rabon", /rab[oó]n|straight\s*truck|\b(?:8|10)\s*(?:t\b|ton)/i],
  ["Thorton", /th?orton|\b(?:12|14|15|16|18)\s*(?:t\b|ton)/i],
  ["Truck Trailer", /truck\s*trailer|tract(?:o|or)|trailer|t3-?s[23]|\bfull\b|\bdv\s*53\b|\b(?:53|48)\s*(?:'|ft\b|pies\b)?/i]
];
// Highest FCM risk factor first, so "Reefer Hazmat" prices as Reefer.
const TRAILER_WORDS = [
  ["Overdim", /overdim|sobre\s*-?\s*dimension|lowboy|cama\s*baja|oversize/i],
  ["Reefer", /reefer|refriger|\bthermo|\btermo|frigor|temperatura\s*controlada/i],
  ["Flatbed", /flat\s*-?\s*bed|plataforma/i],
  ["Hazmat", /hazmat|haz\s*mat|peligros|hazardous/i],
  ["Chassis", /chass?is/i],
  ["Power Only", /power\s*only|s[oó]lo\s*tracto/i],
  ["Dry Van", /dry\s*van|caja\s*seca|\bseca\b|\bdv\b|\bdv\s*53\b|\bbox\b/i]
];
const TANDEM_WORDS = /tandem|\bfull\b|doble|double|t3-?s2-?r4/i;

const firstMatch = (words, value) => (words.find(([, pattern]) => pattern.test(value)) || [null])[0];

/** The FCM equipment for free-text lane fields, plus notes on anything guessed or unknown. */
export function readEquipment({ equipment, trailer, config } = {}) {
  const truckText = String(equipment || "").trim();
  const boxText = String(trailer || "").trim();
  const configText = String(config || "").trim();
  const allText = [truckText, boxText, configText].filter(Boolean).join(" ");
  const notes = [];
  const truckType = TRUCK_TYPES.has(truckText) ? truckText
    : firstMatch(TRUCK_WORDS, truckText) || firstMatch(TRUCK_WORDS.slice(0, 4), boxText) || "Truck Trailer"; // DV53 and blanks are a tractor-trailer
  if (truckText && !TRUCK_TYPES.has(truckText) && !firstMatch(TRUCK_WORDS, truckText) && !firstMatch(TRAILER_WORDS, truckText)) {
    notes.push(`No reconocí el equipo "${truckText}"; se calculó como ${TRUCK_LABEL[truckType].toLowerCase()}.`);
  }
  const tons = truckText.match(/\b(8|10|12|14|15|16|18)\s*(?:t\b|ton)/i)?.[1];
  const guessed = tons ? `${tons} t` : /camioneta/i.test(truckText) && !/\d/.test(truckText) ? "Camioneta"
    : /rab[oó]n/i.test(truckText) && /th?orton/i.test(truckText) ? truckText : null;
  if (guessed && !TRUCK_TYPES.has(truckText)) {
    notes.push(`Se interpretó "${guessed}" como ${TRUCK_LABEL[truckType].toLowerCase()}; corrígelo si es otra unidad.`);
  }
  const box = TRAILERS.has(boxText) ? boxText : firstMatch(TRAILER_WORDS, allText) || "Dry Van";
  if (boxText && !TRAILERS.has(boxText) && !firstMatch(TRAILER_WORDS, allText) && !firstMatch(TRUCK_WORDS, boxText)) {
    notes.push(`No reconocí el remolque "${boxText}"; se calculó como caja seca.`);
  }
  if (box !== "Hazmat" && TRAILER_WORDS.find(([name]) => name === "Hazmat")[1].test(allText)) {
    notes.push(`El FCM no combina hazmat con ${TRAILER_LABEL[box].toLowerCase()}; se calculó como ${TRAILER_LABEL[box].toLowerCase()}, sin la prima de hazmat.`);
  }
  const tandem = /sencill|single/i.test(configText) ? false : TANDEM_WORDS.test(configText) || TANDEM_WORDS.test(truckText);
  return {
    equipment: {
      truckType,
      trailer: box,
      config: tandem ? "Tandem" : "Single",
      driver: "B1" // the FCM screen's default driver
    },
    notes
  };
}

export function fcmEquipment(input = {}) {
  return readEquipment(input).equipment;
}

/** The FCM lane table keys most 1.5-ton routes as "< 1.5 tons"; look both up. */
export function mexLaneUnits(truckType) {
  return truckType === "1.5 tons" ? ["1.5 tons", "< 1.5 tons"] : [truckType];
}

export function equipmentLabel(equipment) {
  return [TRUCK_LABEL[equipment.truckType], TRAILER_LABEL[equipment.trailer], CONFIG_LABEL[equipment.config]].filter(Boolean).join(" · ");
}

/** What the FCM does not model for this equipment, in the base's own factors. */
export function equipmentCaveats(equipment, params = {}) {
  const caveats = [];
  if (equipment.truckType !== "Truck Trailer") {
    caveats.push(`${TRUCK_LABEL[equipment.truckType]}: el FCM lo estima escalando el costo del tractocamión con factores fijos; aún no tiene costos propios de esa unidad.`);
  }
  if (["Reefer", "Flatbed", "Hazmat", "Overdim"].includes(equipment.trailer)) {
    const pct = Math.round((trailerFactor(equipment.trailer, params) - 1) * 100);
    caveats.push(`${TRAILER_LABEL[equipment.trailer]}: el FCM sólo suma un recargo de riesgo de ${pct} % al costo de caja seca; no costea el equipo especial.`);
  }
  return caveats;
}

const INTERCHANGE_MODELS = new Set(["transfer", "swap", "drayage"]);
const BLUE_PLATE_MODELS = new Set(["direct", "b1"]);

/** Interchange (transfer, swap, drayage) carries the cruce; blue plates (direct, B1) do not. Unknown: carries it, as the FCM does. */
export function crossingCarriesBorder(model) {
  const value = String(model || "").trim().toLowerCase();
  if (INTERCHANGE_MODELS.has(value)) return { carries: true, known: true };
  if (BLUE_PLATE_MODELS.has(value)) return { carries: false, known: true };
  return { carries: true, known: false };
}

// ---------------------------------------------------------------- which base prices a route (cost-bases.service.ts)

export function scopeForOperation(operation) {
  switch (operation) {
    case "D2D Export":
    case "D2D Import":
      return "CROSS_BORDER";
    case "Drayage":
      return "DRAYAGE";
    case "Local":
      return "LOCAL";
    case "Intra-Mex":
    case "MX Northbound":
    case "MX Southbound":
      return "INTRA_MEX";
    case "Intra-US":
    case "US Northbound":
    case "US Southbound":
      return "INTRA_US";
    default:
      return null;
  }
}

export const SCOPE_LABEL = {
  CROSS_BORDER: "crossborder (D2D)",
  INTRA_MEX: "Intra-México",
  INTRA_US: "Intra-EE. UU.",
  DRAYAGE: "drayage",
  LOCAL: "local"
};

/**
 * Why a base cannot price this route, as the FCM would refuse it
 * (assertScopeCompatible + assertCalculationSupportedByProfile); null when it
 * can. Legacy sets carry no scope or profile and price any operation.
 */
export function baseRefusal(base, { operation, service, equipment }) {
  const name = base?.name || "La base";
  const expected = scopeForOperation(operation);
  if (base?.scope && expected && base.scope !== expected) {
    return `"${name}" es para rutas ${SCOPE_LABEL[base.scope] || base.scope}; esta ruta es ${operation}.`;
  }
  const profile = base?.profile;
  if (!profile || typeof profile !== "object") return null;
  const checks = [
    ["operations", operation, "la operación"],
    ["services", service, "el servicio"],
    ["truckTypes", equipment?.truckType, "el equipo"],
    ["trailerTypes", equipment?.trailer, "el remolque"],
    ["configurations", equipment?.config, "la configuración"],
    ["driverTypes", equipment?.driver, "el tipo de operador"]
  ];
  for (const [key, value, label] of checks) {
    const allowed = Array.isArray(profile[key]) ? profile[key] : null;
    if (allowed && !allowed.includes(value)) return `"${name}" no cubre ${label} ${value}; permite ${allowed.join(", ")}.`;
  }
  return null;
}

/** The base for a route: one of the route's scope that covers it, else the default, else any that covers it. */
export function pickCostBase(bases, input) {
  const fits = bases.filter((base) => !baseRefusal(base, input));
  const expected = scopeForOperation(input.operation);
  return fits.find((base) => expected && base.scope === expected) || fits.find((base) => base.is_default) || fits[0] || null;
}

/**
 * A QuoteDesk lane priced with an FCM base. Money is USD. Returns the lane
 * components (MX all-in, US linehaul at RPM, US fuel at FSC, cruce), the
 * carrier's price to us for the chosen tier, and the engine's own result.
 */
export function estimateQuoteLane(input) {
  const params = input.params || {};
  const operation = input.operation;
  const service = input.service;
  const tierKey = TIERS[input.tier] ? input.tier : "target";
  const margin = tierMargins(params)[tierKey];
  const border = crossingCarriesBorder(input.crossingModel);
  const crossBorder = operation === "D2D Export" || operation === "D2D Import";
  const borderCost = getParam(params, "BORDER", "Border Transactional Cost", 200);
  const overrides = { "BORDER__Border Transactional Cost": 0 };
  if (Number(input.fxUsdMxn) > 0) overrides["FINANCE__Tipo de Cambio"] = Number(input.fxUsdMxn);
  const equipment = input.equipment;
  const legs = legsFor(operation);
  const result = calculate({
    operation,
    service,
    equipment,
    params,
    overrides,
    fxRate: input.fxUsdMxn,
    policy: input.policy || "OPERATIONAL_V3",
    mexLeg: legs.mex && input.mex ? {
      baseKm: input.mex.km,
      routeExpensesMxn: input.mex.tollsMxn ?? 0,
      baseHours: input.mex.hours ?? 0,
      route: input.mex.route || "Straight & Danger",
      operation, service, equipment
    } : undefined,
    usaLeg: legs.usa && input.usa ? {
      loadedMiles: input.usa.miles,
      transitDaysRaw: input.usa.transitDays ?? 0,
      driverExpenses: input.usa.driverExpenses ?? 0,
      outState: input.usa.outState,
      dieselUsdGal: input.usa.dieselUsdGal ?? 0,
      fscUsdMile: input.usa.fscPerMile ?? 0,
      originCondition: input.usa.originCondition || "Neutral",
      destCondition: input.usa.destCondition || "Neutral",
      marketRpm: 0,
      operation, service, equipment
    } : undefined
  });
  const sell = (floor) => round2(floor / (1 - margin));
  const mex = result.mexLeg;
  const usa = result.usaLeg;
  const mexAllIn = mex ? sell(mex.productionCostUsd + mex.totalRiskAdjUsd) : null;
  let usLinehaul = null;
  let usFuel = null;
  if (usa) {
    const usTotal = sell(usa.cvuInclFuelUsd + usa.cfuUsd + usa.totalRiskAdjUsd);
    usFuel = round2((input.usa.fscPerMile ?? 0) * usa.loadedMiles);
    usLinehaul = round2(usTotal - usFuel);
  }
  const cruce = crossBorder && border.carries ? round2(borderCost) : 0;
  const carrierPrice = round2((mexAllIn ?? 0) + (usLinehaul ?? 0) + (usFuel ?? 0) + cruce);
  return {
    tier: tierKey,
    margin,
    margins: tierMargins(params),
    operation,
    service,
    equipment,
    components: { linehaul_mx: mexAllIn, linehaul_us: usLinehaul, fuel_amount: usFuel, border_amount: crossBorder ? cruce : null },
    carrierPriceUsd: carrierPrice,
    border: { carries: crossBorder && border.carries, known: border.known, costUsd: round2(borderCost) },
    mx: mex ? { km: mex.loadedKm, emptyKm: mex.emptyKm, tollsMxn: input.mex.tollsMxn ?? 0, hours: input.mex.hours ?? 0, fuelUsd: round2(mex.fuelUsd), allInUsd: mexAllIn } : null,
    us: usa ? {
      miles: usa.loadedMiles,
      rpm: usa.loadedMiles > 0 ? round4(usLinehaul / usa.loadedMiles) : 0,
      fscPerMile: input.usa.fscPerMile ?? 0,
      dieselUsdGal: input.usa.dieselUsdGal ?? 0,
      linehaulUsd: usLinehaul,
      fuelUsd: usFuel
    } : null,
    engine: {
      freightBaselineUsd: result.freightBaselineUsd,
      mexRequiredTariffUsd: mex ? mex.requiredTariffUsd : null,
      usaFlatUsd: usa ? round2(usa.flatUsd) : null,
      costFloorUsd: result.commercial.costFloorUsd
    }
  };
}

/** engine.calculator.ts `calculate` without drayage (QuoteDesk doesn't price drayage cycles). */
export function calculate(input) {
  const params = Object.assign({}, input.params, input.overrides ?? {});
  const policy = input.policy ?? "OPERATIONAL_V3";
  const legacyOperational = input.compatibilityMode === "LEGACY_FCM_V3" && policy === "OPERATIONAL_V3";
  const { operation } = input;
  const fxRate = input.fxRate && input.fxRate > 0 ? input.fxRate : 17.5;
  const need = legsFor(operation);
  const mexLeg = need.mex && input.mexLeg ? calculateMexLeg(input.mexLeg, params, policy, legacyOperational) : null;
  const usaLeg = need.usa && input.usaLeg && operation !== "Drayage" ? calculateUsaLeg(input.usaLeg, params, policy, legacyOperational) : null;
  const mexFlat = mexLeg ? mexLeg.requiredTariffUsd : 0;
  const usaFlat = usaLeg ? usaLeg.flatUsd : 0;
  const freightBaselineUsd = mround(mexFlat + usaFlat, 100);
  const productionCostUsd = (mexLeg ? mexLeg.productionCostUsd : 0) + (usaLeg ? usaLeg.cvuInclFuelUsd + usaLeg.cfuUsd : 0);
  const riskAdjUsd = (mexLeg ? mexLeg.totalRiskAdjUsd : 0) + (usaLeg ? usaLeg.totalRiskAdjUsd : 0);
  const loadedMiles = (mexLeg ? mexLeg.loadedMiles : 0) + (usaLeg ? usaLeg.loadedMiles : 0);
  const cycleDays = (mexLeg ? mexLeg.cycleDays : 0) + (usaLeg ? usaLeg.cycleDays : 0);
  const mixMx = getParam(params, "FUEL", "Fuel Purchase Mix MX", 0.3);
  const mixUs = getParam(params, "FUEL", "Fuel Purchase Mix US", 0.7);
  const marketReferenceUsd =
    (usaLeg && usaLeg.marketRateUsd > 0 ? usaLeg.marketRateUsd : usaLeg ? usaFlat : 0) +
    (mexLeg ? mexLeg.requiredTariffUsd : 0);
  const commercial = calculateCommercial({
    productionCostUsd,
    riskAdjUsd,
    recommendedSellUsd: freightBaselineUsd,
    marketReferenceUsd,
    loadedMiles,
    cycleDays,
    fuelMixOk: !legacyOperational && operation !== "D2D Export" && operation !== "D2D Import"
      ? true
      : Math.abs(mixMx + mixUs - 1) < 1e-6,
    params
  });
  return { policy, operation, mexLeg, usaLeg, freightBaselineUsd, commercial, requiredTariffUsd: freightBaselineUsd, fxRateUsed: fxRate };
}
