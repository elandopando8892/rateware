import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const [organizationsPath, peoplePath, dealsPath] = process.argv.slice(2);
if (!organizationsPath || !peoplePath || !dealsPath) {
  throw new Error("Usage: node tools/build-shipper-crm-import-kit.mjs <organizations.xlsx> <people.xlsx> <deals.xlsx>");
}

const outputDir = path.resolve("output");
const outputPath = path.join(outputDir, "rateware-shipper-crm-migration-kit.xlsx");

async function loadRows(filePath) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(filePath));
  const sheet = workbook.worksheets.getItemAt(0);
  const values = sheet.getUsedRange(true).values;
  const headers = values[0].map((value) => String(value ?? "").trim());
  return values.slice(1).filter((row) => row.some((value) => value !== null && value !== "")).map((row) => {
    return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
  });
}

function value(row, key) {
  const item = row[key];
  return item === null || item === undefined ? "" : String(item).trim();
}

function normalizeDomain(url) {
  const normalized = String(url ?? "").trim().toLowerCase();
  if (!normalized) return "";
  return normalized.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

function mapAccountStage(label) {
  const text = String(label ?? "").toLowerCase();
  if (text.includes("customer") || text.includes("client")) return "customer";
  if (text.includes("qualified") || text.includes("warm")) return "qualified";
  if (text.includes("risk")) return "at_risk";
  if (text.includes("inactive")) return "inactive";
  return "target";
}

function mapOpportunityStage(stage, status) {
  const text = `${stage} ${status}`.toLowerCase();
  if (text.includes("won")) return "won";
  if (text.includes("lost")) return "lost";
  if (text.includes("negotiat")) return "negotiation";
  if (text.includes("proposal") || text.includes("onboard")) return "proposal";
  if (text.includes("rfx") || text.includes("rfq") || text.includes("bid")) return "rfx";
  if (text.includes("rfi")) return "rfi";
  if (text.includes("intro") || text.includes("discovery") || text.includes("call")) return "discovery";
  return "identified";
}

function splitLabels(text) {
  return String(text ?? "").split(/[,;|]/).map((item) => item.trim()).filter(Boolean).join(", ");
}

function columnName(columnNumber) {
  let remaining = columnNumber;
  let result = "";
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return result;
}

const [organizationRows, peopleRows, dealRows] = await Promise.all([
  loadRows(organizationsPath),
  loadRows(peoplePath),
  loadRows(dealsPath),
]);

const accounts = organizationRows.map((row) => ({
  external_account_id: value(row, "Organization - ID"),
  account_name: value(row, "Organization - Name"),
  legal_name: "",
  domain: normalizeDomain(value(row, "Organization - Website")),
  website: value(row, "Organization - Website"),
  linkedin_url: value(row, "Organization - LinkedIn profile"),
  industry: value(row, "Organization - Industry"),
  account_owner: value(row, "Organization - Owner"),
  status: "active",
  relationship_stage: mapAccountStage(value(row, "Organization - Label")),
  labels: splitLabels(value(row, "Organization - Labels") || value(row, "Organization - Label")),
  headquarters_address: value(row, "Organization - Full/combined address of Address") || value(row, "Organization - Address"),
  headquarters_city: value(row, "Organization - City/town/village/locality of Address"),
  headquarters_state: value(row, "Organization - State/county of Address"),
  headquarters_region: value(row, "Organization - Region of Address"),
  headquarters_country: value(row, "Organization - Country of Address"),
  headquarters_postal_code: value(row, "Organization - ZIP/Postal code of Address"),
  annual_revenue: value(row, "Organization - Annual revenue"),
  employee_count: value(row, "Organization - Number of employees"),
  tax_id: value(row, "Organization - TAX ID"),
  dot_mc: value(row, "Organization - DOT/MC"),
  scac_caat: value(row, "Organization - SCAC / CAAT"),
  equipment_type: value(row, "Organization - Equipment Type"),
  scope_of_service: value(row, "Organization - Scope of Service"),
  open_deals: value(row, "Organization - Open deals"),
  activities_to_do: value(row, "Organization - Activities to do"),
  next_activity_date: value(row, "Organization - Next activity date"),
  last_activity_date: value(row, "Organization - Last activity date"),
  source_created_at: value(row, "Organization - Organization created"),
  source_updated_at: value(row, "Organization - Update time"),
}));

const contacts = peopleRows.map((row) => ({
  external_contact_id: value(row, "Person - ID"),
  external_account_id: value(row, "Person - Organization ID"),
  contact_name: value(row, "Person - Name"),
  first_name: value(row, "Person - First name"),
  last_name: value(row, "Person - Last name"),
  title: value(row, "Person - Job title"),
  work_email: value(row, "Person - Email - Work"),
  home_email: value(row, "Person - Email - Home"),
  other_email: value(row, "Person - Email - Other"),
  work_phone: value(row, "Person - Phone - Work"),
  mobile_phone: value(row, "Person - Phone - Mobile"),
  home_phone: value(row, "Person - Phone - Home"),
  other_phone: value(row, "Person - Phone - Other"),
  instant_messenger: value(row, "Person - Instant messenger"),
  labels: splitLabels(value(row, "Person - Labels") || value(row, "Person - Label")),
  postal_address: value(row, "Person - Full/combined address of Postal address") || value(row, "Person - Postal address"),
  city: value(row, "Person - City/town/village/locality of Postal address"),
  state: value(row, "Person - State/county of Postal address"),
  region: value(row, "Person - Region of Postal address"),
  country: value(row, "Person - Country of Postal address"),
  postal_code: value(row, "Person - ZIP/Postal code of Postal address"),
  notes: value(row, "Person - Notes"),
  source_created_at: value(row, "Person - Person created"),
  source_updated_at: value(row, "Person - Update time"),
}));

const opportunities = dealRows.map((row) => ({
  external_opportunity_id: value(row, "Deal - ID"),
  external_account_id: value(row, "Deal - Organization ID"),
  external_contact_id: value(row, "Deal - Contact person ID"),
  opportunity_name: value(row, "Deal - Title"),
  pipeline: value(row, "Deal - Pipeline"),
  source_stage: value(row, "Deal - Stage"),
  stage: mapOpportunityStage(value(row, "Deal - Stage"), value(row, "Deal - Status")),
  status: value(row, "Deal - Status"),
  owner: value(row, "Deal - Owner"),
  creator: value(row, "Deal - Creator"),
  labels: splitLabels(value(row, "Deal - Label")),
  domain: value(row, "Deal - Domain"),
  weighted_value: value(row, "Deal - Weighted value"),
  weighted_value_currency: value(row, "Deal - Currency of Weighted value"),
  value: value(row, "Deal - Value"),
  currency: value(row, "Deal - Currency of Value"),
  probability: value(row, "Deal - Probability"),
  expected_close_date: value(row, "Deal - Expected close date"),
  next_action_date: value(row, "Deal - Next activity date"),
  last_activity_date: value(row, "Deal - Last activity date"),
  lost_reason: value(row, "Deal - Lost reason"),
  source_origin: value(row, "Deal - Source origin"),
  source_channel: value(row, "Deal - Source channel"),
  product_name: value(row, "Deal - Product name"),
  product_quantity: value(row, "Deal - Product quantity"),
  product_amount: value(row, "Deal - Product amount"),
  mrr: value(row, "Deal - MRR"),
  arr: value(row, "Deal - ARR"),
  acv: value(row, "Deal - ACV"),
  operational_pain: value(row, "Deal - 1. Dolor Operativo"),
  frequency: value(row, "Deal - 2. Frecuencia"),
  monthly_economic_impact: value(row, "Deal - 3. Impacto Económico Mensual"),
  execution_capacity: value(row, "Deal - 4. Capacidad de Ejecución"),
  urgency: value(row, "Deal - 5. Urgencia"),
  fit: value(row, "Deal - 6. Fit"),
  risk_score: value(row, "Deal - Risk Score"),
  decision: value(row, "Deal - Decision"),
  credit_conditions: value(row, "Deal - Credit Conditions"),
  compliance_criteria: value(row, "Deal - Compliance Criteria"),
  quality_scorecard: value(row, "Deal - Quality Scorecard"),
  onboarding_decision: value(row, "Deal - Onboarding Decision"),
  lead_status: value(row, "Deal - Lead status"),
  lead_score: value(row, "Deal - Lead Score"),
  document_review: value(row, "Deal - Document Review"),
  risk_level: value(row, "Deal - Risk Level"),
  solution_discussion: value(row, "Deal - Solution Discussion"),
  signed_contract: value(row, "Deal - Signed Contract"),
  approved_for_network: value(row, "Deal - Approved for Network"),
  tms_setup: value(row, "Deal - TMS Setup"),
  erp_setup: value(row, "Deal - ERP Setup"),
  go_live: value(row, "Deal - Go Live"),
  source_created_at: value(row, "Deal - Deal created"),
  source_updated_at: value(row, "Deal - Update time"),
}));

const workbook = Workbook.create();
const navy = "#17365D";
const blue = "#1F4E78";
const paleBlue = "#D9EAF7";
const paleGreen = "#E2F0D9";
const paleYellow = "#FFF2CC";
const border = "#B7C9DA";

function writeTable(sheetName, rows, title, subtitle) {
  const sheet = workbook.worksheets.add(sheetName);
  const headers = Object.keys(rows[0] ?? {});
  const lastColumn = columnName(headers.length);
  sheet.getRange("A1").values = [[title]];
  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.getRange("A1").format = { fill: navy, font: { bold: true, color: "#FFFFFF", size: 14 }, verticalAlignment: "center" };
  sheet.getRange("A1").format.rowHeight = 26;
  sheet.getRange("A2").values = [[subtitle]];
  sheet.mergeCells(`A2:${lastColumn}2`);
  sheet.getRange("A2").format = { fill: paleBlue, font: { color: navy, italic: true }, wrapText: true, verticalAlignment: "center" };
  sheet.getRange("A2").format.rowHeight = 32;
  sheet.getRangeByIndexes(3, 0, 1, headers.length).values = [headers];
  sheet.getRangeByIndexes(3, 0, 1, headers.length).format = { fill: blue, font: { bold: true, color: "#FFFFFF" }, wrapText: true, horizontalAlignment: "center", verticalAlignment: "center", borders: { style: "continuous", color: border } };
  sheet.getRangeByIndexes(3, 0, 1, headers.length).format.rowHeight = 36;
  if (rows.length) {
    sheet.getRangeByIndexes(4, 0, rows.length, headers.length).values = rows.map((row) => headers.map((header) => row[header]));
    sheet.getRangeByIndexes(4, 0, rows.length, headers.length).format = { wrapText: true, verticalAlignment: "top", borders: { style: "continuous", color: "#D9E2F3" } };
    sheet.getRangeByIndexes(4, 0, rows.length, headers.length).format.rowHeight = 30;
    sheet.getRangeByIndexes(4, 0, rows.length, headers.length).format.autofitColumns();
  }
  const used = sheet.getUsedRange();
  used.format.wrapText = true;
  sheet.getRangeByIndexes(0, 0, used.rowCount, Math.min(headers.length, 3)).format.columnWidth = 18;
  sheet.freezePanes.freezeRows(4);
  sheet.showGridLines = false;
  return { sheet, headers };
}

const guide = workbook.worksheets.add("Import Guide");
const guideRows = [
  ["Rateware Shipper CRM migration kit"],
  ["Purpose", "Preserve the relationship between CRM accounts, contacts, and commercial opportunities during migration."],
  ["Source coverage", `${accounts.length} accounts, ${contacts.length} contacts, and ${opportunities.length} opportunities normalized from the supplied exports.`],
  ["Primary keys", "external_account_id, external_contact_id, and external_opportunity_id preserve original CRM identity. Do not change them during review."],
  ["Linking rule", "Contacts join Accounts through external_account_id. Opportunities join both the Account and the primary Contact through their external IDs."],
  ["Current app support", "Rateware imports this relational workbook directly: Accounts first, then Contacts and Opportunities linked through external_account_id. Re-importing the same external IDs updates existing records instead of duplicating them."],
  ["Review before import", "Complete blank domains when known, validate account ownership, and review opportunity stage mapping before saving into the workspace."],
  ["Safety", "Do not remove external IDs. Duplicate resolution should use domain first, then a manual account review when no domain exists."],
];
guide.getRangeByIndexes(0, 0, guideRows.length, 2).values = guideRows;
guide.mergeCells("A1:B1");
guide.getRange("A1:B1").format = { fill: navy, font: { bold: true, color: "#FFFFFF", size: 14 }, verticalAlignment: "center" };
guide.getRange("A1:B1").format.rowHeight = 28;
guide.getRange("A2:A8").format = { fill: paleBlue, font: { bold: true, color: navy }, verticalAlignment: "top", wrapText: true, borders: { style: "continuous", color: border } };
guide.getRange("B2:B8").format = { wrapText: true, verticalAlignment: "top", borders: { style: "continuous", color: border } };
guide.getRange("A1:B8").format.rowHeight = 40;
guide.getRange("A:A").format.columnWidth = 24;
guide.getRange("B:B").format.columnWidth = 95;
guide.showGridLines = false;

writeTable("Accounts", accounts, "Accounts / Organizations", "One row per customer or prospect organization. `external_account_id` is the source-system key used by Contacts and Opportunities.");
writeTable("Contacts", contacts, "Contacts / People", "One row per contact. `external_account_id` must match the parent row in Accounts.");
writeTable("Opportunities", opportunities, "Opportunities / Deals", "One row per commercial deal. `stage` is normalized for Rateware; `source_stage` preserves the original CRM stage.");

const mappings = [
  ["Entity", "Rateware field", "Source export field", "Import role", "Notes"],
  ["Account", "external_account_id", "Organization - ID", "Required relationship key", "Preserves source identity and joins Contacts/Opportunities."],
  ["Account", "account_name", "Organization - Name", "Required", "Customer account / legal entity display name."],
  ["Account", "labels", "Organization - Labels", "Optional", "Comma-separated tags preserved for segmentation."],
  ["Account", "headquarters_*", "Organization - Address fields", "Optional", "Structured address, city, state, country and postal code."],
  ["Contact", "external_contact_id", "Person - ID", "Required relationship key", "Preserves person identity."],
  ["Contact", "external_account_id", "Person - Organization ID", "Required relationship key", "Links the contact to its customer account."],
  ["Contact", "work_email / mobile_phone", "Person - Email - Work / Phone - Mobile", "Optional", "Keep all valid channels; do not discard secondary information."],
  ["Opportunity", "external_opportunity_id", "Deal - ID", "Required relationship key", "Preserves deal identity."],
  ["Opportunity", "external_account_id", "Deal - Organization ID", "Required relationship key", "Links deal to customer account."],
  ["Opportunity", "external_contact_id", "Deal - Contact person ID", "Optional relationship key", "Links deal to primary business contact when present."],
  ["Opportunity", "stage", "Deal - Stage + Deal - Status", "Normalized", "Maps to identified, discovery, rfi, rfx, proposal, negotiation, won, lost."],
  ["Opportunity", "commercial score fields", "Deal - 1 through 6, Risk Score, Decision", "Optional", "Retains qualification, risk, compliance, onboarding and go-live evidence."],
];
const mappingSheet = workbook.worksheets.add("Source Mapping");
mappingSheet.getRangeByIndexes(0, 0, mappings.length, mappings[0].length).values = mappings;
mappingSheet.getRange("A1:E1").format = { fill: navy, font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
mappingSheet.getRange("A1:E1").format.rowHeight = 32;
mappingSheet.getRange("A2:E13").format = { wrapText: true, verticalAlignment: "top", borders: { style: "continuous", color: border } };
mappingSheet.getRange("A:E").format.autofitColumns();
mappingSheet.getRange("E:E").format.columnWidth = 52;
mappingSheet.freezePanes.freezeRows(1);
mappingSheet.showGridLines = false;

const stageSheet = workbook.worksheets.add("Stage Map");
const stageRows = [
  ["Source signals", "Rateware opportunity stage", "Reason"],
  ["Schedule intro call / Discovery", "discovery", "Active initial qualification."],
  ["RFI", "rfi", "Customer scope or RFI collection."],
  ["RFx / RFQ / Bid", "rfx", "Commercial tender or bid workflow."],
  ["Proposal / Proceed to onboard", "proposal", "Commercial proposal or onboarding path."],
  ["Negotiation", "negotiation", "Commercial terms under discussion."],
  ["Won", "won", "Commercially won."],
  ["Lost", "lost", "Commercially lost."],
  ["Other / empty", "identified", "Needs qualification."],
];
stageSheet.getRangeByIndexes(0, 0, stageRows.length, 3).values = stageRows;
stageSheet.getRange("A1:C1").format = { fill: navy, font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
stageSheet.getRange("A2:C9").format = { wrapText: true, borders: { style: "continuous", color: border } };
stageSheet.getRange("A:A").format.columnWidth = 32;
stageSheet.getRange("B:B").format.columnWidth = 24;
stageSheet.getRange("C:C").format.columnWidth = 48;
stageSheet.showGridLines = false;

const summary = workbook.worksheets.add("Summary");
summary.getRange("A1:D1").values = [["Rateware Shipper CRM migration summary", "", "", ""]];
summary.mergeCells("A1:D1");
summary.getRange("A1:D1").format = { fill: navy, font: { bold: true, color: "#FFFFFF", size: 16 }, verticalAlignment: "center" };
summary.getRange("A1:D1").format.rowHeight = 30;
summary.getRange("A3:D6").values = [
  ["Accounts", accounts.length, "External account IDs", accounts.filter((row) => row.external_account_id).length],
  ["Contacts", contacts.length, "Linked to account", contacts.filter((row) => row.external_account_id).length],
  ["Opportunities", opportunities.length, "Linked to account", opportunities.filter((row) => row.external_account_id).length],
  ["Opportunity contact links", opportunities.filter((row) => row.external_contact_id).length, "Stage mappings", opportunities.filter((row) => row.stage !== "identified").length],
];
summary.getRange("A3:D6").format = { borders: { style: "continuous", color: border }, verticalAlignment: "center" };
summary.getRange("A3:A6").format = { fill: paleBlue, font: { bold: true, color: navy } };
summary.getRange("C3:C6").format = { fill: paleGreen, font: { bold: true, color: navy } };
summary.getRange("A3:D6").format.rowHeight = 28;
summary.getRange("A:D").format.columnWidth = 28;
summary.getRange("A8:D10").values = [
  ["Recommended import order", "1. Accounts", "2. Contacts", "3. Opportunities"],
  ["Recommended review", "Resolve missing domains", "Confirm owner and stage mapping"],
  ["Deduplication", "Domain first", "Manual review when source domain is blank"],
];
summary.getRange("A8:D10").format = { wrapText: true, borders: { style: "continuous", color: border }, verticalAlignment: "center" };
summary.getRange("A8:D8").format = { fill: paleYellow, font: { bold: true, color: navy } };
summary.getRange("A8:D10").format.rowHeight = 30;
summary.showGridLines = false;

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ outputPath, accounts: accounts.length, contacts: contacts.length, opportunities: opportunities.length }, null, 2));
