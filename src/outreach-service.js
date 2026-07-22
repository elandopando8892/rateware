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

export async function publishOutreachTemplateToWhatsapp(templateId) {
  return await callRatewareApi("publish_outreach_template_to_whatsapp", { template_id: templateId });
}

export async function syncOutreachWhatsappTemplates() {
  return await callRatewareApi("sync_whatsapp_templates");
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
    channel: options.channel || "",
    app_origin: options.appOrigin || window.location.origin,
    invitation_ids: options.invitationIds || [],
    sender_email: options.senderEmail || "",
    sender_label: options.senderLabel || "",
    sender_connection_status: options.senderConnectionStatus || "draft_only",
    whatsapp_target_mode: options.whatsappTargetMode || options.targetMode || "",
    group_delivery_policy: options.groupDeliveryPolicy || ""
  });
}

export async function fetchOutreachMessages(filters = {}) {
  return (await callRatewareApi("list_outreach_messages", filters)).rows;
}

export async function markOutreachMessages(ids = [], status) {
  return await callRatewareApi("mark_outreach_messages", { ids, status, confirmed: true });
}

export async function sendOutreachMessages(ids = [], options = {}) {
  return await callRatewareApi("send_outreach_messages", {
    ids,
    provider: "gmail",
    channel: "email",
    sender_email: options.senderEmail || "",
    confirmed: true
  });
}

export async function sendWhatsappOutreachMessages(ids = []) {
  return await callRatewareApi("send_whatsapp_outreach_messages", {
    ids,
    confirmed: true
  });
}

export async function sendWhatsappGroupOutreachMessages(ids = []) {
  return await callRatewareApi("send_whatsapp_group_outreach_messages", {
    ids,
    confirmed: true
  });
}

export async function markWhatsappGroupMessageManuallySent(ids = []) {
  return await callRatewareApi("mark_whatsapp_group_message_manually_sent", {
    ids,
    confirmed: true
  });
}

export async function deleteOutreachMessages(ids = []) {
  return await callRatewareApi("delete_outreach_messages", { ids, confirmed: true });
}

export async function fetchContactHistory(filters = {}) {
  return (await callRatewareApi("list_contact_history", filters)).rows;
}
