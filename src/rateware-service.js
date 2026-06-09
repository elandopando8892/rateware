import { callRatewareApi } from "./rateware-api.js";

export async function fetchApprovedRateware({ search = "", operation = "", service = "" } = {}) {
  return (await callRatewareApi("list_rateware", { search, operation, service })).rows;
}
