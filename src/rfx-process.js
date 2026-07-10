import { initAuthControls, requirePrivatePage } from "./auth.js";
import { humanizeError } from "./error-copy.js";
import {
  createRfxAwardPackage,
  createRfxDemandSnapshot,
  createRfxPackage,
  createRfxProcessProject,
  createRfxRfiMagicLink,
  fetchRfxProcessProject,
  fetchRfxProcessProjects,
  launchRfxPackageToBidRoom,
  reopenRfxRfi,
  revokeRfxRfiMagicLink,
  updateRfxProcessProject
} from "./rfx-process-service.js";

const state = {
  projects: [],
  selectedId: new URLSearchParams(window.location.search).get("project") || "",
  detail: null,
  activeTab: "overview",
  loading: false
};

const els = {
  list: document.getElementById("rfx-process-project-list"),
  search: document.getElementById("rfx-process-search"),
  status: document.getElementById("rfx-process-status"),
  refresh: document.getElementById("refresh-rfx-process"),
  empty: document.getElementById("rfx-process-empty"),
  detail: document.getElementById("rfx-process-detail"),
  title: document.getElementById("rfx-process-title"),
  subtitle: document.getElementById("rfx-process-subtitle"),
  statusBadge: document.getElementById("rfx-process-status-badge"),
  readiness: document.getElementById("rfx-process-readiness"),
  message: document.getElementById("rfx-process-status-message"),
  panels: document.getElementById("rfx-process-panels"),
  newButton: document.getElementById("new-rfx-project"),
  dialog: document.getElementById("rfx-process-create-dialog"),
  createForm: document.getElementById("rfx-process-create-form")
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(message, tone = "info") {
  if (!els.message) return;
  els.message.textContent = tone === "error" ? humanizeError(message) : message || "";
  els.message.dataset.tone = tone;
}

function statusLabel(status) {
  return String(status || "draft").replace(/_/g, " ");
}

function latest(rows = []) {
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function selectedProject() {
  return state.detail?.project || null;
}

function rfiCompleteness(detail = state.detail) {
  const submission = detail?.rfi_submission;
  if (!submission) return 0;
  return Math.round(Number(submission.completeness_score || 0));
}

function laneIssueCount(lanes = []) {
  return lanes.reduce((sum, lane) => sum + (Array.isArray(lane.validation_issues) ? lane.validation_issues.length : 0), 0);
}

function renderProjectList() {
  if (!els.list) return;
  if (state.loading) {
    els.list.innerHTML = `<article class="rfx-process-project-card">Loading projects...</article>`;
    return;
  }
  if (!state.projects.length) {
    els.list.innerHTML = `<article class="empty-state compact-empty"><strong>No RFx Projects yet</strong><span>Create the first project to send a Customer RFI.</span></article>`;
    return;
  }
  els.list.innerHTML = state.projects.map((project) => `
    <button type="button" class="rfx-process-project-card${project.id === state.selectedId ? " active" : ""}" data-project-id="${escapeHtml(project.id)}">
      <span class="status-pill">${escapeHtml(statusLabel(project.status))}</span>
      <strong>${escapeHtml(project.title)}</strong>
      <small>${escapeHtml(project.customer_name || "No customer")} ${project.due_date ? `| Due ${escapeHtml(project.due_date)}` : ""}</small>
      <span>${Number(project.lane_count || 0)} lane(s) | ${Number(project.package_count || 0)} package(s)</span>
    </button>
  `).join("");
}

function renderShell() {
  const project = selectedProject();
  els.empty?.classList.toggle("hidden", Boolean(project));
  els.detail?.classList.toggle("hidden", !project);
  if (!project) return;
  if (els.title) els.title.textContent = project.title || "RFx Project";
  if (els.subtitle) {
    els.subtitle.textContent = [
      project.customer_name || "No customer",
      project.opportunity_type ? statusLabel(project.opportunity_type) : null,
      project.due_date ? `Due ${project.due_date}` : null
    ].filter(Boolean).join(" | ");
  }
  if (els.statusBadge) els.statusBadge.textContent = statusLabel(project.status);
  if (els.readiness) els.readiness.textContent = `${rfiCompleteness()}%`;
  renderPanels();
}

function metric(label, value, help = "") {
  return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(help)}</small></article>`;
}

function overviewPanel() {
  const detail = state.detail;
  const project = detail.project;
  const submission = detail.rfi_submission;
  const snapshot = latest(detail.demand_snapshots);
  const pack = latest(detail.packages);
  return `
    <section class="rfx-process-panel active">
      <div class="bid-room-metrics">
        ${metric("Customer RFI", submission?.status || "not started", `${rfiCompleteness()}% complete`)}
        ${metric("Demand lanes", detail.lanes.length, `${laneIssueCount(detail.lanes)} validation issue(s)`)}
        ${metric("Snapshots", detail.demand_snapshots.length, snapshot ? snapshot.status : "none")}
        ${metric("RFx packages", detail.packages.length, pack?.linked_rfx_event_id ? "Bid Room linked" : "not launched")}
      </div>
      <div class="rfx-process-flow">
        ${["Customer RFI", "Demand Normalization", "RFx Design", "Bid Room", "Evaluation", "Award Package"].map((step, index) => `
          <article>
            <span>${index + 1}</span>
            <strong>${step}</strong>
            <small>${index === 0 ? "Collect structured customer requirements" : index === 1 ? "Freeze submitted RFI and normalize lanes" : index === 2 ? "Build sourcing packages without exposing internal rate guidance" : index === 3 ? "Launch selected package into Private Bid Room" : index === 4 ? "Compare bids by price, capacity, service and risk" : "Prepare award and implementation handoff"}</small>
          </article>
        `).join("")}
      </div>
      <section class="rfx-process-card">
        <h3>Project controls</h3>
        <div class="action-row">
          <button type="button" data-rfx-action="mark-demand">Move to demand review</button>
          <button type="button" data-rfx-action="mark-evaluation" class="secondary">Move to bid evaluation</button>
          <button type="button" data-rfx-action="archive-project" class="danger">Archive project</button>
          ${project.linked_rfx_event_id ? `<a class="secondary-link" href="./rfx-events.html?event=${escapeHtml(project.linked_rfx_event_id)}">Open linked Bid Room</a>` : ""}
        </div>
      </section>
    </section>
  `;
}

function rfiPanel() {
  const detail = state.detail;
  const latestLink = latest(detail.magic_links);
  const submitted = detail.rfi_submission?.status === "submitted";
  return `
    <section class="rfx-process-panel active">
      <section class="rfx-process-card">
        <div class="split-heading compact">
          <div>
            <p class="eyebrow">Customer intake</p>
            <h3>Customer RFI magic link</h3>
          </div>
          <div class="action-row">
            <button type="button" data-rfx-action="create-rfi-link">Generate link</button>
            ${submitted ? `<button type="button" data-rfx-action="reopen-rfi" class="secondary">Reopen RFI</button>` : ""}
          </div>
        </div>
        <p>Tokens are stored as SHA-256 hashes. Submitted RFI responses are frozen and never mutated by demand normalization.</p>
        ${latestLink ? `
          <div class="rfx-process-link-row">
            <span class="status-pill">${escapeHtml(latestLink.status)}</span>
            <span>Expires ${escapeHtml(latestLink.expires_at || "-")}</span>
            <button type="button" class="secondary small-button" data-rfx-action="revoke-rfi-link" data-link-id="${escapeHtml(latestLink.id)}">Revoke</button>
          </div>
        ` : `<p class="empty-note">No active RFI link generated yet.</p>`}
      </section>
      <section class="rfx-process-card">
        <h3>Submitted structure</h3>
        <div class="bid-room-metrics">
          ${metric("Origins", detail.origins.length)}
          ${metric("Destinations", detail.destinations.length)}
          ${metric("Lanes", detail.lanes.length)}
          ${metric("Completeness", `${rfiCompleteness()}%`)}
          ${metric("Business rules", detail.business_rules?.length || 0)}
          ${metric("Service reqs", detail.service_requirements?.length || 0)}
          ${metric("Carrier profile", detail.carrier_requirements?.length || 0)}
          ${metric("Crossborder", detail.crossborder_details?.length || 0)}
          ${metric("Attachments", detail.attachments?.length || 0)}
          ${metric("Exceptions", detail.exception_notes?.length || 0)}
        </div>
        <div class="rfx-process-table-wrap">
          <table class="rfx-process-table">
            <thead><tr><th>Lane</th><th>Origin</th><th>Destination</th><th>Equipment</th><th>Volume</th><th>Issues</th></tr></thead>
            <tbody>
              ${detail.lanes.map((lane) => `<tr><td>${escapeHtml(lane.lane_id)}</td><td>${escapeHtml(lane.origin_text)}</td><td>${escapeHtml(lane.destination_text)}</td><td>${escapeHtml(lane.equipment_type)}</td><td>${escapeHtml(lane.weekly_volume || lane.monthly_volume || "")}</td><td>${Array.isArray(lane.validation_issues) ? lane.validation_issues.length : 0}</td></tr>`).join("") || `<tr><td colspan="6">No customer lanes submitted yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  `;
}

function demandPanel() {
  const detail = state.detail;
  const snapshot = latest(detail.demand_snapshots);
  const demandLanes = Array.isArray(snapshot?.rfx_demand_lanes) ? snapshot.rfx_demand_lanes : [];
  return `
    <section class="rfx-process-panel active">
      <section class="rfx-process-card">
        <div class="split-heading compact">
          <div>
            <p class="eyebrow">Demand Normalization</p>
            <h3>Frozen RFI snapshot</h3>
          </div>
          <button type="button" data-rfx-action="create-snapshot">Create demand snapshot</button>
        </div>
        <p>Normalization reads the submitted RFI and creates a separate demand snapshot. It does not mutate the customer submission.</p>
      </section>
      <div class="rfx-process-table-wrap">
        <table class="rfx-process-table">
          <thead><tr><th>Lane</th><th>Origin</th><th>Destination</th><th>Segment</th><th>Service</th><th>Volume</th><th>Validation</th></tr></thead>
          <tbody>
            ${demandLanes.map((lane) => `<tr><td>${escapeHtml(lane.lane_key)}</td><td>${escapeHtml(lane.origin)}</td><td>${escapeHtml(lane.destination)}</td><td>${escapeHtml(lane.operating_segment)}</td><td>${escapeHtml(lane.service_type)}</td><td>${escapeHtml(lane.weekly_volume || lane.monthly_volume || "")}</td><td>${Array.isArray(lane.validation_issues) && lane.validation_issues.length ? "Needs fix" : "Ready"}</td></tr>`).join("") || `<tr><td colspan="7">No demand snapshot yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function designPanel() {
  const snapshot = latest(state.detail.demand_snapshots);
  const pack = latest(state.detail.packages);
  const segments = Array.isArray(pack?.rfx_package_segments) ? pack.rfx_package_segments : [];
  return `
    <section class="rfx-process-panel active">
      <section class="rfx-process-card">
        <div class="split-heading compact">
          <div>
            <p class="eyebrow">Capacity sourcing design</p>
            <h3>RFx Package</h3>
          </div>
          <button type="button" data-rfx-action="create-package" ${snapshot ? "" : "disabled"}>Create package</button>
        </div>
        <div class="rfx-process-grid">
          ${metric("Strategy", pack?.sourcing_strategy || "closed bid")}
          ${metric("Pricing", pack?.pricing_structure || "all-in")}
          ${metric("Weights", pack ? `${pack.price_weight}/${pack.capacity_weight}/${pack.service_weight}` : "40/25/20")}
          ${metric("Internal rate guidance", pack?.rate_guidance ? "stored privately" : "not set", "Never exposed to carriers unless explicitly enabled.")}
        </div>
      </section>
      <section class="rfx-process-card rfx-golden-package-preview">
        <div class="split-heading compact">
          <div>
            <p class="eyebrow">Golden Bid Room Card</p>
            <h3>Master RFx package segments</h3>
          </div>
          <span class="status-pill ${segments.length ? "success" : "muted"}">${escapeHtml(`${segments.length || 0} segment(s)`)}</span>
        </div>
        <p>When launched to Bid Room, carriers see one RFx package with route schedule and segment-specific checklists instead of disconnected individual bids.</p>
        <div class="rfx-process-segment-list">
          ${segments.map((segment) => `
            <article>
              <strong>${escapeHtml(segment.segment_name || "General segment")}</strong>
              <span>${escapeHtml([segment.operation, segment.service, segment.equipment, segment.trailer].filter(Boolean).join(" | ") || "Segment")}</span>
              <small>${escapeHtml(`${segment.lane_count || 0} lane(s) | carrier confirms logistics model, operation criteria, business rules, service specs and notes`)}</small>
            </article>
          `).join("") || `<article><strong>No package segments yet.</strong><span>Create package after Demand Snapshot.</span><small>Segments are generated by operation, service, equipment and trailer.</small></article>`}
        </div>
      </section>
    </section>
  `;
}

function bidRoomPanel() {
  const pack = latest(state.detail.packages);
  const eventId = pack?.linked_rfx_event_id || state.detail.project.linked_rfx_event_id;
  return `
    <section class="rfx-process-panel active">
      <section class="rfx-process-card">
        <div class="split-heading compact">
          <div>
            <p class="eyebrow">Bid Room handoff</p>
            <h3>${eventId ? "Linked Bid Room" : "Launch package to Bid Room"}</h3>
          </div>
          ${eventId ? `<a class="page-primary-action" href="./rfx-events.html?event=${escapeHtml(eventId)}">Open Bid Room</a>` : `<button type="button" data-rfx-action="launch-package" ${pack ? "" : "disabled"}>Launch Bid Room</button>`}
        </div>
        <p>The launched event reuses the existing Private Bid Room, invitations, live bids, chat, public board, and award workflow.</p>
      </section>
    </section>
  `;
}

function evaluationPanel() {
  return `
    <section class="rfx-process-panel active">
      <section class="rfx-process-card">
        <h3>Bid Evaluation</h3>
        <p>Use the linked Bid Room for live bid comparisons today. This RFx Process layer stores the evaluation scenario and award package once procurement decides.</p>
        <div class="rfx-process-grid">
          ${metric("Cost", "Normalized all-in", "All rates evaluated from captured bids.")}
          ${metric("Capacity", "Weekly capacity", "Compare awarded and backup capacity.")}
          ${metric("Service", "Transit + fit", "Equipment, operation and service fit.")}
          ${metric("Risk", "Exceptions", "Flags for missing compliance or operational gaps.")}
        </div>
      </section>
    </section>
  `;
}

function awardPanel() {
  const awards = state.detail.award_packages || [];
  return `
    <section class="rfx-process-panel active">
      <section class="rfx-process-card">
        <div class="split-heading compact">
          <div>
            <p class="eyebrow">Award / Implementation Package</p>
            <h3>Scenario package</h3>
          </div>
          <button type="button" data-rfx-action="create-award">Create award package</button>
        </div>
        <div class="rfx-process-table-wrap">
          <table class="rfx-process-table">
            <thead><tr><th>Scenario</th><th>Status</th><th>Type</th><th>Created</th></tr></thead>
            <tbody>${awards.map((row) => `<tr><td>${escapeHtml(row.scenario_name)}</td><td>${escapeHtml(row.status)}</td><td>${escapeHtml(row.scenario_type)}</td><td>${escapeHtml(row.created_at)}</td></tr>`).join("") || `<tr><td colspan="4">No award packages created yet.</td></tr>`}</tbody>
          </table>
        </div>
      </section>
    </section>
  `;
}

function auditPanel() {
  return `
    <section class="rfx-process-panel active">
      <div class="rfx-process-table-wrap">
        <table class="rfx-process-table">
          <thead><tr><th>When</th><th>Action</th><th>Summary</th><th>Actor</th></tr></thead>
          <tbody>${(state.detail.audit || []).map((row) => `<tr><td>${escapeHtml(row.created_at)}</td><td>${escapeHtml(row.action)}</td><td>${escapeHtml(row.summary)}</td><td>${escapeHtml(row.actor_email || row.owner_email)}</td></tr>`).join("") || `<tr><td colspan="4">No audit activity yet.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderPanels() {
  if (!els.panels || !state.detail) return;
  const panels = {
    overview: overviewPanel,
    rfi: rfiPanel,
    demand: demandPanel,
    design: designPanel,
    bidroom: bidRoomPanel,
    evaluation: evaluationPanel,
    award: awardPanel,
    audit: auditPanel
  };
  els.panels.innerHTML = (panels[state.activeTab] || panels.overview)();
}

async function loadProjects() {
  state.loading = true;
  renderProjectList();
  try {
    const result = await fetchRfxProcessProjects({
      search: els.search?.value || "",
      status: els.status?.value || "",
      limit: 100
    });
    state.projects = result.rows || [];
    if (!state.selectedId && state.projects[0]) state.selectedId = state.projects[0].id;
    renderProjectList();
    if (state.selectedId) await loadDetail(state.selectedId);
  } catch (error) {
    els.list.innerHTML = `<article class="empty-state compact-empty"><strong>RFx Projects could not load</strong><span>${escapeHtml(humanizeError(error))}</span></article>`;
  } finally {
    state.loading = false;
  }
}

async function loadDetail(projectId) {
  try {
    state.selectedId = projectId;
    const url = new URL(window.location.href);
    url.searchParams.set("project", projectId);
    window.history.replaceState({}, "", url);
    state.detail = await fetchRfxProcessProject(projectId);
    renderProjectList();
    renderShell();
  } catch (error) {
    setStatus(error, "error");
  }
}

async function handleProjectAction(action, target) {
  const project = selectedProject();
  if (!project) return;
  setStatus("Working...");
  try {
    if (action === "create-rfi-link") {
      const result = await createRfxRfiMagicLink(project.id);
      await navigator.clipboard?.writeText(result.link).catch(() => {});
      setStatus(`Customer RFI link generated and copied: ${result.link}`);
    } else if (action === "revoke-rfi-link") {
      await revokeRfxRfiMagicLink(project.id, target.dataset.linkId);
      setStatus("Customer RFI link revoked.");
    } else if (action === "reopen-rfi") {
      await reopenRfxRfi(project.id);
      setStatus("Customer RFI reopened.");
    } else if (action === "create-snapshot") {
      const result = await createRfxDemandSnapshot(project.id);
      setStatus(`Demand snapshot created with ${result.lanes} lane(s).`);
    } else if (action === "create-package") {
      const snapshot = latest(state.detail.demand_snapshots);
      if (!snapshot) throw new Error("Create a demand snapshot first.");
      const result = await createRfxPackage(project.id, snapshot.id, {
        name: `${project.title} sourcing package`,
        locked: true,
        pricing_structure: "all_in",
        sourcing_strategy: "closed_bid"
      });
      setStatus(`RFx package created with ${result.lanes} lane(s).`);
    } else if (action === "launch-package") {
      const pack = latest(state.detail.packages);
      if (!pack) throw new Error("Create an RFx Package first.");
      const result = await launchRfxPackageToBidRoom(pack.id, { open_now: false });
      setStatus(result.launched ? `Bid Room launched with ${result.lanes} lane(s).` : result.message);
    } else if (action === "create-award") {
      await createRfxAwardPackage(project.id, {
        scenario_name: "Primary award scenario",
        scenario_type: "best_value",
        status: "draft"
      });
      setStatus("Award package created.");
    } else if (action === "mark-demand") {
      await updateRfxProcessProject(project.id, { status: "demand_review" });
      setStatus("Project moved to demand review.");
    } else if (action === "mark-evaluation") {
      await updateRfxProcessProject(project.id, { status: "bid_evaluation" });
      setStatus("Project moved to bid evaluation.");
    } else if (action === "archive-project") {
      if (!window.confirm("Archive this RFx Project?")) return;
      await updateRfxProcessProject(project.id, { status: "archived" });
      setStatus("Project archived.");
      state.selectedId = "";
    }
    await loadProjects();
    if (state.selectedId) await loadDetail(state.selectedId);
  } catch (error) {
    setStatus(error, "error");
  }
}

function initEvents() {
  els.refresh?.addEventListener("click", loadProjects);
  els.search?.addEventListener("input", () => window.setTimeout(loadProjects, 150));
  els.status?.addEventListener("change", loadProjects);
  els.newButton?.addEventListener("click", () => els.dialog?.showModal());
  document.querySelectorAll("[data-dialog-close]").forEach((button) => button.addEventListener("click", () => els.dialog?.close()));
  els.list?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-project-id]");
    if (button) loadDetail(button.dataset.projectId);
  });
  document.querySelector(".rfx-process-tabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rfx-process-tab]");
    if (!button) return;
    state.activeTab = button.dataset.rfxProcessTab;
    document.querySelectorAll("[data-rfx-process-tab]").forEach((tab) => tab.classList.toggle("active", tab === button));
    renderPanels();
  });
  els.panels?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rfx-action]");
    if (button) handleProjectAction(button.dataset.rfxAction, button);
  });
  els.createForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(els.createForm);
    const project = Object.fromEntries(formData.entries());
    try {
      const row = await createRfxProcessProject(project);
      els.dialog?.close();
      els.createForm.reset();
      state.selectedId = row.id;
      await loadProjects();
      setStatus("RFx Project created.");
    } catch (error) {
      setStatus(error, "error");
    }
  });
}

async function init() {
  try {
    initAuthControls();
    await requirePrivatePage();
    initEvents();
    await loadProjects();
  } catch (error) {
    setStatus(error, "error");
  }
}

init();
