import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const token = new URLSearchParams(window.location.search).get("token") || "";
const elements = {
  title: document.querySelector("#ratebook-carrier-title"),
  subtitle: document.querySelector("#ratebook-carrier-subtitle"),
  vendor: document.querySelector("#ratebook-carrier-vendor"),
  validity: document.querySelector("#ratebook-carrier-validity"),
  status: document.querySelector("#ratebook-carrier-status"),
  workspace: document.querySelector("#ratebook-carrier-workspace"),
  segment: document.querySelector("#ratebook-carrier-segment"),
  search: document.querySelector("#ratebook-carrier-search"),
  routes: document.querySelector("#ratebook-carrier-routes"),
  dialog: document.querySelector("#ratebook-carrier-route-dialog"),
  detailTitle: document.querySelector("#ratebook-carrier-route-title"),
  detail: document.querySelector("#ratebook-carrier-route-detail"),
  closeDetail: document.querySelector("#ratebook-carrier-close-detail"),
  quoteDialog: document.querySelector("#ratebook-carrier-quote-dialog"),
  quoteTitle: document.querySelector("#ratebook-carrier-quote-title"),
  quoteRoute: document.querySelector("#ratebook-carrier-quote-route"),
  quoteForm: document.querySelector("#ratebook-carrier-quote-form"),
  quoteFeedback: document.querySelector("#ratebook-carrier-quote-feedback"),
  closeQuote: document.querySelector("#ratebook-carrier-close-quote"),
  withdrawQuote: document.querySelector("#ratebook-carrier-withdraw-quote"),
  submitQuote: document.querySelector("#ratebook-carrier-submit-quote")
};
const state = { data: null, search: "", segment: "", quoteRouteId: "", submitting: false };

function text(value, fallback = "-") { return String(value ?? "").trim() || fallback; }
function escapeHtml(value) { return text(value, "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
function formatDate(value) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "Open validity"; }
function formatMoney(value, currency) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "No submitted offer";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: text(currency, "USD"), maximumFractionDigits: 2 }).format(amount); } catch { return `${amount} ${text(currency, "USD")}`; }
}

async function call(action, body = {}) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ratebook-carrier-api`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ action, ...body })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Ratebook access is unavailable.");
  return payload;
}

function matchingRoutes() {
  const needle = state.search.toLowerCase();
  return (state.data?.routes || []).filter((route) => {
    const segmentMatches = !state.segment || route.segment_key === state.segment;
    const searchMatches = !needle || [route.transaction_id, route.origin, route.destination, route.equipment, route.operation, route.service].join(" ").toLowerCase().includes(needle);
    return segmentMatches && searchMatches;
  });
}

function quoteSummary(route) {
  const quote = route.quote;
  if (!quote) return `<span class="ratebook-carrier-offer is-empty">Not quoted</span>`;
  if (quote.status === "withdrawn") return `<span class="ratebook-carrier-offer is-withdrawn">Withdrawn</span>`;
  const detail = [quote.weekly_capacity !== null && quote.weekly_capacity !== undefined ? `${quote.weekly_capacity} / week` : null, quote.transit_days !== null && quote.transit_days !== undefined ? `${quote.transit_days} days` : null].filter(Boolean).join(" | ");
  return `<span class="ratebook-carrier-offer"><strong>${escapeHtml(formatMoney(quote.all_in_rate, quote.currency))}</strong><small>${escapeHtml(detail || "Submitted")}</small></span>`;
}

function renderRoutes() {
  const routes = matchingRoutes();
  elements.routes.innerHTML = routes.length ? routes.map((route) => `
    <tr><td><strong>${escapeHtml(route.transaction_id)}</strong></td><td>${escapeHtml(route.segment_key || "General")}</td><td>${escapeHtml(route.origin)}</td><td>${escapeHtml(route.destination)}</td><td>${escapeHtml([route.equipment, route.trailer, route.configuration].filter(Boolean).join(" / "))}</td><td>${escapeHtml(route.operation)}</td><td>${escapeHtml(route.service)}</td><td>${escapeHtml(route.weekly_volume)}</td><td>${quoteSummary(route)}</td><td><div class="ratebook-carrier-row-actions"><button type="button" data-ratebook-route="${escapeHtml(route.id)}">Details</button><button type="button" class="ratebook-carrier-primary" data-ratebook-quote="${escapeHtml(route.id)}">${route.quote?.status === "submitted" ? "Update offer" : "Submit offer"}</button></div></td></tr>`).join("") : "<tr><td colspan=\"10\" class=\"ratebook-carrier-empty\">No routes match the current filters.</td></tr>";
}

function getRoute(routeId = state.quoteRouteId) {
  return (state.data?.routes || []).find((item) => item.id === routeId);
}

function openRoute(routeId) {
  const route = getRoute(routeId);
  if (!route) return;
  elements.detailTitle.textContent = `${text(route.transaction_id)} | ${text(route.origin)} to ${text(route.destination)}`;
  const labels = { logistics_model: "Logistics model", operation_criteria: "Operation criteria", business_rules: "Business rules", service_specifications: "Service specifications", carrier_requirements: "Required carrier profile", other_notes: "Other notes" };
  elements.detail.innerHTML = Object.entries(labels).map(([key, label]) => `<article><h3>${label}</h3><p>${escapeHtml(route.detail?.[key] || "No additional detail was provided.")}</p></article>`).join("");
  elements.dialog.showModal();
}

function openQuote(routeId) {
  const route = getRoute(routeId);
  if (!route) return;
  state.quoteRouteId = routeId;
  const quote = route.quote || {};
  elements.quoteTitle.textContent = quote.status === "submitted" ? "Update offer" : "Submit offer";
  elements.quoteRoute.textContent = `${text(route.transaction_id)} | ${text(route.origin)} to ${text(route.destination)}`;
  elements.quoteForm.elements.all_in_rate.value = quote.status === "submitted" ? quote.all_in_rate ?? "" : "";
  elements.quoteForm.elements.currency.value = text(quote.currency || route.currency, "USD").toUpperCase();
  elements.quoteForm.elements.weekly_capacity.value = quote.status === "submitted" ? quote.weekly_capacity ?? "" : "";
  elements.quoteForm.elements.transit_days.value = quote.status === "submitted" ? quote.transit_days ?? "" : "";
  elements.quoteForm.elements.valid_until.value = quote.status === "submitted" ? quote.valid_until || "" : "";
  elements.quoteForm.elements.quote_reference.value = quote.status === "submitted" ? quote.quote_reference || "" : "";
  elements.quoteForm.elements.notes.value = quote.status === "submitted" ? quote.notes || "" : "";
  elements.quoteFeedback.textContent = "Your offer is saved against this Ratebook route only. Procurement reviews it before any award or production action.";
  elements.withdrawQuote.hidden = quote.status !== "submitted";
  elements.submitQuote.textContent = quote.status === "submitted" ? "Update offer" : "Submit offer";
  elements.quoteDialog.showModal();
}

async function refreshAccess(message = "") {
  const data = await call("get_ratebook_access", { token });
  render(data);
  if (message) elements.status.textContent = message;
}

async function submitQuote(event) {
  event.preventDefault();
  if (state.submitting || !state.quoteRouteId) return;
  const form = new FormData(elements.quoteForm);
  state.submitting = true;
  elements.submitQuote.disabled = true;
  elements.quoteFeedback.textContent = "Saving your offer...";
  try {
    const result = await call("submit_ratebook_quote", {
      token,
      package_lane_id: state.quoteRouteId,
      all_in_rate: form.get("all_in_rate"),
      currency: form.get("currency"),
      weekly_capacity: form.get("weekly_capacity"),
      transit_days: form.get("transit_days"),
      valid_until: form.get("valid_until"),
      quote_reference: form.get("quote_reference"),
      notes: form.get("notes")
    });
    await refreshAccess(result.message || "Your Ratebook offer was saved.");
    elements.quoteDialog.close();
  } catch (error) {
    elements.quoteFeedback.textContent = error.message || "Your offer could not be saved.";
  } finally {
    state.submitting = false;
    elements.submitQuote.disabled = false;
  }
}

async function withdrawQuote() {
  const route = getRoute();
  if (!route || !route.quote || state.submitting) return;
  if (!window.confirm(`Withdraw the offer for ${text(route.transaction_id)}?`)) return;
  state.submitting = true;
  elements.withdrawQuote.disabled = true;
  elements.quoteFeedback.textContent = "Withdrawing your offer...";
  try {
    const result = await call("withdraw_ratebook_quote", { token, package_lane_id: route.id });
    await refreshAccess(result.message || "Your Ratebook offer was withdrawn.");
    elements.quoteDialog.close();
  } catch (error) {
    elements.quoteFeedback.textContent = error.message || "Your offer could not be withdrawn.";
  } finally {
    state.submitting = false;
    elements.withdrawQuote.disabled = false;
  }
}

function render(data) {
  state.data = data;
  elements.title.textContent = text(data.ratebook?.name, "Private Ratebook");
  elements.subtitle.textContent = [data.ratebook?.shipper_name || data.project?.customer_name, data.project?.title, data.ratebook?.source_type].filter(Boolean).join(" | ") || "Routebook shared by procurement";
  elements.vendor.textContent = text(data.carrier?.vendor_name);
  elements.validity.textContent = formatDate(data.ratebook?.valid_until);
  const segments = new Map((data.segments || []).map((segment) => [segment.segment_key, segment.segment_name || segment.segment_key]));
  (data.routes || []).forEach((route) => { if (route.segment_key && !segments.has(route.segment_key)) segments.set(route.segment_key, route.segment_key); });
  elements.segment.innerHTML = `<option value="">All segments</option>${[...segments.entries()].map(([key, name]) => `<option value="${escapeHtml(key)}">${escapeHtml(name)}</option>`).join("")}`;
  const submitted = (data.routes || []).filter((route) => route.quote?.status === "submitted").length;
  elements.status.textContent = `${data.routes?.length || 0} private route(s) available | ${submitted} offer(s) submitted.`;
  elements.workspace.hidden = false;
  renderRoutes();
}

elements.search.addEventListener("input", () => { state.search = elements.search.value.trim(); renderRoutes(); });
elements.segment.addEventListener("change", () => { state.segment = elements.segment.value; renderRoutes(); });
elements.routes.addEventListener("click", (event) => {
  const detail = event.target.closest("[data-ratebook-route]");
  const quote = event.target.closest("[data-ratebook-quote]");
  if (detail) openRoute(detail.dataset.ratebookRoute);
  if (quote) openQuote(quote.dataset.ratebookQuote);
});
elements.closeDetail.addEventListener("click", () => elements.dialog.close());
elements.closeQuote.addEventListener("click", () => elements.quoteDialog.close());
elements.quoteForm.addEventListener("submit", submitQuote);
elements.withdrawQuote.addEventListener("click", withdrawQuote);

if (!token) {
  elements.status.textContent = "This private Ratebook link is incomplete. Ask procurement to resend it.";
} else {
  call("get_ratebook_access", { token }).then(render).catch((error) => { elements.status.textContent = error.message; });
}
