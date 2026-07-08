import { callRatewareApi } from "./rateware-api.js";

export async function fetchVendorSupportTickets(filters = {}) {
  return await callRatewareApi("list_vendor_support_tickets", filters);
}

export async function updateVendorSupportTicket(id, patch = {}) {
  return (await callRatewareApi("update_vendor_support_ticket", { id, ...patch })).row;
}
