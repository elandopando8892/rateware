const SCHEMA_VERSION = "rateware.intelligence_brief.v1";
const ALLOWED_SOURCES = new Set(["geo", "pivot", "copilot", "ranking"]);
const MONETARY_METRICS = new Set([
  "all_in", "all_in_rate", "avg_all_in", "avg_all_in_rate", "min_all_in_rate", "max_all_in_rate",
  "cost_per_mile", "cost_per_km", "avg_cost_per_mile", "avg_cost_per_km",
  "mx_linehaul", "us_linehaul", "linehaul", "fsc", "fuel", "border_crossing_fee", "border_fee"
]);
const MONETARY_FIELDS = new Set([
  ...MONETARY_METRICS,
  "rate", "price", "cost", "amount", "spend", "revenue", "margin_amount", "toll", "fee", "charge",
  "flat_rate", "carrier_cost_rate", "customer_board_rate"
]);
const LINEAGE_IDENTIFIER_KEYS = ["id", "raw_upload_id", "rate_staging_id"];
const OBSERVATION_METADATA_KEYS = new Set(["currency", "currencies", "selected", "type", "source_file"]);
const MAX_EVIDENCE_NODES = 20000;

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

function identifierText(value, maxLength = 160) {
  if (typeof value !== "string") return "";
  const candidate = value.trim().slice(0, maxLength);
  if (!candidate || /^(true|false|null|undefined|nan|infinity)$/i.test(candidate)) return "";
  if (/[\p{Cc}\p{Cf}]/u.test(candidate) || !/[\p{L}\p{N}]/u.test(candidate)) return "";
  return candidate;
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

function pushCurrencies(target, value) {
  if (Array.isArray(value)) value.forEach((item) => pushCurrency(target, item));
  else pushCurrency(target, value);
}

function usableObservation(value, budget) {
  const stack = [{ value, key: "" }];
  const seen = new WeakSet();
  while (stack.length) {
    if (++budget.count > MAX_EVIDENCE_NODES) return { usable: false, incomplete: true };
    const current = stack.pop();
    const item = current.value;
    if (typeof item === "string" && item.trim() && !OBSERVATION_METADATA_KEYS.has(current.key)) return { usable: true, incomplete: false };
    if (typeof item === "number" && Number.isFinite(item) && !OBSERVATION_METADATA_KEYS.has(current.key)) return { usable: true, incomplete: false };
    if (typeof item === "boolean" || item === null || item === undefined) continue;
    if (typeof item !== "object") continue;
    if (seen.has(item)) return { usable: false, incomplete: true };
    seen.add(item);
    if (Array.isArray(item)) {
      for (let index = item.length - 1; index >= 0; index -= 1) stack.push({ value: item[index], key: current.key });
      continue;
    }
    if (!isRecord(item)) continue;
    for (const [key, nested] of Object.entries(item)) stack.push({ value: nested, key: key.toLowerCase() });
  }
  return { usable: false, incomplete: false };
}

function observationCount(value, budget) {
  if (!Array.isArray(value)) return { count: null, incomplete: false };
  let usable = 0;
  for (const item of value) {
    const inspected = usableObservation(item, budget);
    if (inspected.incomplete) return { count: usable, incomplete: true };
    if (inspected.usable) usable += 1;
  }
  return { count: usable, incomplete: false };
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
        const id = identifierText(item, 160);
        if (id) references.push({ id });
        continue;
      }
      if (!isRecord(item)) continue;
      const reference = {};
      for (const key of ["type", "id", "raw_upload_id", "rate_staging_id", "source_file"]) {
        const value = LINEAGE_IDENTIFIER_KEYS.includes(key)
          ? identifierText(item[key], 100)
          : (typeof item[key] === "string" ? text(item[key], key === "source_file" ? 180 : 100) : "");
        if (value) reference[key] = value;
      }
      if (LINEAGE_IDENTIFIER_KEYS.some((key) => reference[key])) references.push(reference);
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
  const budget = { count: 0 };
  const rowAnalysis = observationCount(result.rows, budget);
  const pointAnalysis = observationCount(result.points, budget);
  const recommendationAnalysis = observationCount(result.recommendations, budget);
  const rows = rowAnalysis.count;
  const points = pointAnalysis.count;
  const recommendations = recommendationAnalysis.count;
  const rateSignals = count(result.rate_signal_count);
  const primary = transactions ?? rateSignals ?? recommendations ?? rows ?? points ?? carriers;
  return {
    sample: { transactions, carriers, rows, points, recommendations, rate_signals: rateSignals, primary },
    incomplete: rowAnalysis.incomplete || pointAnalysis.incomplete || recommendationAnalysis.incomplete
  };
}

function monetaryValueState(value) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return "absent";
  if (typeof value === "number") return Number.isFinite(value) ? "valid" : "invalid";
  if (typeof value !== "string") return "invalid";
  return /^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(value.trim()) ? "valid" : "invalid";
}

function inspectEvidenceTree(value, metricMonetary, budget) {
  const currencies = new Set();
  const stack = [value];
  const seen = new WeakSet();
  let hasMoney = Boolean(metricMonetary);
  let invalidMoney = false;
  while (stack.length) {
    if (++budget.count > MAX_EVIDENCE_NODES) return { currencies, hasMoney, invalidMoney, incomplete: true };
    const item = stack.pop();
    if (!item || typeof item !== "object") continue;
    if (seen.has(item)) return { currencies, hasMoney, invalidMoney, incomplete: true };
    seen.add(item);
    if (Array.isArray(item)) {
      for (let index = item.length - 1; index >= 0; index -= 1) stack.push(item[index]);
      continue;
    }
    if (!isRecord(item)) continue;
    for (const [rawKey, nested] of Object.entries(item)) {
      const key = rawKey.toLowerCase();
      if (key === "currency" || key === "currencies") pushCurrencies(currencies, nested);
      if (MONETARY_FIELDS.has(key)) {
        const state = monetaryValueState(nested);
        if (state !== "absent") hasMoney = true;
        if (state === "invalid") invalidMoney = true;
      }
      if (nested && typeof nested === "object") stack.push(nested);
    }
  }
  return { currencies, hasMoney, invalidMoney, incomplete: false };
}

function analyzeMonetaryEvidence(result, context, sample) {
  const summary = isRecord(result.summary) ? result.summary : {};
  const sourceCurrencies = new Set();
  pushCurrencies(sourceCurrencies, result.currency);
  pushCurrencies(sourceCurrencies, result.currencies);
  pushCurrencies(sourceCurrencies, summary.currency);
  pushCurrencies(sourceCurrencies, summary.currencies);
  const observedCurrencies = new Set(sourceCurrencies);
  const monetaryCurrencies = new Set(sourceCurrencies);
  const metricMonetary = [result.metric, result.ranking_mode, result.filters?.ranking_mode, context.metric, context.ranking_mode]
    .some((value) => MONETARY_METRICS.has(text(value, 80).toLowerCase()));
  const budget = { count: 0 };
  let hasMoney = false;
  let missingCurrency = false;
  let invalidMoney = false;
  let incomplete = false;
  let monetaryObservationSeen = false;

  const summaryEvidence = inspectEvidenceTree(summary, false, budget);
  summaryEvidence.currencies.forEach((currency) => observedCurrencies.add(currency));
  if (summaryEvidence.hasMoney) {
    hasMoney = true;
    summaryEvidence.currencies.forEach((currency) => monetaryCurrencies.add(currency));
    if (!sourceCurrencies.size) missingCurrency = true;
  }
  invalidMoney ||= summaryEvidence.invalidMoney;
  incomplete ||= summaryEvidence.incomplete;

  const directEvidence = {};
  for (const [rawKey, value] of Object.entries(result)) {
    const key = rawKey.toLowerCase();
    if (MONETARY_FIELDS.has(key)) directEvidence[key] = value;
  }
  const topLevelEvidence = inspectEvidenceTree(directEvidence, false, budget);
  if (topLevelEvidence.hasMoney) {
    hasMoney = true;
    if (!sourceCurrencies.size) missingCurrency = true;
  }
  invalidMoney ||= topLevelEvidence.invalidMoney;
  incomplete ||= topLevelEvidence.incomplete;

  for (const collection of [result.points, result.rows, result.recommendations]) {
    if (!Array.isArray(collection)) continue;
    for (const item of collection) {
      const usable = usableObservation(item, budget);
      incomplete ||= usable.incomplete;
      const evidence = inspectEvidenceTree(item, metricMonetary && usable.usable, budget);
      evidence.currencies.forEach((currency) => observedCurrencies.add(currency));
      if (evidence.hasMoney) {
        hasMoney = true;
        monetaryObservationSeen = true;
        evidence.currencies.forEach((currency) => monetaryCurrencies.add(currency));
        if (!sourceCurrencies.size && !evidence.currencies.size) missingCurrency = true;
      }
      invalidMoney ||= evidence.invalidMoney;
      incomplete ||= evidence.incomplete;
      if (incomplete) break;
    }
    if (incomplete) break;
  }

  if (metricMonetary && sample.primary > 0 && !monetaryObservationSeen) {
    hasMoney = true;
    if (!sourceCurrencies.size) missingCurrency = true;
  }
  const currencies = hasMoney ? monetaryCurrencies : observedCurrencies;
  return {
    currencies: [...currencies].sort(),
    hasMoney,
    missingCurrency,
    mixedCurrency: hasMoney && monetaryCurrencies.size > 1,
    invalidMoney,
    incomplete
  };
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
    const sampleAnalysis = sampleSummary(result);
    const sample = sampleAnalysis.sample;
    const monetaryEvidence = analyzeMonetaryEvidence(result, context, sample);
    const currencies = monetaryEvidence.currencies;
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
    if (sampleAnalysis.incomplete || monetaryEvidence.incomplete) {
      addGap("evidence:incomplete", "blocking", "The source evidence exceeded the bounded local inspection limit.");
    }

    if (monetaryEvidence.invalidMoney) {
      addGap("monetary:invalid", "blocking", "Monetary evidence contains an invalid amount.");
    }
    if (monetaryEvidence.hasMoney) {
      if (monetaryEvidence.missingCurrency) addGap("currency:missing", "blocking", "At least one monetary observation has no explicit currency.");
      if (monetaryEvidence.mixedCurrency) addGap("currency:mixed", "blocking", "Monetary evidence contains mixed currencies and was not converted.");
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
