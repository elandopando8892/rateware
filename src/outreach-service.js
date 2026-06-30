import { callRatewareApi } from "./rateware-api.js";

export async function fetchOutreachTemplates() {
  return (await callRatewareApi("list_outreach_templates")).rows;
}

export async function createOutreachTemplate(template) {
  return (await callRatewareApi("create_outreach_template", { template })).row;
}

export async function updateOutreachTemplate(id, patch) {
  return (await callRatewareApi("update_outreach_template", { id, patch })).row;
}

export async function archiveOutreachTemplate(id) {
  return (await callRatewareApi("archive_outreach_template", { id })).row;
}

export async function deleteOutreachTemplate(id) {
  return (await callRatewareApi("delete_outreach_template", { id })).removed;
}

export async function duplicateOutreachTemplate(id) {
  return (await callRatewareApi("duplicate_outreach_template", { id })).row;
}

export async function fetchOutreachCampaigns() {
  return (await callRatewareApi("list_outreach_campaigns")).rows;
}

export async function createOutreachCampaign(campaign) {
  return (await callRatewareApi("create_outreach_campaign", { campaign })).row;
}

export async function updateOutreachCampaign(id, patch) {
  return (await callRatewareApi("update_outreach_campaign", { id, patch })).row;
}

export async function archiveOutreachCampaign(id) {
  return (await callRatewareApi("archive_outreach_campaign", { id })).row;
}

export async function deleteOutreachCampaign(id) {
  return (await callRatewareApi("delete_outreach_campaign", { id })).removed;
}

export async function duplicateOutreachCampaign(id) {
  return (await callRatewareApi("duplicate_outreach_campaign", { id })).row;
}

export async function generateOutreachDrafts(campaignId, options = {}) {
  return await callRatewareApi("generate_outreach_drafts", {
    campaign_id: campaignId,
    app_origin: options.appOrigin || window.location.origin,
    invitation_ids: options.invitationIds || []
  });
}

export async function fetchOutreachMessages(filters = {}) {
  return (await callRatewareApi("list_outreach_messages", filters)).rows;
}

export async function markOutreachMessages(ids = [], status) {
  return await callRatewareApi("mark_outreach_messages", { ids, status });
}

export async function fetchContactHistory(filters = {}) {
  return (await callRatewareApi("list_contact_history", filters)).rows;
}
