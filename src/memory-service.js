import { callRatewareApi } from "./rateware-api.js";

export async function listMemoryRules(rawUploadId = "") {
  return (await callRatewareApi("list_interpretation_memory", { raw_upload_id: rawUploadId })).rows;
}

export async function createMemoryRule(rule) {
  return (await callRatewareApi("create_interpretation_memory", rule)).row;
}

export async function updateMemoryRule(id, patch) {
  return (await callRatewareApi("update_interpretation_memory", { id, patch })).row;
}

export async function archiveMemoryRules(ids = []) {
  return await callRatewareApi("archive_interpretation_memory", { ids });
}
