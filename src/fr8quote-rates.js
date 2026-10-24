// Review Queue › Fr8Quote: rates in review delivered by Fr8Quote (contract fr8quote.rateware-rate.v1).
// Lists the workspace inbox (fcm_ratebook_imports) and approves or rejects one row with a note. Approval publishes
// nothing: the rate stays as a reviewed reference. Hidden when the inbox is empty and the view is "Pending".
import { authenticatedFetch } from "./auth.js";
import { SUPABASE_URL } from "./config.js";

const API = `${SUPABASE_URL}/functions/v1/quotedesk-api`;
const panel = document.querySelector("#fr8quote-rates");
const body = document.querySelector("#fr8quote-rates-body");
const count = document.querySelector("#fr8quote-rates-count");
const view = document.querySelector("#fr8quote-rates-status");
const message = document.querySelector("#fr8quote-rates-message");

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const money = (n, cur) => `${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })} ${esc(cur)}`;
const day = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const STATUS = { pending_review: "Pending review", approved: "Approved", rejected: "Rejected", superseded: "Superseded" };

async function call(payload) {
  const response = await authenticatedFetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function row(r) {
  const p = r.payload || {}, lane = p.lane || {}, rate = p.rate || {}, cb = p.cost_basis || {}, pv = p.provenance || {};
  const margin = Number.isFinite(cb.margin) ? `${Math.round(cb.margin * 1000) / 10}%` : "";
  const pending = r.status === "pending_review";
  return `<tr data-id="${esc(r.id)}">
    <td><strong>${esc(lane.origin)} → ${esc(lane.destination)}</strong><div class="muted">${esc(lane.operation)}${lane.border_crossing ? ` · ${esc(lane.border_crossing)}` : ""} · ${esc(p.equipment?.vehicle_config)} ${esc(p.equipment?.trailer)}</div></td>
    <td class="num"><strong>${money(rate.total, rate.currency)}</strong><div class="muted">cost ${money(cb.cost_total, rate.currency)} · margin ${margin}</div></td>
    <td>${esc(rate.valid_from)}${rate.valid_until ? ` → ${esc(rate.valid_until)}` : ""}<div class="muted">market ${esc(cb.market_status)}</div></td>
    <td>v${esc(r.source_quote_version)} · ${day(r.received_at)}<div><a href="${esc(pv.read_only_url)}" target="_blank" rel="noopener">Traceable sheet</a></div></td>
    <td>${pending
      ? `<div class="fr8q-actions"><input type="text" maxlength="1000" placeholder="Note (required to reject)" aria-label="Review note" />
         <button type="button" class="small-button" data-decision="approved">Approve</button>
         <button type="button" class="secondary small-button" data-decision="rejected">Reject</button></div>`
      : `<strong>${esc(STATUS[r.status] || r.status)}</strong><div class="muted">${esc(r.reviewed_by_email || "")}${r.review_note ? ` · ${esc(r.review_note)}` : ""}</div>`}</td>
  </tr>`;
}

async function load() {
  if (!panel) return;
  try {
    const { rows } = await call({ action: "list_fcm_ratebook_imports", status: view.value });
    panel.hidden = !rows.length && view.value === "pending_review";
    count.textContent = String(rows.length);
    body.innerHTML = rows.length ? rows.map(row).join("") : `<tr><td colspan="5" class="muted">No Fr8Quote rates in this view.</td></tr>`;
  } catch (error) {
    panel.hidden = false;
    body.innerHTML = `<tr><td colspan="5">Could not load Fr8Quote rates: ${esc(error.message)}</td></tr>`;
  }
}

body?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-decision]");
  if (!button) return;
  const tr = button.closest("tr");
  const note = tr.querySelector("input")?.value.trim() || "";
  if (button.dataset.decision === "rejected" && !note) { message.textContent = "Write a note to reject."; tr.querySelector("input")?.focus(); return; }
  tr.querySelectorAll("button").forEach((b) => { b.disabled = true; });
  try {
    await call({ action: "review_fcm_ratebook_import", id: tr.dataset.id, decision: button.dataset.decision, note });
    message.textContent = button.dataset.decision === "approved" ? "Approved as a reviewed reference. Nothing was published." : "Rejected with note.";
    await load();
  } catch (error) {
    message.textContent = `Review failed: ${error.message}`;
    tr.querySelectorAll("button").forEach((b) => { b.disabled = false; });
  }
});
view?.addEventListener("change", load);
document.querySelector("#fr8quote-rates-refresh")?.addEventListener("click", load);
load();
