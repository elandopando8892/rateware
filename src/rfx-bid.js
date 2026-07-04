import { SUPABASE_URL } from "./config.js";

const title = document.querySelector("#bid-event-title");
const card = document.querySelector("#bid-invitation-card");

let boardRefreshTimer = null;
let bookSearchTimer = null;
let lastCarrierBook = null;
const bookFilters = {
  view: "all",
  query: ""
};

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

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
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
    open: "Open",
    not_invited: "Request invite"
  };
  return labels[value] || value;
}

function deadlineCopy(event = {}) {
  if (!event.due_date) return { label: "No deadline", tone: "muted", detail: "Procurement has not set a close date." };
  const dueAt = new Date(`${event.due_date}T23:59:59`);
  if (Number.isNaN(dueAt.getTime())) return { label: formatDate(event.due_date), tone: "neutral", detail: "Deadline date needs review." };
  const days = Math.ceil((dueAt.getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: "Closed", tone: "danger", detail: `Closed ${Math.abs(days)} day(s) ago.` };
  if (days === 0) return { label: "Closes today", tone: "warning", detail: "Submit or update your offer today." };
  if (days === 1) return { label: "1 day left", tone: "warning", detail: `Due ${formatDate(event.due_date)}.` };
  return { label: `${days} days left`, tone: "success", detail: `Due ${formatDate(event.due_date)}.` };
}

function visibilityCopy(visibility = {}) {
  if (visibility.mode === "open_leaderboard") {
    return "Open leaderboard - competitor names and exact submitted rates are visible.";
  }
  if (visibility.mode === "anonymous_rank") {
    return "Anonymous rank - competitor names and exact third-party rates are hidden.";
  }
  if (visibility.mode === "private") {
    return "Private - procurement sees all offers; carriers only see their own submitted bid.";
  }
  return "Private visibility controlled by procurement.";
}

function visibilityLabel(visibility = {}) {
  const labels = {
    private: "Private",
    anonymous_rank: "Anonymous rank",
    open_leaderboard: "Open leaderboard"
  };
  return labels[visibility.mode] || "Private";
}

function signalTone(signal = "") {
  const value = signal.toLowerCase();
  if (value.includes("leading")) return "success";
  if (value.includes("competitive") || value.includes("active")) return "neutral";
  if (value.includes("review")) return "warning";
  return "muted";
}

function renderLiveBoard(liveBoard = {}) {
  const board = card.querySelector("#bid-live-board");
  if (!board) return;
  const rows = Array.isArray(liveBoard.rows) ? liveBoard.rows : [];
  const signal = liveBoard.position_signal || "Awaiting first offer";
  const visibility = liveBoard.visibility || {};
  if (!rows.length) {
    board.innerHTML = `
      <div class="bid-room-section-heading">
        <div>
          <p class="eyebrow">Live bid room</p>
          <h3>No submitted offers yet</h3>
        </div>
        <span class="status-pill muted">Auto refresh</span>
      </div>
      <div class="bid-room-empty">
        <strong>Submit your all-in offer to start the lane auction.</strong>
        <span>${escapeHtml(visibilityCopy(visibility))}</span>
      </div>
    `;
    return;
  }

  board.innerHTML = `
    <div class="bid-room-section-heading">
      <div>
        <p class="eyebrow">Live bid room</p>
        <h3>${escapeHtml(liveBoard.current_rank ? `Your rank: #${liveBoard.current_rank}` : signal)}</h3>
      </div>
      <span class="status-pill" data-tone="${signalTone(signal)}">${escapeHtml(signal)}</span>
    </div>
    <div class="bid-board-stats">
      <article>
        <span>Visibility</span>
        <strong>${escapeHtml(visibilityLabel(visibility))}</strong>
        <small>${escapeHtml(visibilityCopy(visibility))}</small>
      </article>
      <article>
        <span>Your position</span>
        <strong>${liveBoard.current_rank ? `#${escapeHtml(liveBoard.current_rank)}` : "-"}</strong>
        <small>${escapeHtml(liveBoard.guidance || "Submit a bid to see your rank.")}</small>
      </article>
      <article>
        <span>Bid activity</span>
        <strong>${escapeHtml(liveBoard.bid_count || rows.length)}</strong>
        <small>Last refresh ${escapeHtml(new Date(liveBoard.updated_at || Date.now()).toLocaleTimeString())}</small>
      </article>
    </div>
    <div class="table-wrap">
      <table class="bid-live-table">
        <thead><tr><th>Rank</th><th>Bidder</th><th>Rate visibility</th><th>Capacity</th><th>Transit</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr class="${row.is_current ? "is-current" : ""}">
              <td>#${escapeHtml(row.rank)}</td>
              <td>${escapeHtml(row.bidder)}</td>
              <td>${row.amount !== null && row.amount !== undefined ? formatMoney(row.amount, row.currency) : `<span class="masked-rate">${escapeHtml(row.amount_display || "Hidden")}</span>`}</td>
              <td>${escapeHtml(row.weekly_capacity ?? "-")}</td>
              <td>${escapeHtml(row.transit_days ?? "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <p class="bid-board-note">${escapeHtml(visibilityCopy(visibility))}</p>
  `;
}

function laneLabel(row = {}) {
  return `${row.origin || "-"} -> ${row.destination || "-"}`;
}

function marketLabel(lane = {}) {
  return [lane.origin_market, lane.destination_market].filter(Boolean).join(" -> ") || "-";
}

function eventLabel(row = {}) {
  return [row.rfx_id, row.name].filter(Boolean).join(" | ") || "-";
}

function fitTags(row = {}) {
  const tags = Array.isArray(row.fit_tags) ? row.fit_tags : [];
  if (tags.length) return tags;
  const lane = row.lane || {};
  return [lane.equipment, lane.trailer, lane.operation, lane.service, lane.origin_market, lane.destination_market].filter(Boolean).slice(0, 5);
}

function bookStatus(row = {}) {
  return row.business_status || (row.is_invited ? row.participation_status : "open");
}

function allBookRows(carrierBook = {}) {
  const invited = Array.isArray(carrierBook.invited) ? carrierBook.invited : [];
  const openNotInvited = Array.isArray(carrierBook.open_not_invited) ? carrierBook.open_not_invited : [];
  return [...invited, ...openNotInvited];
}

function filteredBookRows(carrierBook = {}) {
  const term = bookFilters.query.trim().toLowerCase();
  return allBookRows(carrierBook).filter((row) => {
    const status = bookStatus(row);
    const lane = row.lane || {};
    const event = row.event || {};
    const viewMatches = bookFilters.view === "all"
      || (bookFilters.view === "invited" && row.is_invited && !["quoted", "awarded"].includes(status))
      || (bookFilters.view === "open" && !row.is_invited)
      || (bookFilters.view === "quoted" && status === "quoted")
      || (bookFilters.view === "awarded" && status === "awarded");
    if (!viewMatches) return false;
    if (!term) return true;
    return [
      eventLabel(event),
      laneLabel(lane),
      marketLabel(lane),
      lane.equipment,
      lane.trailer,
      lane.config,
      lane.operation,
      lane.service,
      status,
      ...fitTags(row)
    ].filter(Boolean).join(" ").toLowerCase().includes(term);
  });
}

function renderBookRows(rows = []) {
  if (!rows.length) {
    return `<tr><td colspan="8">No opportunities match this view.</td></tr>`;
  }
  return rows.map((row) => {
    const lane = row.lane || {};
    const event = row.event || {};
    const amount = row.bid_rate !== null && row.bid_rate !== undefined ? formatMoney(row.bid_rate, row.currency || lane.currency) : "-";
    const action = row.is_invited
      ? `<a class="secondary small-button" href="./rfx-bid.html?token=${encodeURIComponent(row.invitation_token || "")}">Open bid</a>`
      : `<button class="secondary small-button" type="button" data-request-lane="${escapeHtml(lane.id || "")}">Request invite</button>`;
    return `
      <tr>
        <td>
          <strong>${escapeHtml(event.rfx_id || event.name || "-")}</strong>
          <small>${escapeHtml(event.customer || "")}${event.due_date ? ` | Due ${escapeHtml(formatDate(event.due_date))}` : ""}</small>
        </td>
        <td>
          ${escapeHtml(laneLabel(lane))}
          <small>${escapeHtml(marketLabel(lane))}</small>
        </td>
        <td>${escapeHtml([lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / ") || "-")}</td>
        <td>${escapeHtml([lane.operation, lane.service].filter(Boolean).join(" / ") || "-")}</td>
        <td>
          <div class="book-fit-tags">
            ${fitTags(row).slice(0, 4).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") || "<span>No fit tags</span>"}
          </div>
        </td>
        <td><span class="status-pill ${row.is_invited ? "neutral" : "muted"}">${escapeHtml(statusLabel(row.participation_status || bookStatus(row)))}</span></td>
        <td>${amount}<small>${row.weekly_capacity ? `${escapeHtml(row.weekly_capacity)} / wk` : ""}</small></td>
        <td>${action}</td>
      </tr>
    `;
  }).join("");
}

function renderCarrierBook(carrierBook = {}) {
  const book = card.querySelector("#carrier-business-book");
  if (!book) return;
  lastCarrierBook = carrierBook;
  const summary = carrierBook.summary || {};
  const carrier = carrierBook.carrier || {};
  const rows = filteredBookRows(carrierBook);
  const filterButtons = [
    ["all", "All"],
    ["invited", "Invited"],
    ["open", "Open book"],
    ["quoted", "Quoted"],
    ["awarded", "Awarded"]
  ];
  book.innerHTML = `
    <div class="bid-room-section-heading">
      <div>
        <p class="eyebrow">Private business book</p>
        <h3>${escapeHtml(carrier.vendor_name || "Carrier portal")}</h3>
      </div>
      <span class="status-pill neutral">${escapeHtml(carrier.domain || carrier.primary_email || "Private access")}</span>
    </div>
    <div class="carrier-book-summary">
      <article><span>Invited lanes</span><strong>${escapeHtml(summary.invited || 0)}</strong></article>
      <article><span>Open book</span><strong>${escapeHtml(summary.not_invited_open || 0)}</strong></article>
      <article><span>Submitted bids</span><strong>${escapeHtml(summary.quoted || 0)}</strong></article>
      <article><span>Awarded</span><strong>${escapeHtml(summary.awarded || 0)}</strong></article>
    </div>
    <div class="bid-book-toolbar">
      <div class="segmented-control">
        ${filterButtons.map(([value, label]) => `<button class="${bookFilters.view === value ? "is-active" : ""}" type="button" data-book-filter="${value}">${label}</button>`).join("")}
      </div>
      <input data-book-search type="search" value="${escapeHtml(bookFilters.query)}" placeholder="Search lane, market, equipment, RFx..." />
    </div>
    <div class="table-wrap">
      <table class="carrier-book-table">
        <thead><tr><th>RFx</th><th>Lane</th><th>Equipment</th><th>Service</th><th>Fit</th><th>Status</th><th>Your bid</th><th>Action</th></tr></thead>
        <tbody>${renderBookRows(rows)}</tbody>
      </table>
    </div>
    <p class="bid-board-note">Open book lanes are visible for discovery. You can request access, but you cannot bid until procurement invites you to that lane.</p>
  `;
}

function renderInvitation(invitation, liveBoard = {}) {
  const event = invitation.rfx_events || {};
  const lane = invitation.rfx_lanes || {};
  const vendor = invitation.vendors || {};
  const deadline = deadlineCopy(event);
  title.textContent = event.name || event.rfx_id || "Private Bid Room";
  card.innerHTML = `
    <section class="bid-room-hero">
      <div>
        <p class="eyebrow">Private Bid Room v1</p>
        <h2>${escapeHtml(event.name || event.rfx_id || "Bid request")}</h2>
        <p>${escapeHtml(vendor.vendor_name || vendor.domain || "Carrier")} can review invited lanes, request access to open opportunities, and submit all-in offers.</p>
      </div>
      <aside>
        <span class="status-pill" data-tone="${deadline.tone}">${escapeHtml(deadline.label)}</span>
        <strong>${escapeHtml(event.rfx_id || "RFx")}</strong>
        <small>${escapeHtml(deadline.detail)}</small>
      </aside>
    </section>

    <div class="bid-context">
      <article><span>Customer</span><strong>${escapeHtml(event.customer || "-")}</strong></article>
      <article><span>Carrier</span><strong>${escapeHtml(vendor.vendor_name || vendor.domain || "-")}</strong></article>
      <article><span>Visibility</span><strong>${escapeHtml(visibilityLabel(liveBoard.visibility || {}))}</strong></article>
      <article><span>Refresh</span><strong>30 sec</strong></article>
    </div>

    <section class="bid-lane-summary">
      <div class="bid-room-section-heading">
        <div>
          <p class="eyebrow">Current lane</p>
          <h2>${escapeHtml(formatLane(lane))}</h2>
        </div>
        <span class="status-pill neutral">${escapeHtml(statusLabel(invitation.invitation_status))}</span>
      </div>
      <dl>
        <div><dt>Equipment</dt><dd>${escapeHtml([lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / ") || "-")}</dd></div>
        <div><dt>Operation</dt><dd>${escapeHtml(lane.operation || "-")}</dd></div>
        <div><dt>Service</dt><dd>${escapeHtml(lane.service || "-")}</dd></div>
        <div><dt>Weekly volume</dt><dd>${escapeHtml(lane.weekly_volume ?? "-")}</dd></div>
      </dl>
    </section>

    <section id="bid-live-board" class="bid-live-board">
      <p class="status-message">Loading live bid room...</p>
    </section>

    <form id="bid-form" class="bid-form">
      <div class="bid-form-header">
        <div>
          <p class="eyebrow">Submit or update offer</p>
          <h3>Your bid controls your rank</h3>
        </div>
        <span class="status-pill muted">All-in only</span>
      </div>
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
        <textarea id="bid-notes" rows="3" placeholder="Assumptions, validity, accessorials...">${escapeHtml(invitation.notes || "")}</textarea>
      </label>
      <button type="submit">Submit bid</button>
      <p id="bid-submit-status" class="status-message" role="status"></p>
    </form>

    <section id="carrier-business-book" class="carrier-business-book">
      <p class="status-message">Loading private business book...</p>
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
      status.textContent = "Bid submitted. Your rank will refresh automatically.";
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
  const filterButton = event.target.closest("[data-book-filter]");
  if (filterButton) {
    bookFilters.view = filterButton.dataset.bookFilter || "all";
    renderCarrierBook(lastCarrierBook || {});
    return;
  }

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

card.addEventListener("input", (event) => {
  const search = event.target.closest("[data-book-search]");
  if (!search) return;
  bookFilters.query = search.value;
  if (bookSearchTimer) window.clearTimeout(bookSearchTimer);
  bookSearchTimer = window.setTimeout(() => {
    renderCarrierBook(lastCarrierBook || {});
    const nextSearch = card.querySelector("[data-book-search]");
    nextSearch?.focus();
    nextSearch?.setSelectionRange(bookFilters.query.length, bookFilters.query.length);
  }, 180);
});

loadInvitation().then(() => {
  if (boardRefreshTimer) window.clearInterval(boardRefreshTimer);
  boardRefreshTimer = window.setInterval(() => loadInvitation({ refreshOnly: true }), 30000);
});
