import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFinanceHandoff } from "../src/finance-handoff.js";

const validRow = {
  id: "rate-1", status: "approved", raw_upload_id: "upload-1", vendor_id: "vendor-1", vendors: { vendor_name: "Carrier One" },
  origin: "Monterrey, NL", destination: "Laredo, TX", operation: "Cross-border", service: "Roundtrip", equipment: "Dry van",
  commercial_model: "brokerage", currency: "usd", all_in_rate: 2500, carrier_cost_rate: 2200, customer_board_rate: 2600,
  valid_through: "2026-09-01"
};

const ready = buildFinanceHandoff([validRow]);
assert.equal(ready.schema_version, "rateware.finance_handoff.v1");
assert.equal(ready.mode, "observation_only");
assert.equal(ready.target_system, "marksman_erp");
assert.equal(ready.status, "ready");
assert.equal(ready.financial_approval_authorized, false);
assert.equal(ready.invoice_authorized, false);
assert.equal(ready.payment_authorized, false);
assert.equal(ready.writeback_authorized, false);
assert.equal(ready.manual_entry_required, true);
assert.equal(ready.rates[0].rate.commercial.currency, "USD");
assert.equal(ready.rates[0].rate.commercial.observed_spread, 400);
assert.equal(ready.rates[0].rate.vendor.reference, "vendor-1");

const blocked = buildFinanceHandoff([{ ...validRow, vendor_id: "", raw_upload_id: null, all_in_rate: 0 }]);
assert.equal(blocked.status, "blocked");
assert.deepEqual(blocked.rates[0].missing_fields, ["source_upload_id", "vendor_reference", "all_in_rate:positive"]);

const optionalCommercialValuesAbsent = buildFinanceHandoff([{
  ...validRow,
  carrier_cost_rate: null,
  customer_board_rate: "",
  quote_date: undefined,
  valid_through: null
}]);
assert.equal(optionalCommercialValuesAbsent.status, "ready");
assert.equal(optionalCommercialValuesAbsent.rates[0].rate.commercial.carrier_cost_rate, null);
assert.equal(optionalCommercialValuesAbsent.rates[0].rate.commercial.customer_board_rate, null);

for (const value of ["X", 0, -1, true, "0x10", "1e3", "NaN", "Infinity"]) {
  const invalidAllIn = buildFinanceHandoff([{ ...validRow, all_in_rate: value }]);
  assert.equal(invalidAllIn.status, "blocked", `all-in ${String(value)} must fail closed`);
  assert.ok(invalidAllIn.rates[0].missing_fields.includes("all_in_rate:positive"));

  const invalidCarrierCost = buildFinanceHandoff([{ ...validRow, carrier_cost_rate: value }]);
  assert.equal(invalidCarrierCost.status, "blocked", `carrier cost ${String(value)} must fail closed`);
  assert.ok(invalidCarrierCost.rates[0].missing_fields.includes("carrier_cost_rate:positive"));

  const invalidCustomerBoard = buildFinanceHandoff([{ ...validRow, customer_board_rate: value }]);
  assert.equal(invalidCustomerBoard.status, "blocked", `customer board ${String(value)} must fail closed`);
  assert.ok(invalidCustomerBoard.rates[0].missing_fields.includes("customer_board_rate:positive"));
}

const decimalStrings = buildFinanceHandoff([{
  ...validRow,
  all_in_rate: "2500.50",
  carrier_cost_rate: "2200.25",
  customer_board_rate: "2600.75"
}]);
assert.equal(decimalStrings.status, "ready");
assert.equal(decimalStrings.rates[0].rate.commercial.all_in_rate, 2500.5);
assert.equal(decimalStrings.rates[0].rate.commercial.observed_spread, 400.5);

for (const [field, value, issue] of [
  ["quote_date", "tomorrow", "quote_date:date"],
  ["quote_date", "0000-01-01", "quote_date:date"],
  ["quote_date", "2026-02-31", "quote_date:date"],
  ["valid_through", "09/01/2026", "valid_through:date"],
  ["valid_through", 20260901, "valid_through:date"]
]) {
  const invalidDate = buildFinanceHandoff([{ ...validRow, [field]: value }]);
  assert.equal(invalidDate.status, "blocked", `${field} ${String(value)} must fail closed`);
  assert.ok(invalidDate.rates[0].missing_fields.includes(issue));
}

const validLeapDate = buildFinanceHandoff([{ ...validRow, quote_date: "2028-02-29", valid_through: "2028-03-01" }]);
assert.equal(validLeapDate.status, "ready");

const reversedDateRange = buildFinanceHandoff([{ ...validRow, quote_date: "2026-09-02", valid_through: "2026-09-01" }]);
assert.equal(reversedDateRange.status, "blocked");
assert.ok(reversedDateRange.rates[0].missing_fields.includes("valid_through:not_before_quote_date"));

const nonCanonicalVendor = buildFinanceHandoff([{
  ...validRow,
  vendor_id: null,
  vendors: null,
  vendor_domain: "carrier.example"
}]);
assert.equal(nonCanonicalVendor.status, "blocked");
assert.ok(nonCanonicalVendor.rates[0].missing_fields.includes("vendor_reference"));
assert.ok(nonCanonicalVendor.rates[0].missing_fields.includes("vendor_name"));

const nonCanonicalUpload = buildFinanceHandoff([{ ...validRow, raw_upload_id: null, upload_id: "legacy-upload" }]);
assert.equal(nonCanonicalUpload.status, "blocked");
assert.ok(nonCanonicalUpload.rates[0].missing_fields.includes("source_upload_id"));

const unapproved = buildFinanceHandoff([{ ...validRow, status: "pending_review" }]);
assert.equal(unapproved.status, "blocked");
assert.ok(unapproved.rates[0].missing_fields.includes("rate_status:approved"));

const negativeSpread = buildFinanceHandoff([{ ...validRow, carrier_cost_rate: 2700, customer_board_rate: 2600 }]);
assert.equal(negativeSpread.status, "blocked");
assert.ok(negativeSpread.rates[0].missing_fields.includes("observed_spread:nonnegative"));

for (const currency of ["N/A", "X", "US", "EUR", "Please Estimate"]) {
  const invalidCurrency = buildFinanceHandoff([{ ...validRow, currency }]);
  assert.equal(invalidCurrency.status, "blocked", `currency ${currency} must fail closed`);
  assert.ok(invalidCurrency.rates[0].missing_fields.includes("currency:supported"));
}

for (const commercialModel of ["N/A", "X", "Please Estimate", "unknown_model"]) {
  const invalidModel = buildFinanceHandoff([{ ...validRow, commercial_model: commercialModel }]);
  assert.equal(invalidModel.status, "blocked", `model ${commercialModel} must fail closed`);
  assert.ok(invalidModel.rates[0].missing_fields.includes("commercial_model:canonical"));
}

for (const [input, expected] of [
  ["direct_cost_plus", "cost_plus"],
  ["carrier_share", "sell_share"],
  ["xbf_buy_sell", "brokerage"]
]) {
  const normalized = buildFinanceHandoff([{ ...validRow, commercial_model: input }]);
  assert.equal(normalized.status, "ready");
  assert.equal(normalized.rates[0].rate.commercial.commercial_model, expected);
}

const malformed = buildFinanceHandoff([null]);
assert.equal(malformed.status, "blocked");
assert.deepEqual(malformed.rates[0].missing_fields, ["rate_row:object"]);

const unavailable = buildFinanceHandoff([validRow], { expectedIds: ["rate-1", "rate-2"] });
assert.equal(unavailable.status, "blocked");
assert.equal(unavailable.summary.blocked_rates, 1);
assert.deepEqual(unavailable.rates[1], {
  status: "blocked",
  missing_fields: ["approved_rateware:unavailable"],
  rate: { rate_row_id: "rate-2", approval_surface: "approved_rateware" }
});

const ratewareHtml = readFileSync(new URL("../rateware.html", import.meta.url), "utf8");
const ratewareSource = readFileSync(new URL("../src/rateware.js", import.meta.url), "utf8");
assert.match(ratewareHtml, /id="prepare-finance-handoff"/);
assert.match(ratewareSource, /buildFinanceHandoff/);
assert.match(ratewareSource, /prepareFinanceHandoffButton\?\.addEventListener\("click", prepareFinanceHandoff\)/);
assert.match(ratewareSource, /fetchSelectedRatewareRows\(\)/);

console.log("finance handoff tests passed");
