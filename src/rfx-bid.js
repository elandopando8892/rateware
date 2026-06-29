import { SUPABASE_URL } from "./config.js";

const title = document.querySelector("#bid-event-title");
const card = document.querySelector("#bid-invitation-card");
let boardRefreshTimer = null;

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

function formatMoney(value, currency = "USD") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(number)} ${currency || "USD"}`;
}

function renderLiveBoard(liveBoard = {}) {
  const board = card.querySelector("#bid-live-board");
  if (!board) return;
  const rows = Array.isArray(liveBoard.rows) ? liveBoard.rows : [];
  if (!rows.length) {
    board.innerHTML = `
      <div class="split-heading compact">
        <div>
          <p class="eyebrow">Live offer manager</p>
          <h3>No competitor bids yet</h3>
        </div>
        <span class="status-pill muted">Auto-refresh</span>
      </div>
      <p class="bid-board-note">Once other carriers submit bids, this board will show anonymous ranking and your current position.</p>
    `;
    return;
  }
  board.innerHTML = `
    <div class="split-heading compact">
      <div>
        <p class="eyebrow">Live offer manager</p>
        <h3>${escapeHtml(liveBoard.current_rank ? `Your rank: #${liveBoard.current_rank}` : "Bid ranking")}</h3>
      </div>
      <span class="status-pill neutral">${escapeHtml(String(liveBoard.bid_count || rows.length))} bid(s)</span>
    </div>
    <div class="bid-board-stats">
      <article><span>Best offer</span><strong>${formatMoney(liveBoard.best_rate, liveBoard.currency)}</strong></article>
      <article><span>Your position</span><strong>${liveBoard.current_rank ? `#${liveBoard.current_rank}` : "-"}</strong></article>
      <article><span>Last refresh</span><strong>${escapeHtml(new Date(liveBoard.updated_at || Date.now()).toLocaleTimeString())}</strong></article>
    </div>
    <table class="bid-live-table">
      <thead><tr><th>Rank</th><th>Bidder</th><th>All-in</th><th>Capacity</th><th>Transit</th></tr></thead>
      <tbody>
        ${rows.map((row) => `
          <tr class="${row.is_current ? "is-current" : ""}">
            <td>#${escapeHtml(row.rank)}</td>
            <td>${escapeHtml(row.bidder)}</td>
            <td>${formatMoney(row.amount, row.currency)}</td>
            <td>${escapeHtml(row.weekly_capacity ?? "-")}</td>
            <td>${escapeHtml(row.transit_days ?? "-")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <p class="bid-board-note">Competitor names are hidden. Rankings refresh automatically while this page is open.</p>
  `;
}

function renderInvitation(invitation, liveBoard = {}) {
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

    <section id="bid-live-board" class="bid-live-board">
      <p class="status-message">Loading live offers...</p>
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
      await loadInvitation({ refreshOnly: true });
    } catch (error) {
      status.textContent = error.message;
      status.dataset.tone = "error";
    }
  });
  renderLiveBoard(liveBoard);
}

async function loadInvitation(options = {}) {
  if (!tokenFromUrl()) {
    card.innerHTML = `<p class="status-message" data-tone="error">Missing invitation token.</p>`;
    return;
  }
  try {
    const data = await callBidApi("get_invitation");
    if (options.refreshOnly && card.querySelector("#bid-form")) {
      renderLiveBoard(data.live_board);
    } else {
      renderInvitation(data.invitation, data.live_board);
    }
  } catch (error) {
    if (options.refreshOnly) return;
    title.textContent = "Bid request unavailable";
    card.innerHTML = `<p class="status-message" data-tone="error">${escapeHtml(error.message)}</p>`;
  }
}

loadInvitation().then(() => {
  if (boardRefreshTimer) window.clearInterval(boardRefreshTimer);
  boardRefreshTimer = window.setInterval(() => loadInvitation({ refreshOnly: true }), 30000);
});
