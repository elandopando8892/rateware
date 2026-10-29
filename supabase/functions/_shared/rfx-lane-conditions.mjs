// Route conditions of an RFx (decided 2026-10-22): concrete, verifiable
// requirements the team picks per lane, each required or preferred, that the
// carrier answers with a datum. They replace the six generic rubrics for new
// work; the six keys stay valid so existing events keep their answers.
//
// Shared by rateware-api (the team sets them) and rfx-bid-api (the carrier
// answers them). Pure module: no database, no Deno globals.

export const RFX_CONDITION_CATALOG_VERSION = 1;

/** Answers stay the ones rfx_segment_confirmations already allows. */
export const RFX_CONDITION_ANSWERS = new Set(["pending", "agree", "exception", "disagree", "not_applicable"]);

/** Six legacy rubric keys; still accepted for events created before the catalog. */
export const LEGACY_RUBRIC_KEYS = new Set([
  "logistics_model", "operation_criteria", "business_rules",
  "service_specifications", "carrier_requirements", "other_notes"
]);

/** A carrier answer to a lane condition travels as rubric_key "cond.<key>" under this segment key. */
export const CONDITION_SEGMENT_KEY = "lane";
export const CONDITION_RUBRIC_PREFIX = "cond.";

// kind: what the carrier gives back. comparator: how a target is read
// ("min" = at least, "max" = at most, "eq" = exactly). scope "cross_border"
// only makes sense on MX <-> US lanes; the team may still pick it elsewhere.
export const RFX_CONDITION_CATALOG = Object.freeze([
  // 1. Equipo
  { key: "trailer_spec", group: "equipment", kind: "text", es: "Tipo y medida de caja", en: "Trailer type and size" },
  { key: "reefer_temp_range", group: "equipment", kind: "text", es: "Rango de temperatura (refrigerado)", en: "Reefer temperature range" },
  { key: "equipment_max_age_years", group: "equipment", kind: "number", unit: "years", comparator: "max", es: "Antigüedad máxima de tractor y caja", en: "Max tractor and trailer age" },
  { key: "special_equipment", group: "equipment", kind: "text", es: "Equipo especial (rampas, bandas, sensores)", en: "Special equipment (ramps, straps, sensors)" },
  // 2. Capacidad y tiempos
  { key: "weekly_capacity_loads", group: "capacity", kind: "number", unit: "loads_per_week", comparator: "min", es: "Cargas por semana para esta ruta", en: "Loads per week on this lane" },
  { key: "assignment_lead_hours", group: "capacity", kind: "number", unit: "hours", comparator: "max", es: "Anticipación para asignar unidad", en: "Lead time to assign a unit" },
  { key: "appointment_windows", group: "capacity", kind: "text", es: "Recolección y entrega con cita", en: "Pickup and delivery appointments" },
  { key: "transit_days", group: "capacity", kind: "number", unit: "days", comparator: "max", es: "Tránsito puerta a puerta", en: "Door-to-door transit" },
  // 3. Cruce fronterizo
  { key: "crossing_model", group: "cross_border", scope: "cross_border", kind: "choice", choices: ["direct", "transfer"], es: "Modelo de cruce (directo o transfer)", en: "Crossing model (direct or transfer)" },
  { key: "crossing_port", group: "cross_border", scope: "cross_border", kind: "text", es: "Puerto de cruce", en: "Crossing port" },
  { key: "ctpat_oea", group: "cross_border", scope: "cross_border", kind: "boolean", es: "Certificación C-TPAT u OEA", en: "C-TPAT or OEA certified" },
  { key: "fast_drivers", group: "cross_border", scope: "cross_border", kind: "boolean", es: "Operadores con FAST", en: "FAST card drivers" },
  { key: "scac_caat", group: "cross_border", scope: "cross_border", kind: "text", es: "SCAC y CAAT", en: "SCAC and CAAT" },
  { key: "in_bond", group: "cross_border", scope: "cross_border", kind: "boolean", es: "Capacidad in-bond", en: "In-bond capable" },
  // 4. Seguro y cumplimiento
  { key: "cargo_insurance_usd", group: "compliance", kind: "money", unit: "USD", comparator: "min", es: "Póliza de carga", en: "Cargo insurance" },
  { key: "liability_insurance_usd", group: "compliance", kind: "money", unit: "USD", comparator: "min", es: "Responsabilidad civil", en: "Liability insurance" },
  { key: "us_authority", group: "compliance", kind: "text", es: "Autoridad MC/DOT (US)", en: "MC/DOT authority (US)" },
  { key: "mx_sct_permit", group: "compliance", kind: "text", es: "Permiso SCT (MX)", en: "SCT permit (MX)" },
  { key: "carta_porte_cfdi", group: "compliance", kind: "boolean", es: "Carta Porte con complemento CFDI", en: "Carta Porte CFDI complement" },
  { key: "hazmat", group: "compliance", kind: "boolean", es: "Materiales peligrosos", en: "Hazmat" },
  // 5. Tarifa y accesoriales
  { key: "allin_inclusions", group: "pricing", kind: "text", es: "Qué incluye el all-in (combustible, cruce, transfer, casetas)", en: "All-in inclusions (fuel, crossing, transfer, tolls)" },
  { key: "detention_free_hours", group: "pricing", kind: "number", unit: "hours", comparator: "min", es: "Tiempo libre antes de detention", en: "Free time before detention" },
  { key: "detention_rate_usd_hour", group: "pricing", kind: "money", unit: "USD_per_hour", comparator: "max", es: "Detention por hora", en: "Detention per hour" },
  { key: "accessorials", group: "pricing", kind: "text", es: "Layover, TONU y parada adicional", en: "Layover, TONU and extra stop" },
  // 6. Servicio y seguridad
  { key: "tracking_link", group: "service", kind: "boolean", es: "Rastreo GPS/ELD con liga para el shipper", en: "GPS/ELD tracking link for the shipper" },
  { key: "pod_hours", group: "service", kind: "number", unit: "hours", comparator: "max", es: "Prueba de entrega (POD)", en: "Proof of delivery (POD)" },
  { key: "mx_security", group: "service", kind: "text", es: "Seguridad en México (custodia, candado, GPS en caja)", en: "Mexico security (escort, lock, trailer GPS)" },
  // 7. Pago
  { key: "payment_terms_days", group: "payment", kind: "number", unit: "days", comparator: "min", es: "Días de crédito aceptados", en: "Accepted payment terms" },
  { key: "factoring", group: "payment", kind: "boolean", es: "Usa factoraje", en: "Uses factoring" }
].map((entry) => Object.freeze(entry)));

/**
 * Whether the event no longer takes bids: a closing status, or its deadline
 * passed (end of due_date at the given UTC offset, Mexico City "-06:00" like
 * rfx-bid-api's dueState). Fr8Bid closes bids by moving due_date while the
 * status stays "open", so the date alone must also freeze route conditions.
 */
export function biddingClosed(event, now = new Date(), utcOffset = "-06:00") {
  const status = String(event?.status ?? "").trim().toLowerCase();
  if (["closed", "awarded", "archived"].includes(status)) return true;
  const due = String(event?.due_date ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
  const dueAt = new Date(`${due}T23:59:59${utcOffset}`);
  return !Number.isNaN(dueAt.getTime()) && now.getTime() > dueAt.getTime();
}

const BY_KEY = new Map(RFX_CONDITION_CATALOG.map((entry) => [entry.key, entry]));
const IMPORTANCE = new Set(["required", "preferred"]);
const MAX_CONDITIONS_PER_LANE = 30;

export function catalogEntry(key) {
  return BY_KEY.get(String(key ?? "").trim()) || null;
}

export function conditionRubricKey(key) {
  return `${CONDITION_RUBRIC_PREFIX}${key}`;
}

/** "cond.cargo_insurance_usd" -> "cargo_insurance_usd"; anything else -> null. */
export function conditionKeyFromRubric(rubricKey) {
  const text = String(rubricKey ?? "").trim();
  return text.startsWith(CONDITION_RUBRIC_PREFIX) ? text.slice(CONDITION_RUBRIC_PREFIX.length) || null : null;
}

const text = (value, max) => {
  if (value === null || value === undefined) return null;
  const clean = String(value).trim();
  return clean ? clean.slice(0, max) : null;
};

/**
 * A datum for one condition, checked against its kind. Returns { value } or
 * { error }. An empty datum is null (the carrier may answer without one).
 */
export function cleanConditionValue(entry, raw) {
  if (raw === null || raw === undefined || raw === "") return { value: null };
  switch (entry.kind) {
    case "boolean": {
      if (typeof raw === "boolean") return { value: raw };
      const word = String(raw).trim().toLowerCase();
      if (["true", "yes", "si", "sí", "1"].includes(word)) return { value: true };
      if (["false", "no", "0"].includes(word)) return { value: false };
      return { error: `${entry.key} expects yes or no.` };
    }
    case "number":
    case "money": {
      const number = typeof raw === "number" ? raw : Number(String(raw).replace(/[,\s$]/g, ""));
      if (!Number.isFinite(number) || number < 0) return { error: `${entry.key} expects a non-negative number.` };
      return { value: number };
    }
    case "choice": {
      const word = String(raw).trim().toLowerCase();
      return entry.choices.includes(word) ? { value: word } : { error: `${entry.key} expects one of ${entry.choices.join(", ")}.` };
    }
    default: {
      const clean = text(raw, 400);
      return { value: clean };
    }
  }
}

/** Whether a datum meets the team's target; null when there is nothing to compare. */
export function meetsTarget(entry, target, value) {
  if (target === null || target === undefined || value === null || value === undefined) return null;
  if (entry.kind === "number" || entry.kind === "money") {
    if (entry.comparator === "min") return value >= target;
    if (entry.comparator === "max") return value <= target;
    return value === target;
  }
  if (entry.kind === "boolean" || entry.kind === "choice") return value === target;
  return null;
}

/**
 * The team's set for one lane, as rows for rfx_lane_conditions (without ids).
 * Throws on an unknown key, a bad importance or a target of the wrong kind,
 * so a typo never reaches the carrier.
 */
export function normalizeLaneConditions(input) {
  const list = Array.isArray(input) ? input : [];
  if (list.length > MAX_CONDITIONS_PER_LANE) throw new Error(`At most ${MAX_CONDITIONS_PER_LANE} conditions per lane.`);
  const seen = new Set();
  return list.map((item, index) => {
    const record = item && typeof item === "object" ? item : {};
    const entry = catalogEntry(record.condition_key ?? record.key);
    if (!entry) throw new Error(`Unknown route condition: ${String(record.condition_key ?? record.key ?? "")}.`);
    if (seen.has(entry.key)) throw new Error(`Route condition ${entry.key} is listed twice.`);
    seen.add(entry.key);
    const importance = String(record.importance ?? "required").trim().toLowerCase();
    if (!IMPORTANCE.has(importance)) throw new Error(`Importance must be required or preferred (${entry.key}).`);
    const target = cleanConditionValue(entry, record.target);
    if (target.error) throw new Error(target.error);
    return {
      condition_key: entry.key,
      importance,
      target: target.value,
      note: text(record.note, 600),
      sort_order: Number.isInteger(record.sort_order) ? record.sort_order : index + 1
    };
  });
}

/** Same requirement means same revision; any change asks carriers to confirm again. */
export function sameRequirement(row, next) {
  return row.importance === next.importance
    && JSON.stringify(row.target ?? null) === JSON.stringify(next.target ?? null)
    && (row.note ?? null) === (next.note ?? null);
}

/** What the carrier sees of a lane condition: the catalog wording plus the team's requirement. */
export function publicLaneCondition(row) {
  const entry = catalogEntry(row.condition_key);
  if (!entry) return null;
  return {
    condition_key: entry.key,
    rubric_key: conditionRubricKey(entry.key),
    segment_key: CONDITION_SEGMENT_KEY,
    group: entry.group,
    kind: entry.kind,
    unit: entry.unit ?? null,
    comparator: entry.comparator ?? null,
    choices: entry.choices ?? null,
    label_es: entry.es,
    label_en: entry.en,
    importance: row.importance,
    target: row.target ?? null,
    note: row.note ?? null,
    revision: row.revision ?? 1,
    sort_order: row.sort_order ?? 0
  };
}

/**
 * Checks one carrier answer to a lane condition. Returns the cleaned value or
 * throws. A numeric condition needs its number; "agree" with a datum that
 * misses the target is a contradiction and is refused: the carrier answers
 * exception (with a comment) or disagree.
 */
export function checkConditionAnswer(condition, answer, rawValue, comment) {
  const entry = catalogEntry(condition.condition_key);
  if (!entry) throw new Error("Invalid segment rubric.");
  if (!RFX_CONDITION_ANSWERS.has(answer)) throw new Error("Invalid segment confirmation answer.");
  const cleaned = cleanConditionValue(entry, rawValue);
  if (cleaned.error) throw new Error(cleaned.error);
  // A number is the point of a numeric condition: "agree" or "exception" without one commits to nothing.
  if ((answer === "agree" || answer === "exception") && (entry.kind === "number" || entry.kind === "money") && cleaned.value === null) {
    throw new Error(`${entry.key}: give the value.`);
  }
  if (answer === "exception" && !text(comment, 1200)) {
    throw new Error(`Explain the exception for ${entry.key}.`);
  }
  if (answer === "agree" && meetsTarget(entry, condition.target, cleaned.value) === false) {
    throw new Error(`${entry.key}: the value does not meet the requirement; answer exception or disagree.`);
  }
  return cleaned.value;
}
