import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(".");
const apiSource = readFileSync(resolve(root, "supabase/functions/rateware-api/index.ts"), "utf8");
const vendorServiceSource = readFileSync(resolve(root, "src/vendor-service.js"), "utf8");
const vendorsSource = readFileSync(resolve(root, "src/vendors.js"), "utf8");
const vendorsHtml = readFileSync(resolve(root, "vendors.html"), "utf8");

assert.match(vendorServiceSource, /applyVendorTemplateUpdates/, "Vendor service should expose template update action");
assert.match(vendorServiceSource, /apply_vendor_template_updates/, "Vendor service should call apply_vendor_template_updates");

const actionStart = apiSource.indexOf('if (body.action === "apply_vendor_template_updates")');
const actionEnd = apiSource.indexOf('if (body.action === "remove_vendors")');
assert.ok(actionStart > -1, "API should expose apply_vendor_template_updates");
assert.ok(actionEnd > actionStart, "Template update action should be scoped before vendor removal");
const actionSource = apiSource.slice(actionStart, actionEnd);
assert.match(actionSource, /\.eq\("owner_email", user\.owner_email\)/, "Template updates must stay scoped to the current workspace owner");
assert.match(actionSource, /requireBulkConfirmation/, "Template updates should require confirmation when applying changes");
assert.match(actionSource, /vendorReferenceValues/, "Template updates should resolve vendors from domain, email, legal name, or vendor name");
assert.match(actionSource, /resolveVendorReferencesFromRows/, "Template updates should use the shared deterministic vendor matcher");
assert.match(actionSource, /Missing vendor_id, domain, email, legal_name, or vendor_name/, "Template updates should explain required identity fields when no vendor_id is present");
assert.match(actionSource, /No unique vendor match by domain, email, legal name, or vendor name/, "Template updates should reject ambiguous or missing commercial-name matches");
assert.match(actionSource, /matched_by/, "Template update preview should report how each vendor was matched");
assert.match(actionSource, /legal_name: cleanText\(current\?\.legal_name/, "Template update preview should include legal identity for correction exports");
assert.match(actionSource, /primary_email: normalizeEmail\(current\?\.primary_email/, "Template update preview should include primary email for correction exports");
assert.match(actionSource, /seenTemplateVendorIds/, "Template updates should track duplicate carrier matches inside one upload");
assert.match(actionSource, /Duplicate vendor update row in this template/, "Template updates should reject duplicate rows targeting the same carrier");
assert.match(actionSource, /clear_fields/, "Template updates should support explicit clear_fields");
assert.match(actionSource, /normalizeVendorPatch/, "Template updates should reuse vendor patch normalization");
assert.match(actionSource, /company name/, "API template parser should accept common English company-name headers");
assert.match(actionSource, /razón social/, "API template parser should accept Spanish legal-name headers");
assert.match(actionSource, /correo principal/, "API template parser should accept Spanish primary email headers");
assert.match(actionSource, /campos a limpiar/, "API template parser should accept Spanish clear-fields headers");

assert.match(vendorsSource, /downloadVendorUpdateTemplate/, "Vendors UI should download a CRM update template");
assert.match(vendorsSource, /parseVendorUpdateFile/, "Vendors UI should parse a CRM update file");
assert.match(vendorsSource, /renderVendorUpdatePreview/, "Vendors UI should preview updates before applying");
assert.match(vendorsSource, /const visibleRows = rows\.slice\(0, 100\)/, "Vendor update preview should render a bounded number of rows for large uploads");
assert.match(vendorsSource, /More rows not shown/, "Vendor update preview should disclose hidden preview rows");
assert.match(vendorsSource, /Error CSV and apply action still use the full reviewed file/, "Vendor update preview should clarify that hidden rows are still included in actions");
assert.match(vendorsSource, /row\.matched_by \|\| \(row\.vendor_id \? "vendor_id" : "unmatched"\)/, "Vendor update preview should show how each row matched");
assert.match(vendorsSource, /downloadVendorUpdateErrors/, "Vendors UI should export template update errors");
assert.match(vendorsSource, /\["row_number", "vendor_id", "vendor_name", "legal_name", "domain", "primary_email", "matched_by", "errors", "changed_fields"\]/, "Vendor update error CSV should include identity and match method");
assert.match(vendorsSource, /applyVendorTemplateUpdates\(pendingVendorUpdateRows, \{ dryRun: true \}\)/, "Vendors UI should dry-run template updates first");
assert.match(vendorsSource, /applyVendorTemplateUpdates\(pendingVendorUpdateRows, \{ dryRun: false \}\)/, "Vendors UI should apply reviewed template updates");
assert.match(vendorsSource, /company name/, "Vendor update parser should accept common English company-name headers");
assert.match(vendorsSource, /razón social/, "Vendor update parser should accept Spanish legal-name headers");
assert.match(vendorsSource, /correo principal/, "Vendor update parser should accept Spanish primary email headers");
assert.match(vendorsSource, /campos a limpiar/, "Vendor update parser should accept Spanish clear-fields headers");

assert.match(vendorsHtml, /download-vendor-update-template-button/, "Import tab should include CRM update template download");
assert.match(vendorsHtml, /vendor-update-import/, "Import tab should include CRM update upload");
assert.match(vendorsHtml, /vendor-update-preview-panel/, "Import tab should include CRM update preview panel");
assert.match(vendorsHtml, /<th>Matched by<\/th>/, "Vendor update preview table should expose the match method");
assert.match(vendorsHtml, /clear_fields/, "UI copy should explain clear_fields behavior");

console.log("vendor-template-update stability checks passed");
