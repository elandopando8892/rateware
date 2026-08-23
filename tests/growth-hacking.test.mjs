import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20260801031005_growth_hacking_mvp.sql");
const api = read("../supabase/functions/rateware-api/growth.ts");
const apiIndex = read("../supabase/functions/rateware-api/index.ts");
const service = read("../src/growth-service.js");
const client = read("../src/growth-hacking.js");
const page = read("../growth-hacking.html");
const shellModel = read("../src/platform55-shell-model.js");

for (const column of [
  "account_type", "data_status", "logistics_fit", "source_file_name",
  "source_list_name", "imported_at", "original_row_json"
]) {
  assert.match(migration, new RegExp(`add column if not exists ${column}`));
}

for (const column of ["first_name", "last_name", "persona", "buying_role", "email_quality"]) {
  assert.match(migration, new RegExp(`add column if not exists ${column}`));
}

for (const table of [
  "growth_segments", "growth_campaigns", "growth_campaign_members",
  "growth_campaign_messages", "growth_results"
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
}

assert.doesNotMatch(migration, /using\s*\(\s*true\s*\)/i);
assert.match(migration, /account_type in \('shipper', 'carrier', 'broker_forwarder', 'vendor', 'unknown'\)/);
assert.match(migration, /data_status in \('ready', 'needs_review', 'duplicate', 'excluded', 'not_shipper'\)/);

const actions = [
  "growth_dashboard", "import_growth_csv", "list_growth_segments",
  "preview_growth_segment", "save_growth_segment", "archive_growth_segment", "restore_growth_segment",
  "list_growth_campaigns", "get_growth_campaign", "save_growth_campaign",
  "save_growth_message", "refresh_growth_campaign_audience", "export_growth_campaign", "set_growth_campaign_status",
  "list_growth_results", "record_growth_result", "convert_growth_result",
  "growth_ai_action"
];
for (const action of actions) {
  assert.match(api, new RegExp(`"${action}"`));
  assert.match(service, new RegExp(`"${action}"`));
}

assert.match(apiIndex, /import \{ handleGrowthAction, isGrowthAction \} from "\.\/growth\.ts"/);
assert.match(apiIndex, /isGrowthAction\(growthAction\)/);
assert.match(apiIndex, /handleGrowthAction\(supabase, user, body\)/);

assert.match(api, /rows\.length > 5000/);
assert.match(api, /external_source_id/);
assert.match(api, /source_file_name/);
assert.match(api, /source_list_name/);
assert.match(api, /original_row_json/);
assert.match(api, /GENERIC_EMAIL_PREFIXES/);
assert.match(api, /duplicate_accounts/);
assert.match(api, /duplicate_contacts/);
assert.match(api, /sending_enabled: false/g);
assert.match(api, /GROWTH_NON_EXPORTABLE_MEMBER_STATUSES/);
assert.match(api, /GROWTH_SUPPRESSED_MEMBER_STATUSES/);
assert.match(api, /GROWTH_AUDIENCE_PRESERVED_MEMBER_STATUSES/);
assert.match(api, /function refreshGrowthCampaignAudience/);
assert.match(api, /Exported contacts, responses, bounces, opt-outs, and exclusions were preserved/);
assert.match(api, /hasGrowthDeliveryPath/);
assert.match(api, /growthDeliveryPaths/);
assert.match(api, /cleanLower\(member\.status\) === "ready"/);
assert.match(api, /execution_channel/);
assert.match(api, /execution_destination/);
assert.match(api, /available_delivery_channels/);
assert.match(api, /history_count/);
assert.match(api, /suppressed_count/);
assert.match(api, /cleanLower\(row\.data_status\) !== "excluded"/);
assert.match(api, /cleanLower\(account\.data_status\) !== "excluded"/);
assert.match(api, /query: cleanText\(input\.query \|\| input\.search\)/);
assert.match(api, /queryTokens\.every\(\(token\) => searchable\.includes\(token\)\)/);
assert.match(api, /flow: \["Shipper CRM", "Segmento", "Campana", "Resultados"\]/);
assert.match(api, /secondary_source: "CSV new leads -> Shipper CRM"/);
assert.match(api, /Mark it Ready or restore it before creating the campaign/);
assert.match(api, /status: "used"/);
assert.match(api, /No campaign members are ready to export/);
assert.match(api, /if \(outcome === "bounce"\) contactPatch\.email_quality = "invalid"/);
assert.match(api, /This result has already been converted/);
assert.match(api, /latestResultByMember/);
assert.match(api, /Create the opportunity from the result actions so the Shipper CRM record stays linked/);
assert.doesNotMatch(api, /\bfetch\s*\(/);
assert.doesNotMatch(`${api}\n${service}\n${client}`, /send_(?:gmail|whatsapp)|send_outreach_messages|generate_outreach_drafts/);

assert.match(api, /from\("shipper_opportunities"\)/);
assert.match(api, /from\("shipper_rfis"\)/);
assert.match(shellModel, /path: "\.\/growth-hacking\.html"/);

const tabs = [...page.matchAll(/data-growth-view="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(tabs, ["dashboard", "segments", "campaigns", "ai", "results"]);
assert.match(page, /id="download-campaign-messages-button"/);
assert.match(page, /id="refresh-campaign-audience-button"/);
assert.match(page, /id="download-campaign-review-button"/);
assert.match(page, /id="mark-campaign-launched-button"/);
assert.match(page, /id="export-campaign-button"/);
assert.match(page, /id="open-campaign-results-button"/);
assert.match(page, /id="campaign-next-action"/);
assert.match(page, /data-campaign-member-filter="history"/);
assert.match(page, /id="campaign-member-search"/);
assert.match(page, /id="result-metric-suppressed"/);
assert.match(page, /id="result-member-search"/);
assert.match(page, /id="result-member-count"/);
assert.match(page, /id="result-member-summary"/);
assert.match(page, /id="result-outcome-guide"/);
assert.match(page, /id="open-crm-audience-button"/);
assert.match(page, /id="dashboard-crm-audience-button"/);
assert.match(page, /id="segments-import-button"/);
assert.match(page, /id="segment-query"/);
assert.match(page, /CSV nuevos leads → CRM/);
assert.doesNotMatch(page, /id="open-import-button"/);
assert.match(page, /data-result-filter="convertible"/);
assert.match(page, /data-result-filter="closed"/);
assert.doesNotMatch(page, /value="opportunity_created"/);
assert.match(client, /setGrowthCampaignStatus\(state\.currentCampaignId, "launched"\)/);
assert.match(client, /data-create-campaign-segment/);
assert.match(client, /restoreGrowthSegment/);
assert.match(client, /Listos para exportar/);
assert.match(client, /campaignMemberBucket/);
assert.match(client, /campaignMemberReason/);
assert.match(client, /campaignMemberQuery/);
assert.match(client, /campaignMemberDeliveryChannels/);
assert.match(client, /campaignMemberDeliveryPaths/);
assert.match(client, /campaignLinkedInUrl/);
assert.match(client, /Historial protegido/);
assert.match(client, /linkedin_url \|\| contact\?\.contact_linkedin/);
assert.match(client, /downloadCampaignReview/);
assert.match(client, /refreshCampaignAudience/);
assert.match(client, /refreshGrowthCampaignAudience/);
assert.match(client, /campaignNextAction/);
assert.match(client, /openCampaignResults/);
assert.doesNotMatch(`${page}\n${client}`, /[\u00c3\u00c2\u00e2]/);
assert.match(client, /data-follow-up-result/);
assert.match(client, /RESULT_LABELS/);
assert.match(client, /RESULT_NEXT_ACTIONS/);
assert.match(client, /syncResultNextActionSuggestion/);
assert.match(client, /CONVERTIBLE_RESULT_OUTCOMES/);
assert.match(client, /resultBucket/);
assert.match(client, /renderResultCampaignMembers/);
assert.match(client, /renderResultMemberSummary/);
assert.match(client, /resultMemberQuery/);
assert.match(client, /No se enviará ningún mensaje/);
assert.match(client, /Shipper CRM es la fuente principal/);
assert.match(client, /query: clean\(\$\("#segment-query"\)\.value\)/);
assert.match(client, /Crear audiencia con esta lista/);

const columnsBlock = client.match(/const EXPORT_COLUMNS = \[([\s\S]*?)\];/);
assert.ok(columnsBlock, "Growth campaign export columns must be declared.");
const exportColumns = [...columnsBlock[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(exportColumns, [
  "campaign_name", "account_name", "domain", "contact_name", "first_name",
  "last_name", "title", "email", "phone", "linkedin_url", "persona",
  "logistics_fit", "execution_channel", "execution_destination", "available_delivery_channels", "email_1_subject", "email_1_body", "follow_up_1_subject",
  "follow_up_1_body", "follow_up_2_subject", "follow_up_2_body", "linkedin_note",
  "call_script", "whatsapp_message"
]);

const htmlIds = new Set([...page.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
const staticClientIds = new Set([...client.matchAll(/\$\("#([^"]+)"\)/g)].map((match) => match[1]));
for (const id of staticClientIds) {
  assert.ok(htmlIds.has(id), `Missing HTML element for #${id}`);
}

console.log("Growth Hacking MVP contract checks passed.");
