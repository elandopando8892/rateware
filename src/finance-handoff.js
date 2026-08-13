const HANDOFF_SCHEMA_VERSION = "rateware.finance_handoff.v1";

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

function positiveNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function sourceUploadId(row) {
  return text(row.raw_upload_id) || text(row.source_upload_id) || text(row.upload_id);
}

function vendorReference(row) {
  return text(row.vendor_id) || text(row.vendors?.id) || text(row.vendor_domain) || text(row.vendors?.domain);
}

function vendorName(row) {
  return text(row.vendors?.vendor_name) || text(row.vendor_name) || text(row.vendor_domain) || text(row.vendors?.domain);
}

function missingField(name, value) {
  return value === null ? name : null;
}

function buildRateHandoff(row) {
  const issues = [];
  if (!isPlainObject(row)) return { status: "blocked", missing_fields: ["rate_row:object"], rate: null };

  const rateRowId = text(row.id);
  const sourceUpload = sourceUploadId(row);
  const vendorRef = vendorReference(row);
  const vendor = vendorName(row);
  const origin = text(row.normalized_origin) || text(row.origin);
  const destination = text(row.normalized_destination) || text(row.destination);
  const commercialModel = text(row.commercial_model);
  const currency = text(row.currency)?.toUpperCase() || null;
  const allInRate = positiveNumber(row.all_in_rate);
  const carrierCostRate = positiveNumber(row.carrier_cost_rate);
  const customerBoardRate = positiveNumber(row.customer_board_rate);

  [
    missingField("rate_row_id", rateRowId),
    missingField("source_upload_id", sourceUpload),
    missingField("vendor_reference", vendorRef),
    missingField("vendor_name", vendor),
    missingField("origin", origin),
    missingField("destination", destination),
    missingField("commercial_model", commercialModel),
    missingField("currency", currency),
    missingField("all_in_rate:positive", allInRate)
  ].filter(Boolean).forEach((issue) => issues.push(issue));

  const spread = carrierCostRate !== null && customerBoardRate !== null
    ? Number((customerBoardRate - carrierCostRate).toFixed(2))
    : null;

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
      commercial: { commercial_model: commercialModel, currency, all_in_rate: allInRate, carrier_cost_rate: carrierCostRate, customer_board_rate: customerBoardRate, observed_spread: spread, valid_through: text(row.valid_through), quote_date: text(row.quote_date) },
      source_file: text(row.source_file),
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
