import { callRatewareApi } from "./rateware-api.js";

export async function fetchApprovedRateware({ search = "", operation = "", service = "" } = {}) {
  return (await callRatewareApi("list_rateware", { search, operation, service })).rows;
}

export async function returnApprovedRatesToStaging(ids = []) {
  return await callRatewareApi("return_rateware_to_staging", { ids });
}
