const HANDOFF_SCHEMA_VERSION = "rateware.finance_handoff.v1";
const SUPPORTED_CURRENCIES = new Set(["USD", "MXN", "CAD"]);
const COMMERCIAL_MODEL_ALIASES = Object.freeze({
  direct: "cost_plus",
  direct_carrier: "cost_plus",
  direct_cost_plus: "cost_plus",
  cost_plus: "cost_plus",
  fee_plus: "fee_plus",
  carrier_share: "sell_share",
  shared_margin: "sell_share",
  share: "sell_share",
  sell_share: "sell_share",
  xbf: "brokerage",
  buy_sell: "brokerage",
  xbf_buy_sell: "brokerage",
  brokerage: "brokerage"
});

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function text(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function optionalPositiveDecimal(value) {
  const absent = value === null || value === undefined || (typeof value === "string" && value.trim() === "");
  if (absent) return { present: false, valid: true, value: null };
  if (typeof value !== "string" && typeof value !== "number") {
    return { present: true, valid: false, value: null };
  }
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return { present: true, valid: false, value: null };
  const number = Number(raw);
  return Number.isFinite(number) && number > 0
    ? { present: true, valid: true, value: number }
    : { present: true, valid: false, value: null };
}

function optionalIsoDate(value) {
  const absent = value === null || value === undefined || (typeof value === "string" && value.trim() === "");
  if (absent) return { present: false, valid: true, value: null };
  if (typeof value !== "string") return { present: true, valid: false, value: null };
  const normalized = value.trim();
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(normalized)) return { present: true, valid: false, value: null };
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized
    ? { present: true, valid: true, value: normalized }
    : { present: true, valid: false, value: null };
}

function supportedCurrency(value) {
  const currency = text(value)?.toUpperCase() || null;
  return currency && SUPPORTED_CURRENCIES.has(currency) ? currency : null;
}

function canonicalCommercialModel(value) {
  const key = text(value)?.toLowerCase().replace(/[\s-]+/g, "_") || null;
  return key ? COMMERCIAL_MODEL_ALIASES[key] || null : null;
}

function sourceUploadId(row) {
  return text(row.raw_upload_id);
}

function vendorReference(row) {
  return text(row.vendor_id);
}

function vendorName(row) {
  return text(row.vendors?.vendor_name);
}

function missingField(name, value) {
  return value === null ? name : null;
}

function buildRateHandoff(row) {
  const issues = [];
  if (!isPlainObject(row)) return { status: "blocked", missing_fields: ["rate_row:object"], rate: null };

  const rateRowId = text(row.id);
  const approvalStatus = text(row.status);
  const sourceUpload = sourceUploadId(row);
  const vendorRef = vendorReference(row);
  const vendor = vendorName(row);
  const origin = text(row.normalized_origin) || text(row.origin);
  const destination = text(row.normalized_destination) || text(row.destination);
  const commercialModel = canonicalCommercialModel(row.commercial_model);
  const currency = supportedCurrency(row.currency);
  const allInRate = optionalPositiveDecimal(row.all_in_rate);
  const carrierCostRate = optionalPositiveDecimal(row.carrier_cost_rate);
  const customerBoardRate = optionalPositiveDecimal(row.customer_board_rate);
  const validThrough = optionalIsoDate(row.valid_through);
  const quoteDate = optionalIsoDate(row.quote_date);

  [
    missingField("rate_row_id", rateRowId),
    approvalStatus === "approved" ? null : "rate_status:approved",
    missingField("source_upload_id", sourceUpload),
    missingField("vendor_reference", vendorRef),
    missingField("vendor_name", vendor),
    missingField("origin", origin),
    missingField("destination", destination),
    missingField("commercial_model:canonical", commercialModel),
    missingField("currency:supported", currency)
  ].filter(Boolean).forEach((issue) => issues.push(issue));

  if (!allInRate.present || !allInRate.valid) issues.push("all_in_rate:positive");
  if (carrierCostRate.present && !carrierCostRate.valid) issues.push("carrier_cost_rate:positive");
  if (customerBoardRate.present && !customerBoardRate.valid) issues.push("customer_board_rate:positive");
  if (validThrough.present && !validThrough.valid) issues.push("valid_through:date");
  if (quoteDate.present && !quoteDate.valid) issues.push("quote_date:date");
  if (validThrough.valid && quoteDate.valid && validThrough.value && quoteDate.value && validThrough.value < quoteDate.value) {
    issues.push("valid_through:not_before_quote_date");
  }

  const spread = carrierCostRate.value !== null && customerBoardRate.value !== null
    ? Number((customerBoardRate.value - carrierCostRate.value).toFixed(2))
    : null;
  if (spread !== null && spread < 0) issues.push("observed_spread:nonnegative");

  return {
    status: issues.length ? "blocked" : "ready",
    missing_fields: issues,
    rate: {
      rate_row_id: rateRowId,
      source_upload_id: sourceUpload,
      rfx_id: text(row.rfx_id),
      shipment_id: text(row.row_id),
      vendor: { reference: vendorRef, name: vendor },
      lane: { origin, destination, operation: text(row.operation), service: text(row.service), equipment: text(row.equipment), trailer: text(row.trailer) },
      commercial: { commercial_model: commercialModel, currency, all_in_rate: allInRate.value, carrier_cost_rate: carrierCostRate.value, customer_board_rate: customerBoardRate.value, observed_spread: spread, valid_through: validThrough.value, quote_date: quoteDate.value },
      source_file: text(row.source_file) || text(row.source_evidence?.source_filename),
      approval_surface: "approved_rateware"
    }
  };
}

export function buildFinanceHandoff(rows, { expectedIds = [] } = {}) {
  const entries = (Array.isArray(rows) ? rows : []).map(buildRateHandoff);
  const receivedIds = new Set(entries.map((entry) => entry.rate?.rate_row_id).filter(Boolean));
  const unavailableIds = Array.isArray(expectedIds)
    ? [...new Set(expectedIds.map(text).filter(Boolean))].filter((id) => !receivedIds.has(id))
    : [];
  unavailableIds.forEach((rateRowId) => {
    entries.push({
      status: "blocked",
      missing_fields: ["approved_rateware:unavailable"],
      rate: { rate_row_id: rateRowId, approval_surface: "approved_rateware" }
    });
  });
  const blocked = entries.filter((entry) => entry.status !== "ready");
  return {
    schema_version: HANDOFF_SCHEMA_VERSION,
    mode: "observation_only",
    target_system: "marksman_erp",
    dispatch_authorized: false,
    financial_approval_authorized: false,
    invoice_authorized: false,
    payment_authorized: false,
    writeback_authorized: false,
    manual_entry_required: true,
    generated_at: new Date().toISOString(),
    status: entries.length && !blocked.length ? "ready" : "blocked",
    summary: { selected_rates: entries.length, ready_rates: entries.length - blocked.length, blocked_rates: blocked.length },
    rates: entries
  };
}
