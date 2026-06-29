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

function statusLabel(status) {
  const value = String(status || "drafted").toLowerCase();
  const labels = {
    drafted: "Drafted",
    invited: "Invited",
    viewed: "Viewed",
    responded: "Responded",
    quoted: "Quoted",
    bid_submitted: "Quoted",
    awarded: "Awarded",
    declined: "Declined",
    not_invited: "Not invited"
  };
  return labels[value] || value;
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

function laneLabel(row = {}) {
  return `${row.origin || "-"} -> ${row.destination || "-"}`;
}

function eventLabel(row = {}) {
  return [row.rfx_id, row.name].filter(Boolean).join(" | ") || "-";
}

function renderBookRows(rows = [], options = {}) {
  if (!rows.length) return `<tr><td colspan="7">${escapeHtml(options.empty || "No lanes in this section.")}</td></tr>`;
  return rows.map((row) => {
    const lane = row.lane || {};
    const event = row.event || {};
    const amount = row.bid_rate !== null && row.bid_rate !== undefined ? formatMoney(row.bid_rate, row.currency || lane.currency) : "-";
    const action = row.is_invited
      ? `<a class="secondary small-button" href="./rfx-bid.html?token=${encodeURIComponent(row.invitation_token || "")}">Open</a>`
      : `<button class="secondary small-button" type="button" data-request-lane="${escapeHtml(lane.id || "")}">Request invite</button>`;
    return `
      <tr>
        <td>${escapeHtml(eventLabel(event))}<small>${escapeHtml(event.status || "")}${event.due_date ? ` | Due ${escapeHtml(event.due_date)}` : ""}</small></td>
        <td>${escapeHtml(laneLabel(lane))}<small>${escapeHtml([lane.origin_market, lane.destination_market].filter(Boolean).join(" -> "))}</small></td>
        <td>${escapeHtml([lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / ") || "-")}</td>
        <td>${escapeHtml([lane.operation, lane.service].filter(Boolean).join(" / ") || "-")}</td>
        <td><span class="status-pill ${row.is_invited ? "neutral" : "muted"}">${escapeHtml(statusLabel(row.participation_status))}</span></td>
        <td>${amount}<small>${row.weekly_capacity ? `${escapeHtml(row.weekly_capacity)} / wk` : ""}</small></td>
        <td>${action}</td>
      </tr>
    `;
  }).join("");
}

function renderCarrierBook(carrierBook = {}) {
  const book = card.querySelector("#carrier-business-book");
  if (!book) return;
  const summary = carrierBook.summary || {};
  const carrier = carrierBook.carrier || {};
  const invited = Array.isArray(carrierBook.invited) ? carrierBook.invited : [];
  const openNotInvited = Array.isArray(carrierBook.open_not_invited) ? carrierBook.open_not_invited : [];
  const quoted = Array.isArray(carrierBook.quoted) ? carrierBook.quoted : [];
  book.innerHTML = `
    <div class="split-heading compact">
      <div>
        <p class="eyebrow">Carrier business book</p>
        <h3>${escapeHtml(carrier.vendor_name || "Carrier portal")}</h3>
      </div>
      <span class="status-pill neutral">${escapeHtml(carrier.domain || carrier.primary_email || "Private access")}</span>
    </div>
    <div class="carrier-book-summary">
      <article><span>Invited lanes</span><strong>${escapeHtml(summary.invited || 0)}</strong></article>
      <article><span>Open not invited</span><strong>${escapeHtml(summary.not_invited_open || 0)}</strong></article>
      <article><span>Submitted bids</span><strong>${escapeHtml(summary.quoted || 0)}</strong></article>
      <article><span>Awarded</span><strong>${escapeHtml(summary.awarded || 0)}</strong></article>
    </div>
    <section class="carrier-book-section">
      <h4>Invited opportunities</h4>
      <div class="table-wrap">
        <table class="carrier-book-table">
          <thead><tr><th>RFx</th><th>Lane</th><th>Equipment</th><th>Service</th><th>Status</th><th>Your bid</th><th>Action</th></tr></thead>
          <tbody>${renderBookRows(invited, { empty: "No invited opportunities yet." })}</tbody>
        </table>
      </div>
    </section>
    <section class="carrier-book-section">
      <h4>Open business book - not invited yet</h4>
      <div class="table-wrap">
        <table class="carrier-book-table">
          <thead><tr><th>RFx</th><th>Lane</th><th>Equipment</th><th>Service</th><th>Status</th><th>Your bid</th><th>Action</th></tr></thead>
          <tbody>${renderBookRows(openNotInvited, { empty: "No open non-invited lanes available." })}</tbody>
        </table>
      </div>
      <p class="bid-board-note">Request invite records an access request for the procurement team. It does not submit a bid until Rateware invites the carrier to that lane.</p>
    </section>
    <section class="carrier-book-section">
      <h4>Submitted bid history</h4>
      <div class="table-wrap">
        <table class="carrier-book-table">
          <thead><tr><th>RFx</th><th>Lane</th><th>Equipment</th><th>Service</th><th>Status</th><th>Your bid</th><th>Action</th></tr></thead>
          <tbody>${renderBookRows(quoted, { empty: "No submitted bids yet." })}</tbody>
        </table>
      </div>
    </section>
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

    <section id="carrier-business-book" class="carrier-business-book">
      <p class="status-message">Loading carrier business book...</p>
    </section>
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
      renderCarrierBook(data.carrier_book);
    } else {
      renderInvitation(data.invitation, data.live_board);
      renderCarrierBook(data.carrier_book);
    }
  } catch (error) {
    if (options.refreshOnly) return;
    title.textContent = "Bid request unavailable";
    card.innerHTML = `<p class="status-message" data-tone="error">${escapeHtml(error.message)}</p>`;
  }
}

card.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-request-lane]");
  if (!button) return;
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Requesting...";
  try {
    const result = await callBidApi("request_lane_access", { lane_id: button.dataset.requestLane });
    button.textContent = result.requested ? "Requested" : "Already in book";
  } catch (error) {
    button.disabled = false;
    button.textContent = originalText;
    window.alert(error.message);
  }
});

loadInvitation().then(() => {
  if (boardRefreshTimer) window.clearInterval(boardRefreshTimer);
  boardRefreshTimer = window.setInterval(() => loadInvitation({ refreshOnly: true }), 30000);
});
