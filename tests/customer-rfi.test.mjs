import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/customer-rfi.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../customer-rfi.html", import.meta.url), "utf8");

assert.match(source, /EXCELJS_MODULE_URL/, "RFI template uses ExcelJS for workbook validations.");
assert.match(source, /function rfiImportDiagnostics\(/, "RFI imports provide a preflight diagnostic.");
assert.match(source, /dataValidations\.add\(/, "RFI template creates spreadsheet dropdown validations.");
assert.match(source, /workbook\.definedNames\.add\(/, "RFI template stores dropdowns as workbook named ranges.");
assert.match(source, /workbook\.definedNames\.add\(range,\s*name\)/, "RFI template registers named ranges with the ExcelJS address/name argument order.");
assert.match(source, /showDropDown:\s*false/, "RFI template keeps the dropdown arrow visible.");
assert.match(source, /showErrorMessage:\s*false/, "RFI template permits catalog overrides entered by the user.");
assert.match(source, /RFI_RUBRIC_RESPONSE_CATALOGS/, "RFI templates provide contextual dropdown suggestions for rubric responses.");
assert.match(source, /function rfiRubricResponseCatalog\(/, "RFI selects rubric response catalogs from the rubric context.");
assert.match(source, /function addRfiRubricResponseValidations\(/, "RFI applies a response dropdown to every exported rubric row.");
assert.match(source, /response \/ notes/, "RFI templates make the editable rubric response column explicit.");
assert.match(source, /formulae: \[`=\$\{validationName\}`\]/, "RFI named-list dropdowns use Excel's equals-prefixed named range syntax.");
assert.match(source, /Validation Lists/, "RFI template contains a dedicated validation-list sheet.");
assert.match(source, /PACKAGING_OPTIONS|SOURCING_PRIORITY_OPTIONS|SEASONALITY_OPTIONS/, "RFI template catalogs operational fields that previously had no dropdown.");
assert.match(source, /Route Schedule/, "RFI workbook contains the route schedule sheet.");
assert.match(source, /Rubric Checklist/, "RFI workbook contains the carrier-confirmation rubric sheet.");
assert.match(source, /function downloadRfiSegmentTemplate\(/, "RFI can download a template for the active operating segment.");
assert.match(source, /function hasLoadedActiveRfiSegment\(/, "segment template requires a loaded signed RFI segment.");
assert.match(source, /Open a signed RFI link and select an operating segment/, "segment template explains missing signed context.");
assert.match(source, /function importRfiSegmentWorkbook\(/, "RFI can import a completed segment template.");
assert.match(source, /Segment Details/, "Segment template stores editable segment identity details.");
assert.match(source, /segment-v1/, "Segment template has an explicit version marker.");
assert.match(source, /rfi-import-as-new-segment/, "Segment import can create a separate segment for similar operations.");
assert.match(source, /rubric_template_key/, "Imported segments preserve the rubric source segment.");
assert.match(source, /rateware-segment-/, "Segment downloads use a segment-specific filename.");
assert.match(html, /id="download-rfi-segment-template"/, "RFI exposes the active-segment template download action.");
assert.match(html, /id="import-rfi-segment-template"/, "RFI exposes the segment template import action.");
assert.match(html, /id="rfi-segment-template-name"/, "RFI exposes an editable segment name.");
assert.match(html, /id="rfi-import-as-new-segment"/, "RFI exposes the create-new-segment option.");
assert.match(html, /id="rfi-segment-template-state"/, "RFI exposes segment template readiness state.");
assert.match(source, /function canonicalSegmentKey\(/, "Legacy RFI segment values are normalized safely.");
assert.match(source, /function speakRfiHelp\(/, "The field guide provides browser audio support.");

for (const segment of [
  "local_ftl",
  "regional_ftl",
  "national_ftl",
  "crossborder",
  "expedited",
  "time_critical",
  "port_drayage_us",
  "port_drayage_mx"
]) {
  assert.match(html, new RegExp(`value="${segment}"`), `RFI scope includes ${segment}.`);
}

console.log("Customer RFI template, segment workspace, and import safeguards passed.");
