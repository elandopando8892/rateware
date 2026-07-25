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
assert.match(actionSource, /vendor_id/, "Template updates should require vendor_id matching");
assert.match(actionSource, /clear_fields/, "Template updates should support explicit clear_fields");
assert.match(actionSource, /normalizeVendorPatch/, "Template updates should reuse vendor patch normalization");

assert.match(vendorsSource, /downloadVendorUpdateTemplate/, "Vendors UI should download a CRM update template");
assert.match(vendorsSource, /parseVendorUpdateFile/, "Vendors UI should parse a CRM update file");
assert.match(vendorsSource, /renderVendorUpdatePreview/, "Vendors UI should preview updates before applying");
assert.match(vendorsSource, /downloadVendorUpdateErrors/, "Vendors UI should export template update errors");
assert.match(vendorsSource, /applyVendorTemplateUpdates\(pendingVendorUpdateRows, \{ dryRun: true \}\)/, "Vendors UI should dry-run template updates first");
assert.match(vendorsSource, /applyVendorTemplateUpdates\(pendingVendorUpdateRows, \{ dryRun: false \}\)/, "Vendors UI should apply reviewed template updates");

assert.match(vendorsHtml, /download-vendor-update-template-button/, "Import tab should include CRM update template download");
assert.match(vendorsHtml, /vendor-update-import/, "Import tab should include CRM update upload");
assert.match(vendorsHtml, /vendor-update-preview-panel/, "Import tab should include CRM update preview panel");
assert.match(vendorsHtml, /clear_fields/, "UI copy should explain clear_fields behavior");

console.log("vendor-template-update stability checks passed");
