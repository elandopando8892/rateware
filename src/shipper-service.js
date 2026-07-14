import { callRatewareApi } from "./rateware-api.js";

export async function fetchShipperSummary() {
  return await callRatewareApi("shipper_crm_summary");
}

export async function fetchShippers(filters = {}) {
  return await callRatewareApi("list_shippers", filters);
}

export async function fetchShipperRelationshipPipeline(filters = {}) {
  return await callRatewareApi("shipper_relationship_pipeline", filters);
}

export async function fetchShipperCommercialWork(filters = {}) {
  return await callRatewareApi("shipper_commercial_work", filters);
}

export async function fetchShipperActionQueue(filters = {}) {
  return await callRatewareApi("shipper_action_queue", filters);
}

export async function fetchShipperIntelligence(filters = {}) {
  return await callRatewareApi("shipper_intelligence", filters);
}

export async function fetchShipper(id) {
  return await callRatewareApi("get_shipper", { id });
}

export async function fetchShipperAccountActivity(id) {
  return await callRatewareApi("shipper_account_activity", { id });
}

export async function createShipperProfileRequest(id, options = {}) {
  return await callRatewareApi("create_shipper_profile_request", { shipper_id: id, ...options });
}

export async function revokeShipperProfileRequest(id) {
  return await callRatewareApi("revoke_shipper_profile_request", { id });
}

export async function createShipper(shipper) {
  return (await callRatewareApi("create_shipper", { shipper })).row;
}

export async function importShippers(rows) {
  return await callRatewareApi("import_shippers", { rows, confirmed: true });
}

export async function importShipperCrmWorkbook(workbook) {
  return await callRatewareApi("import_shipper_crm_workbook", { ...workbook, confirmed: true });
}

export async function fetchShipperDuplicates() {
  return await callRatewareApi("list_shipper_duplicates");
}

export async function mergeShipperAccounts(primaryShipperId, duplicateShipperId) {
  return await callRatewareApi("merge_shipper_accounts", {
    primary_shipper_id: primaryShipperId,
    duplicate_shipper_id: duplicateShipperId,
    confirmed: true
  });
}

export async function updateShipper(id, patch) {
  return (await callRatewareApi("update_shipper", { id, patch })).row;
}

export async function moveShipperRelationshipStage(id, relationshipStage) {
  return (await callRatewareApi("move_shipper_relationship_stage", {
    id,
    relationship_stage: relationshipStage
  })).row;
}

export async function promoteShipperRfiToOpportunity(rfiId) {
  return await callRatewareApi("promote_shipper_rfi_to_opportunity", { rfi_id: rfiId });
}

export async function moveShipperOpportunityStage(id, stage) {
  return (await callRatewareApi("move_shipper_opportunity_stage", { id, stage })).row;
}

export async function launchShipperOpportunityRfx(id) {
  return await callRatewareApi("launch_shipper_opportunity_rfx", { id });
}

export async function archiveShippers(ids) {
  return await callRatewareApi("archive_shippers", { ids, confirmed: true });
}

export async function saveShipperRecord(entity, shipperId, row, id = null) {
  return (await callRatewareApi("save_shipper_record", {
    entity,
    shipper_id: shipperId,
    id,
    row
  })).row;
}

export async function deleteShipperRecord(entity, shipperId, id) {
  return (await callRatewareApi("delete_shipper_record", {
    entity,
    shipper_id: shipperId,
    id
  })).row;
}

export async function applyShipperActionPlaybook(shipperId, playbook, ownerEmailAssignee = "") {
  return await callRatewareApi("apply_shipper_action_playbook", {
    shipper_id: shipperId,
    playbook,
    owner_email_assignee: ownerEmailAssignee
  });
}

export async function updateShipperAccountActionStatus(id, status) {
  return (await callRatewareApi("update_shipper_account_action_status", { id, status })).row;
}
