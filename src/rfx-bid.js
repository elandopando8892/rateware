import { SUPABASE_URL } from "./config.js";

const title = document.querySelector("#bid-event-title");
const card = document.querySelector("#bid-invitation-card");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tokenFromUrl() {
  return new URLSearchParams(window.location.search).get("token") || "";
}

async function callBidApi(action, payload = {}) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/rfx-bid-api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token: tokenFromUrl(), ...payload })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Bid request failed.");
  return data;
}

function formatLane(lane = {}) {
  return `${lane.origin || "-"} -> ${lane.destination || "-"}`;
}

function renderInvitation(invitation) {
  const event = invitation.rfx_events || {};
  const lane = invitation.rfx_lanes || {};
  const vendor = invitation.vendors || {};
  title.textContent = event.name || event.rfx_id || "Bid request";
  card.innerHTML = `
    <div class="bid-context">
      <article>
        <span>RFx</span>
        <strong>${escapeHtml(event.rfx_id || "-")}</strong>
      </article>
      <article>
        <span>Customer</span>
        <strong>${escapeHtml(event.customer || "-")}</strong>
      </article>
      <article>
        <span>Due date</span>
        <strong>${escapeHtml(event.due_date || "-")}</strong>
      </article>
      <article>
        <span>Carrier</span>
        <strong>${escapeHtml(vendor.vendor_name || vendor.domain || "-")}</strong>
      </article>
    </div>

    <section class="bid-lane-summary">
      <p class="eyebrow">Lane</p>
      <h2>${escapeHtml(formatLane(lane))}</h2>
      <dl>
        <div><dt>Equipment</dt><dd>${escapeHtml([lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / ") || "-")}</dd></div>
        <div><dt>Operation</dt><dd>${escapeHtml(lane.operation || "-")}</dd></div>
        <div><dt>Service</dt><dd>${escapeHtml(lane.service || "-")}</dd></div>
        <div><dt>Weekly volume</dt><dd>${escapeHtml(lane.weekly_volume ?? "-")}</dd></div>
      </dl>
    </section>

    <form id="bid-form" class="bid-form">
      <label>
        All-in rate
        <input id="bid-rate" required inputmode="decimal" value="${escapeHtml(invitation.bid_rate ?? "")}" placeholder="2900" />
      </label>
      <label>
        Currency
        <select id="bid-currency">
          ${["USD", "MXN", "CAD"].map((currency) => `<option value="${currency}" ${currency === (invitation.currency || lane.currency || "USD") ? "selected" : ""}>${currency}</option>`).join("")}
        </select>
      </label>
      <label>
        Weekly capacity
        <input id="bid-capacity" inputmode="decimal" value="${escapeHtml(invitation.weekly_capacity ?? "")}" placeholder="5" />
      </label>
      <label>
        Transit days
        <input id="bid-transit-days" inputmode="decimal" value="${escapeHtml(invitation.transit_days ?? "")}" placeholder="2" />
      </label>
      <label class="full-width">
        Notes
        <textarea id="bid-notes" rows="4" placeholder="Assumptions, validity, accessorials...">${escapeHtml(invitation.notes || "")}</textarea>
      </label>
      <button type="submit">Submit bid</button>
      <p id="bid-submit-status" class="status-message" role="status"></p>
    </form>
  `;

  card.querySelector("#bid-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = card.querySelector("#bid-submit-status");
    status.textContent = "Submitting bid...";
    status.dataset.tone = "neutral";
    try {
      await callBidApi("submit_bid", {
        bid_rate: card.querySelector("#bid-rate").value,
        currency: card.querySelector("#bid-currency").value,
        weekly_capacity: card.querySelector("#bid-capacity").value,
        transit_days: card.querySelector("#bid-transit-days").value,
        notes: card.querySelector("#bid-notes").value
      });
      status.textContent = "Bid submitted. Thank you.";
      status.dataset.tone = "success";
    } catch (error) {
      status.textContent = error.message;
      status.dataset.tone = "error";
    }
  });
}

async function loadInvitation() {
  if (!tokenFromUrl()) {
    card.innerHTML = `<p class="status-message" data-tone="error">Missing invitation token.</p>`;
    return;
  }
  try {
    const data = await callBidApi("get_invitation");
    renderInvitation(data.invitation);
  } catch (error) {
    title.textContent = "Bid request unavailable";
    card.innerHTML = `<p class="status-message" data-tone="error">${escapeHtml(error.message)}</p>`;
  }
}

loadInvitation();
