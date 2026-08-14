const SCHEMA_VERSION = "rateware.intelligence_brief.v1";
const ALLOWED_SOURCES = new Set(["geo", "pivot", "copilot", "ranking"]);
const MONEY_SIGNAL = /(rate|cost|price|all[_ -]?in|linehaul|fsc|fee)/i;

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function text(value, maxLength = 240) {
  if (typeof value === "string") return value.trim().slice(0, maxLength);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return "";
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function count(value) {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? Math.trunc(number) : null;
}

function validCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeTimestamp(value) {
  const candidate = text(value, 64);
  if (!candidate) return null;
  if (validCalendarDate(candidate)) return candidate;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(candidate)) return null;
  if (!validCalendarDate(candidate.slice(0, 10))) return null;
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function generatedTimestamp(value) {
  return normalizeTimestamp(value) || new Date().toISOString();
}

function normalizeCurrency(value) {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function pushCurrency(target, value) {
  const currency = normalizeCurrency(value);
  if (currency) target.add(currency);
}

function collectCurrencies(result) {
  const currencies = new Set();
  pushCurrency(currencies, result.currency);
  pushCurrency(currencies, result.summary?.currency);
  if (Array.isArray(result.currencies)) result.currencies.forEach((value) => pushCurrency(currencies, value));
  if (Array.isArray(result.summary?.currencies)) result.summary.currencies.forEach((value) => pushCurrency(currencies, value));
  for (const collection of [result.points, result.rows, result.recommendations]) {
    if (!Array.isArray(collection)) continue;
    collection.slice(0, 500).forEach((item) => {
      if (isRecord(item)) pushCurrency(currencies, item.currency);
    });
  }
  return [...currencies].sort();
}

function sanitizeValue(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return text(value);
  if (Array.isArray(value)) {
    return value.map((item) => text(item)).filter(Boolean).slice(0, 20);
  }
  return undefined;
}

function sanitizeContext(value) {
  if (!isRecord(value)) return { filters: {} };
  const context = {};
  for (const key of ["metric", "aggregation", "level", "scope", "ranking_mode", "limit", "min_transactions"]) {
    const normalized = sanitizeValue(value[key]);
    if (normalized !== undefined && normalized !== "") context[key] = normalized;
  }
  const filters = {};
  if (isRecord(value.filters)) {
    for (const [key, raw] of Object.entries(value.filters).slice(0, 40)) {
      const safeKey = /^[a-z][a-z0-9_]{0,63}$/i.test(key) ? key : null;
      const normalized = sanitizeValue(raw);
      if (safeKey && normalized !== undefined && normalized !== "" && (!Array.isArray(normalized) || normalized.length)) {
        filters[safeKey] = normalized;
      }
    }
  }
  context.filters = filters;
  return context;
}

function lineageReferences(result) {
  const collections = [result.lineage, result.source_refs, result.evidence_refs].filter(Array.isArray);
  const references = [];
  for (const collection of collections) {
    for (const item of collection.slice(0, 100)) {
      if (typeof item === "string") {
        const id = text(item, 160);
        if (id) references.push({ id });
        continue;
      }
      if (!isRecord(item)) continue;
      const reference = {};
      for (const key of ["type", "id", "raw_upload_id", "rate_staging_id", "source_file"]) {
        const value = text(item[key], key === "source_file" ? 180 : 100);
        if (value) reference[key] = value;
      }
      if (Object.keys(reference).length) references.push(reference);
    }
  }
  return references;
}

function proposalRows(result) {
  if (!Array.isArray(result.proposed_actions)) return [];
  return result.proposed_actions.slice(0, 20).flatMap((item) => {
    if (!isRecord(item)) return [];
    const action = text(item.action || item.title, 300);
    if (!action) return [];
    return [{
      status: "proposal",
      priority: text(item.priority, 40) || "review",
      action,
      rationale: text(item.rationale, 600) || null,
      requires_confirmation: true,
      execution_authorized: false
    }];
  });
}

function sampleSummary(result) {
  const summary = isRecord(result.summary) ? result.summary : {};
  const transactions = count(summary.transactions ?? result.transaction_count);
  const carriers = count(summary.carriers ?? result.carrier_count ?? result.candidate_count);
  const rows = Array.isArray(result.rows) ? result.rows.length : null;
  const points = Array.isArray(result.points) ? result.points.length : null;
  const recommendations = Array.isArray(result.recommendations) ? result.recommendations.length : null;
  const rateSignals = count(result.rate_signal_count);
  const primary = transactions ?? rateSignals ?? recommendations ?? rows ?? points ?? carriers;
  return { transactions, carriers, rows, points, recommendations, rate_signals: rateSignals, primary };
}

function hasMonetaryEvidence(result, context) {
  const summary = isRecord(result.summary) ? result.summary : {};
  if (MONEY_SIGNAL.test(text(result.metric || context.metric, 80))) return true;
  for (const key of ["avg_all_in_rate", "min_all_in_rate", "max_all_in_rate", "avg_all_in", "avg_cost_per_mile", "avg_cost_per_km"]) {
    if (finiteNumber(summary[key]) !== null) return true;
  }
  return Array.isArray(result.points) && result.points.some((point) => isRecord(point) && [point.avg_all_in, point.avg_cost_per_mile, point.avg_cost_per_km].some((value) => finiteNumber(value) !== null));
}

function dataAsOf(result) {
  for (const value of [result.data_as_of, result.as_of, result.summary?.data_as_of, result.summary?.as_of]) {
    const normalized = normalizeTimestamp(value);
    if (normalized) return normalized;
  }
  return null;
}

function safeWarningRows(result) {
  const rows = [];
  if (Array.isArray(result.warnings)) rows.push(...result.warnings);
  if (Array.isArray(result.data_gaps)) {
    rows.push(...result.data_gaps.map((gap) => isRecord(gap) ? (gap.title || gap.impact || gap.code) : gap));
  }
  return rows.map((item) => text(item, 300)).filter(Boolean).slice(0, 30);
}

function blockedBrief(generatedAt, code = "result:invalid") {
  return {
    schema_version: SCHEMA_VERSION,
    mode: "observation_only",
    status: "blocked",
    source: "none",
    generated_at: generatedTimestamp(generatedAt),
    data_as_of: null,
    context: { filters: {} },
    sample: { transactions: null, carriers: null, rows: null, points: null, recommendations: null, rate_signals: null, primary: null },
    evidence: { metric: null, currencies: [], currency: null, model_status: null, evidence_mode: null },
    lineage: { references: [] },
    proposals: [],
    gaps: [{ code, severity: "blocking", message: "Run an Analyze view before creating a decision brief." }],
    controls: {
      material_action_authorized: false,
      outreach_authorized: false,
      rfx_invitation_authorized: false,
      dispatch_authorized: false,
      writeback_authorized: false,
      external_distribution_authorized: false,
      local_export_only: true
    }
  };
}

export function buildIntelligenceBrief(input = {}) {
  try {
    if (!isRecord(input) || !isRecord(input.result)) return blockedBrief(input?.generatedAt);
    const result = input.result;
    const source = ALLOWED_SOURCES.has(input.source) ? input.source : "unknown";
    const context = sanitizeContext(input.context);
    const sample = sampleSummary(result);
    const currencies = collectCurrencies(result);
    const asOf = dataAsOf(result);
    const references = lineageReferences(result);
    const warnings = safeWarningRows(result);
    const gaps = [];
    const gapCodes = new Set();
    const addGap = (code, severity, message) => {
      if (gapCodes.has(code)) return;
      gapCodes.add(code);
      gaps.push({ code, severity, message });
    };

    if (source === "unknown") addGap("source:unknown", "blocking", "The source Analyze view is unknown.");
    if (!asOf) addGap("data_as_of:missing", "review", "The source did not provide a governed data-as-of timestamp.");
    if (sample.primary === null || sample.primary === 0) addGap("sample:empty", "blocking", "The source contains no usable observations.");
    else if (sample.primary < 5) addGap("sample:thin", "review", "The source contains fewer than five observations.");
    if (sample.carriers !== null && sample.carriers < 2) addGap("sample:single_carrier", "review", "The result does not contain a comparable carrier sample.");

    if (hasMonetaryEvidence(result, context)) {
      if (!currencies.length) addGap("currency:missing", "blocking", "Monetary evidence has no explicit currency.");
      else if (currencies.length > 1) addGap("currency:mixed", "blocking", "Monetary evidence contains mixed currencies and was not converted.");
    }
    if (!references.length) addGap("lineage:missing", "review", "The source did not provide rate or upload lineage references.");
    warnings.forEach((warning, index) => addGap(`source_warning:${index + 1}`, "review", warning));

    const blocking = gaps.some((gap) => gap.severity === "blocking");
    return {
      schema_version: SCHEMA_VERSION,
      mode: "observation_only",
      status: blocking ? "blocked" : gaps.length ? "review_required" : "reviewable",
      source,
      generated_at: generatedTimestamp(input.generatedAt),
      data_as_of: asOf,
      context,
      sample,
      evidence: {
        metric: text(result.metric || context.metric, 80) || null,
        currencies,
        currency: currencies.length === 1 ? currencies[0] : null,
        model_status: text(result.model_status, 80) || null,
        evidence_mode: text(result.evidence_mode, 80) || null
      },
      lineage: { references },
      proposals: proposalRows(result),
      gaps,
      controls: {
        material_action_authorized: false,
        outreach_authorized: false,
        rfx_invitation_authorized: false,
        dispatch_authorized: false,
        writeback_authorized: false,
        external_distribution_authorized: false,
        local_export_only: true
      }
    };
  } catch {
    return blockedBrief(undefined, "result:invalid");
  }
}

export { SCHEMA_VERSION };
