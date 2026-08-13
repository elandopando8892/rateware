import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFinanceHandoff } from "../src/finance-handoff.js";

const validRow = {
  id: "rate-1", raw_upload_id: "upload-1", vendor_id: "vendor-1", vendors: { vendor_name: "Carrier One" },
  origin: "Monterrey, NL", destination: "Laredo, TX", operation: "Cross-border", service: "Roundtrip", equipment: "Dry van",
  commercial_model: "brokerage", currency: "usd", all_in_rate: 2500, carrier_cost_rate: 2200, customer_board_rate: 2600,
  valid_through: "2026-09-01", source_file: "carrier-quote.xlsx"
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
