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
  markRfxAwardPackageImplementationReady,
  reopenRfxRfi,
  revokeRfxRfiMagicLink,
  saveRfxProcessRfi,
  updateRfxProcessProject
} from "./rfx-process-service.js";

const state = {
  projects: [],
  totalProjects: 0,
  selectedId: new URLSearchParams(window.location.search).get("project") || "",
  detail: null,
  activeTab: "overview",
  rfiEditing: false,
  rfiDraftLanes: [],
  rfiDraftSegments: [],
  rfiSelectedSegmentKeys: [],
  rfiActiveSegmentKey: "crossborder",
  rfiActiveWorkspaceView: "lanes",
  rfiEditingLaneIndex: null,
  loading: false
};

let projectLoadVersion = 0;
let projectDetailLoadVersion = 0;
let projectActionRunning = false;
let projectCreateRunning = false;
let rfxProcessTemplateRunning = false;
let rfxProcessXlsxModulePromise = null;

const RFX_PROCESS_XLSX_MODULE_URL = "https://esm.sh/xlsx@0.18.5";

const els = {
  list: document.getElementById("rfx-process-project-list"),
  search: document.getElementById("rfx-process-search"),
  status: document.getElementById("rfx-process-status"),
  projectCount: document.getElementById("rfx-process-project-count"),
  refresh: document.getElementById("refresh-rfx-process"),
  empty: document.getElementById("rfx-process-empty"),
  detail: document.getElementById("rfx-process-detail"),
  title: document.getElementById("rfx-process-title"),
  subtitle: document.getElementById("rfx-process-subtitle"),
  statusBadge: document.getElementById("rfx-process-status-badge"),
  readiness: document.getElementById("rfx-process-readiness"),
  heroActions: document.getElementById("rfx-process-hero-actions"),
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

function shortDate(value) {
  const raw = String(value || "");
  if (!raw) return "-";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function latest(rows = []) {
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function activeRfiLink(rows = []) {
  return (Array.isArray(rows) ? rows : []).find((link) => {
    if (link?.status !== "active" || link?.revoked_at || link?.submitted_at) return false;
    if (!link?.expires_at) return true;
    const expiresAt = new Date(link.expires_at).getTime();
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
  }) || null;
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
  if (els.projectCount) {
    els.projectCount.textContent = `${state.totalProjects || state.projects.length} project${(state.totalProjects || state.projects.length) === 1 ? "" : "s"}`;
  }
  if (state.loading) {
    els.list.innerHTML = `<div class="rfx-process-table-state">Loading RFx Projects...</div>`;
    return;
  }
  if (!state.projects.length) {
    els.list.innerHTML = `<div class="rfx-process-table-state"><strong>No RFx Projects yet</strong><span>Create the first project to send a Customer RFI.</span></div>`;
    return;
  }
  els.list.innerHTML = `
    <div class="rfx-process-table-wrap rfx-process-project-table-wrap">
      <table class="rfx-process-project-table">
        <thead>
          <tr>
            <th>Project ID</th>
            <th>Project</th>
            <th>Customer</th>
            <th>Contact</th>
            <th>Type</th>
            <th>Status</th>
            <th>Start</th>
            <th>Due</th>
            <th>Segments</th>
            <th>RFI</th>
            <th>Lanes</th>
            <th>Packages</th>
            <th>Bid Room</th>
            <th>Audit</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${state.projects.map((project) => {
            const projectId = String(project.id || "");
            const eventId = project.bid_room_event_id || project.linked_rfx_event_id || "";
            const bidRoomStatus = project.bid_room_status || (eventId ? "linked" : "not launched");
            const projectCode = projectId ? projectId.slice(0, 8) : "-";
            return `
              <tr class="rfx-process-project-row${projectId === state.selectedId ? " active" : ""}" data-project-id="${escapeHtml(projectId)}">
                <td><button type="button" class="rfx-process-project-select" data-project-select data-project-id="${escapeHtml(projectId)}" title="Open project details">${escapeHtml(projectCode)}</button></td>
                <td><button type="button" class="rfx-process-project-name" data-project-select data-project-id="${escapeHtml(projectId)}">${escapeHtml(project.title || "Untitled project")}</button></td>
                <td>${escapeHtml(project.customer_name || "No customer")}</td>
                <td title="${escapeHtml(project.customer_contact_email || "")}">${escapeHtml([project.customer_contact_name, project.customer_contact_email].filter(Boolean).join(" | ") || "-")}</td>
                <td>${escapeHtml(statusLabel(project.opportunity_type || "spot"))}</td>
                <td><span class="status-pill">${escapeHtml(statusLabel(project.status))}</span></td>
                <td>${escapeHtml(shortDate(project.target_start_date))}</td>
                <td>${escapeHtml(shortDate(project.due_date))}</td>
                <td>${escapeHtml(Array.isArray(project.operating_segments) && project.operating_segments.length ? project.operating_segments.join(", ") : "-")}</td>
                <td>${escapeHtml(project.rfi_status || "not started")}</td>
                <td>${Number(project.lane_count || 0)}</td>
                <td>${Number(project.package_count || 0)}</td>
                <td><span class="rfx-process-bidroom-status ${eventId ? "linked" : "muted"}">${escapeHtml(statusLabel(bidRoomStatus))}</span></td>
                <td>${Number(project.audit_count || 0)}</td>
                <td>${escapeHtml(shortDate(project.updated_at || project.created_at))}</td>
                <td><button type="button" class="page-primary-action small-button" data-open-rfx data-project-id="${escapeHtml(projectId)}" title="Open this RFx in a new tab">Open RFx</button></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function openProjectRfx(project) {
  const eventId = project?.bid_room_event_id || project?.linked_rfx_event_id || "";
  const target = eventId
    ? `./rfx-events.html?event=${encodeURIComponent(eventId)}`
    : "./rfx-events.html";
  const opened = window.open(target, "_blank", "noopener,noreferrer");
  if (!opened) setStatus("The RFx could not open in a new tab. Allow pop-ups for Rateware.", "error");
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
  if (els.heroActions) {
    const pack = latest(state.detail.packages);
    const snapshot = latest(state.detail.demand_snapshots);
    const eventId = pack?.linked_rfx_event_id || project.linked_rfx_event_id;
    const progressLink = activeRfiLink(state.detail.magic_links || []);
    els.heroActions.innerHTML = `
      ${!eventId ? `<button type="button" class="secondary small-button" data-rfx-action="create-package" ${snapshot ? "" : "disabled"}>${pack ? "Refresh package" : "Create package"}</button>` : ""}
      ${eventId
        ? `<a class="page-primary-action small-button" href="./rfx-events.html?event=${escapeHtml(eventId)}" target="_blank" rel="noreferrer">Open Bid Room</a>`
        : `<button type="button" class="page-primary-action small-button" data-rfx-action="launch-package" ${pack ? "" : "disabled"}>Launch Bid Room</button>`}
      ${progressLink?.link
        ? `<a class="secondary-link rfx-process-progress-link" href="${escapeHtml(progressLink.link)}" target="_blank" rel="noreferrer">Customer progress</a>`
        : `<button type="button" class="secondary small-button" data-rfx-action="create-rfi-link">Customer progress</button>`}
    `;
  }
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
        ${["Customer RFI", "RFx Design", "Marketplace Preview", "Bid Room", "Award & Closeout"].map((step, index) => `
          <article>
            <span>${index + 1}</span>
            <strong>${step}</strong>
            <small>${index === 0 ? "Collect structured customer requirements" : index === 1 ? "Build the sourcing package and checklist" : index === 2 ? "Review the public marketplace card before launch" : index === 3 ? "Publish the selected package to Bid Room" : "Compare, award and hand off the result"}</small>
          </article>
        `).join("")}
      </div>
      <section class="rfx-process-card">
        <h3>Project controls</h3>
        <div class="action-row">
          <button type="button" data-rfx-action="archive-project" class="danger">Archive project</button>
          ${project.linked_rfx_event_id ? `<a class="secondary-link" href="./rfx-events.html?event=${escapeHtml(project.linked_rfx_event_id)}">Open linked Bid Room</a>` : ""}
        </div>
      </section>
    </section>
  `;
}

function rfiPanelLegacy() {
  const detail = state.detail;
  const currentLink = activeRfiLink(detail.magic_links);
  const latestLink = currentLink || latest(detail.magic_links);
  const activeLinkUrl = String(currentLink?.link || "");
  const submitted = detail.rfi_submission?.status === "submitted";
  return `
    <section class="rfx-process-panel active">
      <section class="rfx-process-card">
        <div class="rfx-rfi-summary-heading">
          <div>
            <p class="eyebrow">Customer intake</p>
            <h3>Customer RFI magic link</h3>
          </div>
          <div class="action-row">
            ${currentLink ? (activeLinkUrl ? `
              <button type="button" data-rfx-action="copy-rfi-link" data-rfi-link="${escapeHtml(activeLinkUrl)}">Copy active link</button>
              <a class="secondary-link" href="${escapeHtml(activeLinkUrl)}" target="_blank" rel="noreferrer">Open RFI</a>
            ` : `<button type="button" class="secondary" data-rfx-action="replace-legacy-rfi-link" data-link-id="${escapeHtml(currentLink.id)}">Replace legacy link</button>`)
              : `<button type="button" data-rfx-action="create-rfi-link">Generate link</button>`}
            ${submitted ? `<button type="button" data-rfx-action="reopen-rfi" class="secondary">Reopen RFI</button>` : ""}
          </div>
        </div>
        <p>One fixed active link is kept per RFI. Only the authenticated project owner can copy or open it; revoke it to invalidate access and issue a replacement.</p>
        ${latestLink ? `
          <div class="rfx-process-link-row">
            <span class="status-pill">${escapeHtml(latestLink.status)}</span>
            <span>Expires ${escapeHtml(latestLink.expires_at || "-")}</span>
            ${currentLink && activeLinkUrl ? `<input class="rfx-process-link-input" value="${escapeHtml(activeLinkUrl)}" readonly aria-label="Active Customer RFI link">` : ""}
            ${currentLink && !activeLinkUrl ? `<span class="warning-text">Legacy link: replace once to make the fixed URL available.</span>` : ""}
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

const RFX_PROCESS_SEGMENTS = [
  ["crossborder", "Crossborder FTL"],
  ["local_ftl", "Local FTL"],
  ["regional_ftl", "Regional FTL"],
  ["national_ftl", "National FTL"],
  ["expedited", "Expedited Ground"],
  ["time_critical", "Time Critical Ground"],
  ["port_drayage_us", "Port Drayage US"],
  ["port_drayage_mx", "Port Drayage MX"]
];

const RFX_RFI_LANE_COLUMNS = [
  { key: "origin_location", label: "Origin location", group: "origin", width: 150, required: true },
  { key: "origin_postal_code", label: "Origin ZIP", group: "origin", width: 82 },
  { key: "origin_shipper", label: "Origin shipper", group: "origin", width: 130 },
  { key: "origin_facility_type", label: "Origin facility", group: "origin", width: 100, list: ["Plant", "DC", "Warehouse", "Crossdock", "Yard", "Port", "Customer site", "Supplier site"] },
  { key: "origin_load_type", label: "Load type", group: "origin", width: 82, list: ["Live", "Drop", "Preload", "Drop & hook"] },
  { key: "origin_average_time_hours", label: "Load hrs", group: "origin", width: 66, type: "number" },
  { key: "origin_schedule_type", label: "Pickup schedule", group: "origin", width: 94, list: ["Appointment", "Window", "FCFS", "Open hours", "Scheduled", "TBD"] },
  { key: "origin_service_window", label: "Pickup window", group: "origin", width: 104 },
  { key: "destination_location", label: "Destination location", group: "destination", width: 150, required: true },
  { key: "destination_postal_code", label: "Destination ZIP", group: "destination", width: 82 },
  { key: "destination_consignee", label: "Destination consignee", group: "destination", width: 130 },
  { key: "destination_facility_type", label: "Destination facility", group: "destination", width: 100, list: ["Plant", "DC", "Warehouse", "Crossdock", "Yard", "Port", "Customer site", "Supplier site"] },
  { key: "destination_unload_type", label: "Unload type", group: "destination", width: 82, list: ["Live", "Drop", "Preload", "Drop & hook"] },
  { key: "destination_average_time_hours", label: "Unload hrs", group: "destination", width: 70, type: "number" },
  { key: "destination_schedule_type", label: "Delivery schedule", group: "destination", width: 98, list: ["Appointment", "Window", "FCFS", "Open hours", "Scheduled", "TBD"] },
  { key: "destination_service_window", label: "Delivery window", group: "destination", width: 104 },
  { key: "truck_type", label: "Truck type", group: "service", width: 104, list: ["Truck Trailer", "Straight Truck", "Sprinter Van", "Cargo Van", "Box Truck"] , required: true },
  { key: "trailer_requirements", label: "Equipment", group: "service", width: 98, list: ["Dry Van", "Reefer", "Flatbed", "Step Deck", "Tanker", "Specialized"] },
  { key: "config", label: "Configuration", group: "service", width: 90, list: ["Single", "Team", "Dedicated", "Drop Trailer", "Through Trailer"] },
  { key: "operation_type", label: "Operation", group: "service", width: 96, list: ["D2D Export", "D2D Import", "Intra-Mex", "MX domestic", "US domestic", "Crossborder", "Local", "Regional", "National"] },
  { key: "service_type", label: "Service", group: "service", width: 86, list: ["Standard", "Expedited", "Time critical", "Dedicated", "Spot", "Recurring"] },
  { key: "border_crossing", label: "Border city", group: "crossborder", width: 116 },
  { key: "average_border_days", label: "Border days", group: "crossborder", width: 72, type: "number" },
  { key: "customs_broker", label: "Customs broker", group: "crossborder", width: 116 },
  { key: "transfer", label: "Transfer", group: "crossborder", width: 104 },
  { key: "product", label: "Product / HS", group: "cargo", width: 116 },
  { key: "hazmat", label: "Hazmat", group: "cargo", width: 56, type: "checkbox" },
  { key: "hazmat_un_number", label: "UN number", group: "cargo", width: 74 },
  { key: "temperature_controlled", label: "Temp ctrl", group: "cargo", width: 62, type: "checkbox" },
  { key: "cargo_value", label: "Cargo value", group: "cargo", width: 82, type: "number" },
  { key: "packaging", label: "Packaging", group: "cargo", width: 86, list: ["Palletized", "Cartons", "Crated", "Bulk", "Other"] },
  { key: "pieces", label: "Pieces", group: "cargo", width: 58, type: "number" },
  { key: "stackable_beds", label: "Stackable beds", group: "cargo", width: 74, type: "checkbox" },
  { key: "average_weight", label: "Avg. weight", group: "cargo", width: 74, type: "number" },
  { key: "average_cubic_meters", label: "Avg. m3", group: "cargo", width: 64, type: "number" },
  { key: "mon_volume", label: "Mon", group: "volume", width: 48, type: "number" },
  { key: "tue_volume", label: "Tue", group: "volume", width: 48, type: "number" },
  { key: "wed_volume", label: "Wed", group: "volume", width: 48, type: "number" },
  { key: "thu_volume", label: "Thu", group: "volume", width: 48, type: "number" },
  { key: "fri_volume", label: "Fri", group: "volume", width: 48, type: "number" },
  { key: "sat_volume", label: "Sat", group: "volume", width: 48, type: "number" },
  { key: "sun_volume", label: "Sun", group: "volume", width: 48, type: "number" },
  { key: "sourcing_priority", label: "Sourcing priority", group: "planning", width: 106, list: ["Critical", "High", "Normal", "Low"] },
  { key: "last_annual_volume", label: "Annual volume", group: "planning", width: 84, type: "number" },
  { key: "weekly_volume", label: "Weekly volume", group: "planning", width: 88, type: "number", required: true },
  { key: "seasonality", label: "Seasonality", group: "planning", width: 84, list: ["Stable", "Peak Q1", "Peak Q2", "Peak Q3", "Peak Q4", "Variable"] },
  { key: "scheduling_type", label: "Scheduling", group: "planning", width: 90, list: ["Forecast", "Fixed schedule", "On demand", "Tender"] },
  { key: "positioning_lead_time", label: "Positioning lead", group: "planning", width: 92, list: ["Same day", "24 hours", "48 hours", "72 hours", "1 week"] },
  { key: "driver_assistance", label: "Driver assist", group: "planning", width: 62, type: "checkbox" },
  { key: "double_driver", label: "Team driver", group: "planning", width: 62, type: "checkbox" },
  { key: "transit_days", label: "Transit days", group: "planning", width: 72, type: "number" },
  { key: "average_distance", label: "Distance", group: "planning", width: 72, type: "number" },
  { key: "target_rate", label: "Target rate", group: "commercial", width: 82, type: "number" },
  { key: "currency", label: "Currency", group: "commercial", width: 60, list: ["USD", "MXN", "CAD"] },
  { key: "service_specifications", label: "Service specifications", group: "notes", width: 180, type: "textarea" },
  { key: "notes", label: "Operational notes", group: "notes", width: 180, type: "textarea" }
];

const RFX_RFI_GROUP_LABELS = {
  origin: "Origin",
  destination: "Destination",
  service: "Service & equipment",
  crossborder: "Crossborder",
  cargo: "Cargo",
  volume: "Weekly pattern",
  planning: "Planning",
  commercial: "Commercial",
  notes: "Requirements & notes"
};

const RFX_RUBRIC_GROUPS = [
  ["logistics_model", "Logistics model"],
  ["operation_criteria", "Operation criteria"],
  ["business_rules", "Business rules"],
  ["service_specifications", "Service specifications"],
  ["carrier_requirements", "Required carrier profile"],
  ["other_notes", "Notes and exceptions"]
];

const RFX_RUBRIC_DEFAULTS = {
  logistics_model: [
    ["Expedited", "How urgent is the freight? Same-day pickup, team driver or 24/7 availability?", "Maximum response hours, pickup window, transit time and escalation level"],
    ["Time critical", "What is the SLA? Are there fixed windows or penalties?", "OTIF target, cut-off, appointments and penalty terms"],
    ["Crossborder", "Which crossing, broker, transfer, B1 or Carta Porte model applies?", "Crossing, MX/US broker, documents and transfer model"],
    ["Local", "Is this a shuttle, milk run, drop move or recurring route?", "Daily frequency, stops and cycle time"],
    ["Regional", "What coverage radius, return or layover model is required?", "Distance, transit days and operating windows"],
    ["National", "Is this long haul, security-sensitive or team-driver freight?", "Transit time, tracking, stops and insurance"],
  ],
  operation_criteria: [
    ["Pickup window", "What is the pickup start and end time?", "Start time / end time"],
    ["Delivery window", "What is the delivery start and end time?", "Start time / end time"],
    ["Appointment required", "Is an appointment required and who schedules it?", "Yes / No / scheduling owner"],
    ["Load type", "How is the load handled?", "Live / Drop / Preload"],
    ["Unload type", "How is the delivery handled?", "Live / Drop / Drop & hook"],
    ["Load time", "What is the expected loading time?", "Hours"],
    ["Unload time", "What is the expected unloading time?", "Hours"],
    ["Operational contact", "Who is the operating contact?", "Name / phone / email"],
    ["Site instructions", "What instructions must the driver follow?", "Site instructions"],
    ["Access rules", "What access rules or site checklist applies?", "Text / checklist"],
    ["Tracking", "What tracking is required?", "GPS / check calls / both"],
    ["Update cadence", "How often must updates be provided?", "1h / 2h / 4h / milestone"],
    ["Escalation", "Who owns escalation and what is the SLA/channel?", "Contact / SLA / channel"],
  ],
  business_rules: [
    ["Payment terms", "What payment terms apply?", "Net 15 / 30 / 45 / other"],
    ["Currency", "Which currency should be used?", "MXN / USD"],
    ["Fuel surcharge", "Is fuel included, indexed or separate?", "Included / indexed / separate"],
    ["Detention", "What free time and rate apply?", "Free time + rate"],
    ["Layover", "When does layover apply and at what rate?", "Condition + rate"],
    ["TONU", "When does TONU apply and at what rate?", "Condition + rate"],
    ["Redelivery", "Does redelivery apply?", "Yes / No / condition"],
    ["Border wait", "Who pays border wait and from what point?", "Payer + start time"],
    ["Cancellation", "What notice and charge apply to cancellation?", "Notice + charge"],
    ["Claims", "What is the claims process, timing and documentation?", "Process + deadline + documents"],
    ["Insurance", "What cargo value and liability requirements apply?", "Coverage limits and requirements"],
    ["Penalties", "Are there late pickup, late delivery or no-show penalties?", "Trigger + amount"],
  ],
  service_specifications: [
    ["Equipment", "What type, length, age and configuration is required?", "Equipment standard"],
    ["Driver", "Is single, team, B1 or hazmat capability required?", "Driver requirement"],
    ["Trailer", "What trailer type is required?", "Dry van / reefer / flatbed / specialized"],
    ["Temperature", "What temperature range and tolerance applies?", "Range + tolerance"],
    ["Seals", "Are seals required and what type?", "Required / type"],
    ["Security", "What GPS, route and stop restrictions apply?", "Security standard"],
    ["Documents", "Which transport and customs documents are required?", "BOL, POD, invoice, pedimento, Carta Porte, etc."],
    ["POD", "How quickly must valid POD be delivered?", "Maximum hours"],
    ["Tracking", "Which tracking method is accepted?", "GPS link / ELD / app / check call"],
    ["Communication", "Which communication channel is required?", "TMS / email / WhatsApp / phone"],
    ["Reports", "What reporting cadence is required?", "Daily / event / dashboard"],
  ],
  carrier_requirements: [
    ["Carrier type", "What type of carrier may operate this business?", "Asset-based / broker / 3PL / mixed"],
    ["MC / DOT", "Must authority be owned by the carrier?", "Own / partner / not required"],
    ["MX permits", "Are Mexican permits required?", "Required / not required"],
    ["MX-US experience", "What crossborder experience is required?", "Basic / proven / mandatory"],
    ["Owned fleet", "Is owned fleet required or preferred?", "Yes / No / preferred"],
    ["Cargo insurance", "What minimum cargo insurance is required?", "Minimum amount"],
    ["Liability insurance", "What minimum liability insurance is required?", "Minimum amount"],
    ["GPS", "Is GPS mandatory or preferred?", "Mandatory / preferred"],
    ["Certifications", "Which certifications are required or preferred?", "CTPAT / FAST / OEA / Hazmat"],
    ["Pre-approval", "Is prior approval required?", "Yes / No"],
    ["Preferred or excluded", "Are there preferred or excluded carriers?", "Carrier list"],
  ],
  other_notes: [
    ["Site restriction", "Are there access or site-time restrictions?", "Restriction and response"],
    ["Carrier restriction", "Are brokers, asset-only or specific providers restricted?", "Restriction and response"],
    ["Document restriction", "Is sealed POD or another document mandatory?", "Required evidence"],
    ["Security restriction", "Are route stops or parking restrictions required?", "Security instruction"],
    ["Crossborder restriction", "Is a specific crossing or customs model mandatory?", "Crossing and documents"],
    ["Financial restriction", "Do accessorials require prior approval?", "Approval rule"],
    ["Seasonal exception", "Does volume or operating policy change by season?", "Season and change"],
    ["Known risk", "Are there known congestion, border or site risks?", "Risk and mitigation"],
  ]
};

function rfxProcessText(value) {
  return String(value ?? "").trim();
}

function rfxProcessSegmentValues(submission = {}, project = {}) {
  const values = submission.operating_segments || project.operating_segments || [];
  const aliases = { local: "local_ftl", regional: "regional_ftl", national: "national_ftl", expedited_ground: "expedited", time_critical_ground: "time_critical", port_drayage: "port_drayage_us" };
  return new Set((Array.isArray(values) ? values : []).map((item) => rfxProcessText(item?.value || item?.segment || item)).map((value) => aliases[value] || value).filter(Boolean));
}

function rfxProcessLaneValue(lane = {}, key) {
  const fallbacks = {
    origin_location: ["origin_text", "origin_name"], origin_shipper: ["origin_contact_name"], origin_facility_type: ["origin_facility"], origin_load_type: ["origin_handling_type"], origin_schedule_type: ["origin_schedule"], origin_average_time_hours: ["origin_average_time_hours"],
    destination_location: ["destination_text", "destination_name"], destination_consignee: ["destination_contact_name"], destination_facility_type: ["destination_facility"], destination_unload_type: ["destination_handling_type"], destination_schedule_type: ["destination_schedule"], destination_average_time_hours: ["destination_average_time_hours"],
    truck_type: ["equipment_type"], product: ["commodity"], cargo_value: ["cargo_value"], average_weight: ["weight"], average_cubic_meters: ["dimensions"], service_specifications: ["special_requirements"],
    border_crossing: ["border_crossing", "mx_crossing", "us_crossing"], average_border_days: ["expected_border_time_hours"], notes: ["other_notes"]
  };
  const direct = lane[key];
  if (direct !== undefined && direct !== null) return direct;
  for (const fallback of fallbacks[key] || []) if (lane[fallback] !== undefined && lane[fallback] !== null) return lane[fallback];
  const raw = lane.raw_payload && typeof lane.raw_payload === "object" ? lane.raw_payload : {};
  if (raw[key] !== undefined && raw[key] !== null) return raw[key];
  for (const fallback of fallbacks[key] || []) if (raw[fallback] !== undefined && raw[fallback] !== null) return raw[fallback];
  return "";
}

function rfxProcessNormalizeImportHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[#¿?]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const RFX_PROCESS_IMPORT_ALIASES = {
  lane_id: ["lane id", "id lane", "id", "lane", "id #", "id ruta", "id de lane"],
  origin_location: ["origin location", "origin", "orig city", "origin city", "ubicacion de salida", "salida", "origen", "ciudad de origen"],
  origin_postal_code: ["origin zip", "origin postal code", "orig postal code", "codigo postal de salida", "cp salida", "codigo postal origen"],
  origin_shipper: ["origin shipper", "shipper", "remitente de salida", "remitente"],
  origin_facility_type: ["origin facility", "tipo de instalacion de salida", "tipo instalacion salida"],
  origin_load_type: ["load type", "tipo de carga", "tipo de carga salida"],
  origin_average_time_hours: ["load hrs", "load time", "tiempo promedio de carga", "tiempo carga"],
  origin_schedule_type: ["pickup schedule", "tipo de horario de recogida", "horario recogida"],
  origin_service_window: ["pickup window", "ventana de servicio de recogida", "ventana recogida"],
  destination_location: ["destination location", "destination", "dest city", "destination city", "ubicacion de llegada", "llegada", "destino", "ciudad de destino"],
  destination_postal_code: ["destination zip", "destination postal code", "dest postal code", "codigo postal de llegada", "cp llegada", "codigo postal destino"],
  destination_consignee: ["destination consignee", "consignee", "consignatario de llegada", "consignatario"],
  destination_facility_type: ["destination facility", "tipo de instalacion de llegada", "tipo instalacion llegada"],
  destination_unload_type: ["unload type", "tipo de descarga"],
  destination_average_time_hours: ["unload hrs", "unload time", "tiempo promedio de descarga", "tiempo descarga"],
  destination_schedule_type: ["delivery schedule", "tipo de horario de entrega", "horario entrega"],
  destination_service_window: ["delivery window", "ventana de servicio de entrega", "ventana entrega"],
  truck_type: ["truck type", "tipo de camion", "tipo de camión", "camion"],
  trailer_requirements: ["equipment", "trailer", "tipo de equipo", "tipo equipo"],
  config: ["configuration", "config", "tipo de configuracion", "tipo de configuración"],
  operation_type: ["operation", "tipo de operacion", "tipo de operación"],
  service_type: ["service", "tipo de servicio"],
  border_crossing: ["border city", "border crossing", "punto de cruce fronterizo", "cruce fronterizo"],
  average_border_days: ["border days", "promedio de dias en la frontera", "promedio de días en la frontera"],
  customs_broker: ["customs broker", "agente aduanal"],
  transfer: ["transfer"],
  product: ["product", "product hs", "producto", "codigo hs", "código hs"],
  hazmat: ["hazmat", "hazmat?", "es hazmat"],
  hazmat_un_number: ["un number", "insert un number", "numero un", "número un"],
  temperature_controlled: ["temperature controlled", "temp ctrl", "temperatura controlada"],
  cargo_value: ["cargo value", "cargo value invoice", "valor de carga", "valor de carga factura"],
  packaging: ["packaging", "embalaje"],
  pieces: ["pieces", "piezas"],
  average_weight: ["average weight", "peso promedio", "peso"],
  average_cubic_meters: ["average cubic meters", "metros cubicos promedio", "metros cúbicos promedio", "m3"],
  weekly_volume: ["weekly volume", "expected weekly volume", "volumen semanal esperado", "volumen semanal"],
  sourcing_priority: ["sourcing priority", "prioridad de abastecimiento"],
  last_annual_volume: ["last annual volume", "ultimo volumen anual", "último volumen anual"],
  seasonality: ["seasonality", "estacionalidad"],
  scheduling_type: ["scheduling type", "tipo de programacion", "tipo de programación"],
  positioning_lead_time: ["positioning lead", "lead time para posicionar", "lead time"],
  driver_assistance: ["driver assist", "asistencia del conductor", "asistencia conductor"],
  double_driver: ["team driver", "double driver", "doble chofer", "doble conductor"],
  transit_days: ["transit days", "tiempo estimado de transito", "tiempo estimado de tránsito"],
  average_distance: ["distance", "distancia promedio", "distancia"],
  target_rate: ["target rate", "tarifa objetivo de compra", "tarifa objetivo"],
  currency: ["currency", "moneda"],
  service_specifications: ["service specifications", "especificaciones de servicio", "especificaciones de servicio sobre condiciones"],
  notes: ["operational notes", "additional notes", "notas adicionales sobre la operacion", "notas adicionales sobre la operación", "otras notas", "notas"],
  stackable_beds: ["stackable beds", "stackable bed", "camas apilables"]
};

const RFX_PROCESS_IMPORT_META_ALIASES = {
  operating_segment: ["operating segment", "segment", "segment key", "clave segmento", "segmento", "clave de segmento"],
  segment_key: ["segment key", "clave segmento", "clave de segmento"]
};

function rfxProcessImportHeaderAliases(column) {
  return new Set([
    rfxProcessNormalizeImportHeader(column.key),
    rfxProcessNormalizeImportHeader(column.label),
    ...(RFX_PROCESS_IMPORT_ALIASES[column.key] || RFX_PROCESS_IMPORT_META_ALIASES[column.key] || []).map(rfxProcessNormalizeImportHeader)
  ].filter(Boolean));
}

function rfxProcessImportHeaderIndex(headers, aliases) {
  const exact = headers.findIndex((header) => aliases.has(header));
  if (exact >= 0) return exact;
  return headers.findIndex((header) => [...aliases].some((alias) => (
    alias.length >= 5 && (header.startsWith(`${alias} `) || header.endsWith(` ${alias}`))
  )));
}

function rfxProcessCanonicalSegmentKey(value, fallback = "crossborder") {
  const normalized = rfxProcessNormalizeImportHeader(value).replace(/\s+/g, "_");
  const aliases = {
    local: "local_ftl", regional: "regional_ftl", national: "national_ftl", expedited_ground: "expedited",
    time_critical_ground: "time_critical", port_drayage: "port_drayage_us", port_drayage_mexico: "port_drayage_mx",
    crossborder_ftl: "crossborder"
  };
  const match = RFX_PROCESS_SEGMENTS.find(([key, label]) => (
    normalized === rfxProcessNormalizeImportHeader(key).replace(/\s+/g, "_")
      || normalized === rfxProcessNormalizeImportHeader(label).replace(/\s+/g, "_")
  ));
  return match?.[0] || aliases[normalized] || rfxProcessText(fallback);
}

function rfxProcessIsAuxiliaryTemplateSheet(sheetName) {
  const normalized = rfxProcessNormalizeImportHeader(sheetName);
  return ["instruction", "instructivo", "catalog", "catalogo", "validation", "validacion", "rubric", "checklist", "details", "detalles"].some((value) => normalized.includes(value));
}

function rfxProcessTemplateDetails(workbook, XLSX) {
  const sheetName = (workbook.SheetNames || []).find((name) => {
    const normalized = rfxProcessNormalizeImportHeader(name);
    return normalized.includes("segment details") || normalized.includes("detalles del segmento") || normalized.includes("detalles segmento");
  });
  if (!sheetName) return {};
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false, blankrows: false });
  const details = {};
  rows.slice(0, 8).forEach((row) => {
    const key = rfxProcessNormalizeImportHeader(row?.[0]).replace(/\s+/g, "_");
    if (key) details[key] = rfxProcessText(row?.[1]);
  });
  return details;
}

const RFX_PROCESS_RUBRIC_ALIASES = {
  segment_key: ["segment key", "segment", "clave segmento", "clave de segmento"],
  segment_name: ["segment name", "name", "nombre segmento", "nombre del segmento"],
  rubric_key: ["rubric key", "rubric id", "clave rubro", "clave de rubro"],
  category: ["category", "rubric category", "categoria", "categoría"],
  label: ["label", "rubric", "topic", "rubro", "tema"],
  question: ["question", "what to ask", "que preguntar", "qué preguntar"],
  expected: ["expected", "expected answer", "respuesta esperada"],
  required: ["required", "obligatorio", "requerido"],
  observation: ["response notes", "response / notes", "observation", "observations", "respuesta observaciones", "respuesta / observaciones"]
};

function rfxProcessRubricCategory(value) {
  const normalized = rfxProcessNormalizeImportHeader(value).replace(/\s+/g, "_");
  const aliases = {
    logistics_model: "logistics_model", logistics_model_by_operating_segment: "logistics_model", modelo_logistico: "logistics_model",
    operation_criteria: "operation_criteria", criterios_de_operacion: "operation_criteria",
    business_rules: "business_rules", reglas_de_negocio: "business_rules",
    service_specifications: "service_specifications", especificaciones_de_servicio: "service_specifications",
    carrier_requirements: "carrier_requirements", carrier_profile: "carrier_requirements", perfil_requerido_del_carrier: "carrier_requirements",
    other_notes: "other_notes", notas_y_excepciones: "other_notes", otras_notas: "other_notes"
  };
  return aliases[normalized] || normalized || "other_notes";
}

function rfxProcessFindRubricSheet(workbook, XLSX, excludedSheet = "") {
  let best = null;
  for (const sheetName of workbook.SheetNames || []) {
    if (sheetName === excludedSheet || !rfxProcessIsAuxiliaryTemplateSheet(sheetName)) continue;
    const normalizedSheet = rfxProcessNormalizeImportHeader(sheetName);
    if (!normalizedSheet.includes("rubric") && !normalizedSheet.includes("checklist") && !normalizedSheet.includes("rubro")) continue;
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false, blankrows: false });
    for (let headerIndex = 0; headerIndex < Math.min(rows.length, 30); headerIndex += 1) {
      const mapping = {};
      for (const [key, aliases] of Object.entries(RFX_PROCESS_RUBRIC_ALIASES)) {
        mapping[key] = rfxProcessImportHeaderIndex(rows[headerIndex].map(rfxProcessNormalizeImportHeader), new Set(aliases.map(rfxProcessNormalizeImportHeader)));
      }
      const score = Object.values(mapping).filter((index) => index >= 0).length;
      if (!best || score > best.score) best = { sheetName, rows, headerIndex, mapping, score };
    }
  }
  return best && best.score >= 4 ? best : null;
}

function rfxProcessFindImportSheet(workbook, XLSX) {
  let best = null;
  for (const sheetName of workbook.SheetNames || []) {
    if (rfxProcessIsAuxiliaryTemplateSheet(sheetName)) continue;
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: false });
    const limit = Math.min(rows.length, 80);
    for (let headerIndex = 0; headerIndex < limit; headerIndex += 1) {
      const headers = rows[headerIndex].map(rfxProcessNormalizeImportHeader);
      const mapping = {};
      for (const column of [{ key: "lane_id", label: "Lane ID" }, ...RFX_RFI_LANE_COLUMNS, { key: "operating_segment", label: "Operating segment" }]) {
        const aliases = rfxProcessImportHeaderAliases(column);
        const index = rfxProcessImportHeaderIndex(headers, aliases);
        if (index >= 0) mapping[column.key] = index;
      }
      const required = ["origin_location", "destination_location", "truck_type", "weekly_volume"].filter((key) => Number.isInteger(mapping[key])).length;
      const routeNameBonus = /route|ruta|cedula/.test(rfxProcessNormalizeImportHeader(sheetName)) ? 4 : 0;
      const score = Object.keys(mapping).length + required * 4 + routeNameBonus;
      if (!best || score > best.score) best = { sheetName, rows, headerIndex, mapping, score };
    }
  }
  return best;
}

function rfxProcessImportedValue(column, value) {
  if (value === null || value === undefined) return "";
  if (column.type === "checkbox") return ["true", "yes", "si", "sí", "1", "x", "checked"].includes(String(value).trim().toLowerCase());
  if (column.type === "number") {
    const normalized = String(value).replace(/[$,\s]/g, "").replace(/\(([^)]+)\)/, "-$1");
    const number = Number(normalized);
    return Number.isFinite(number) ? number : "";
  }
  return String(value).trim();
}

function rfxProcessIsTemplateGuideRow(lane) {
  const values = [lane.lane_id, lane.origin_location, lane.destination_location, lane.truck_type].map((value) => rfxProcessNormalizeImportHeader(value));
  const placeholders = new Set(["id", "id de ruta", "lane id", "city state", "5 digit", "5 digit zip", "select", "seleccionar"]);
  return placeholders.has(values[0]) || (placeholders.has(values[1]) && placeholders.has(values[2])) || (values[1].includes("city state") && values[2].includes("city state"));
}

async function importRfxProcessTemplate(file, activeSegmentKey = state.rfiActiveSegmentKey) {
  if (!file || !/\.(xlsx|xls|csv)$/i.test(file.name || "")) throw new Error("Choose an XLSX, XLS, or CSV Customer RFI template.");
  if (!rfxProcessXlsxModulePromise) rfxProcessXlsxModulePromise = import(RFX_PROCESS_XLSX_MODULE_URL);
  const XLSX = await rfxProcessXlsxModulePromise;
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const selected = rfxProcessFindImportSheet(workbook, XLSX);
  if (!selected || !selected.mapping.origin_location || !selected.mapping.destination_location || (!selected.mapping.truck_type && !selected.mapping.weekly_volume)) {
    throw new Error("The segment template does not contain the required route columns: origin, destination, truck type, or weekly volume.");
  }
  const activeKey = rfxProcessCanonicalSegmentKey(activeSegmentKey);
  const details = rfxProcessTemplateDetails(workbook, XLSX);
  const templateKey = rfxProcessCanonicalSegmentKey(details.segment_key || details.segment || "", "");
  if (templateKey && templateKey !== activeKey) {
    const templateName = details.segment_name || details.segment || templateKey;
    throw new Error(`This template belongs to segment "${templateName}". Select that segment before importing.`);
  }
  const columns = [{ key: "lane_id", label: "Lane ID" }, ...RFX_RFI_LANE_COLUMNS];
  const imported = selected.rows.slice(selected.headerIndex + 1).map((cells, rowIndex) => {
    const lane = { lane_id: `L${rowIndex + 1}`, operating_segment: activeKey };
    for (const column of columns) {
      const sourceIndex = selected.mapping[column.key];
      if (!Number.isInteger(sourceIndex)) continue;
      lane[column.key] = rfxProcessImportedValue(column, cells[sourceIndex]);
    }
    const sourceSegmentIndex = selected.mapping.operating_segment;
    if (Number.isInteger(sourceSegmentIndex) && rfxProcessText(cells[sourceSegmentIndex])) lane.operating_segment = rfxProcessCanonicalSegmentKey(cells[sourceSegmentIndex], activeKey);
    return lane;
  }).filter((lane) => (rfxProcessText(lane.origin_location) || rfxProcessText(lane.destination_location) || rfxProcessText(lane.truck_type)) && !rfxProcessIsTemplateGuideRow(lane));
  const rubricSheet = rfxProcessFindRubricSheet(workbook, XLSX, selected.sheetName);
  const importedRubrics = (rubricSheet?.rows || [])
    .slice(rubricSheet.headerIndex + 1)
    .map((cells, index) => {
      const get = (key) => {
        const sourceIndex = rubricSheet.mapping[key];
        return Number.isInteger(sourceIndex) ? rfxProcessText(cells[sourceIndex]) : "";
      };
      const label = get("label");
      if (!label || ["label", "rubric", "topic", "rubro"].includes(rfxProcessNormalizeImportHeader(label))) return null;
      return {
        rubricKey: get("rubric_key") || `imported_${index + 1}`,
        category: rfxProcessRubricCategory(get("category")),
        label,
        question: get("question"),
        expected: get("expected"),
        required: ["true", "yes", "si", "sí", "1", "x", "verdadero"].includes(get("required").toLowerCase()),
        observation: get("observation")
      };
    })
    .filter(Boolean);
  if (!imported.length && !importedRubrics.length) throw new Error("No route or checklist rows were found in the segment template.");
  const current = Array.isArray(state.rfiDraftLanes) ? state.rfiDraftLanes : [];
  state.rfiDraftLanes = [...current, ...imported.map((lane, index) => ({ ...lane, lane_id: rfxProcessText(lane.lane_id) || `L${current.length + index + 1}` }))];
  if (importedRubrics.length) {
    const segmentIndex = state.rfiDraftSegments.findIndex((segment) => segment.segment_key === activeKey);
    const segments = Array.isArray(state.rfiDraftSegments) ? [...state.rfiDraftSegments] : [];
    const segment = { ...(segments[segmentIndex] || rfxProcessDefaultChecklistSegment(activeKey, segmentIndex < 0 ? segments.length : segmentIndex)) };
    const rubricItems = { ...(segment.rubric_items || {}) };
    importedRubrics.forEach((rubric) => {
      rubricItems[rubric.rubricKey] = {
        category: rubric.category,
        label: rubric.label,
        question: rubric.question,
        expected: rubric.expected,
        required: rubric.required,
        observation: rubric.observation
      };
    });
    segment.rubric_items = rubricItems;
    if (segmentIndex >= 0) segments[segmentIndex] = segment;
    else segments.push(segment);
    state.rfiDraftSegments = segments;
  }
  state.rfiActiveWorkspaceView = "lanes";
  renderPanels();
  setStatus(`${imported.length} route(s) added to ${activeKey} from ${selected.sheetName}. ${importedRubrics.length} checklist row(s) updated. Existing routes were preserved.`);
}

async function downloadRfxProcessTemplate(activeSegmentKey = state.rfiActiveSegmentKey) {
  if (!rfxProcessXlsxModulePromise) rfxProcessXlsxModulePromise = import(RFX_PROCESS_XLSX_MODULE_URL);
  const XLSX = await rfxProcessXlsxModulePromise;
  const segmentKey = rfxProcessCanonicalSegmentKey(activeSegmentKey);
  const segmentName = RFX_PROCESS_SEGMENTS.find(([key]) => key === segmentKey)?.[1] || segmentKey;
  const headers = ["Lane ID", ...RFX_RFI_LANE_COLUMNS.map((column) => column.label)];
  const workbook = XLSX.utils.book_new();
  const routeSheet = XLSX.utils.aoa_to_sheet([headers, Array(headers.length).fill("")]);
  routeSheet["!cols"] = headers.map((header) => ({ wch: Math.min(28, Math.max(12, String(header).length + 2)) }));
  let columnNumber = headers.length;
  let lastColumn = "";
  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;
    lastColumn = String.fromCharCode(65 + remainder) + lastColumn;
    columnNumber = Math.floor((columnNumber - 1) / 26);
  }
  routeSheet["!autofilter"] = { ref: `A1:${lastColumn}1` };
  XLSX.utils.book_append_sheet(workbook, routeSheet, "Route Schedule");
  const activeSegment = (Array.isArray(state.rfiDraftSegments) ? state.rfiDraftSegments : []).find((segment) => segment.segment_key === segmentKey) || rfxProcessDefaultChecklistSegment(segmentKey, 0);
  const detailSheet = XLSX.utils.aoa_to_sheet([
    ["Field", "Value"],
    ["Segment key", segmentKey],
    ["Segment name", activeSegment.segment_name || segmentName],
    ["Operation model", activeSegment.operation_type || ""],
    ["Template version", "segment-v1"]
  ]);
  detailSheet["!cols"] = [{ wch: 24 }, { wch: 52 }];
  XLSX.utils.book_append_sheet(workbook, detailSheet, "Segment Details");
  const rubricHeaders = ["Segment key", "Segment name", "Rubric key", "Category", "Label", "Question", "Expected answer", "Required", "Response / notes"];
  const rubricRows = RFX_RUBRIC_GROUPS.flatMap(([groupKey, groupLabel]) => rfxProcessRubricRows(activeSegment, groupKey).map(([rubricKey, item]) => [
    segmentKey,
    activeSegment.segment_name || segmentName,
    rubricKey,
    groupKey,
    item.label || groupLabel,
    item.question || "",
    item.expected || "",
    item.required === true ? "TRUE" : "FALSE",
    item.observation || ""
  ]));
  const rubricSheet = XLSX.utils.aoa_to_sheet([rubricHeaders, ...rubricRows]);
  rubricSheet["!cols"] = [18, 28, 30, 26, 30, 56, 44, 12, 48].map((wch) => ({ wch }));
  rubricSheet["!autofilter"] = { ref: `A1:I${Math.max(1, rubricRows.length + 1)}` };
  XLSX.utils.book_append_sheet(workbook, rubricSheet, "Rubric Checklist");
  const instructions = XLSX.utils.aoa_to_sheet([
    ["RATEWARE CUSTOMER RFI TEMPLATE"],
    ["Segment", `${segmentName} (${segmentKey})`],
    ["Purpose", "Complete the route schedule for this segment and upload it from Edit RFI."],
    ["Required", "Origin location, destination location, truck type and weekly volume."],
    ["Import behavior", "Imported rows are added only to the active segment; existing routes are not deleted."],
    ["Values", "Dropdown-like catalog values are suggested in the app, but free text is accepted."],
    ["Checklist", "Edit Rubric Checklist to adjust the questions, expected answer, Required TRUE/FALSE, and response notes for this segment."],
    ["Important", "This template captures customer requirements. Do not enter carrier rates."]
  ]);
  instructions["!cols"] = [{ wch: 22 }, { wch: 120 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "Instructions");
  XLSX.writeFile(workbook, `rateware-customer-rfi-${segmentKey}-template-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function rfxProcessLaneSegment(lane = {}) {
  const raw = rfxProcessText(lane.operating_segment || lane.segment_key || lane.segment || "").toLowerCase();
  const operation = rfxProcessText(lane.operation_type).toLowerCase();
  const aliases = { local: "local_ftl", regional: "regional_ftl", national: "national_ftl", expedited_ground: "expedited", time_critical_ground: "time_critical", port_drayage: "port_drayage_us" };
  if (aliases[raw]) return aliases[raw];
  if (raw) return raw;
  if (["d2d_export", "d2d_import", "crossborder"].includes(operation)) return "crossborder";
  if (operation === "local") return "local_ftl";
  if (operation === "regional") return "regional_ftl";
  if (["national", "us_domestic", "mx_domestic", "intra_mex", "dedicated"].includes(operation)) return "national_ftl";
  if (operation === "expedited") return "expedited";
  if (operation === "time_critical") return "time_critical";
  return "crossborder";
}

function rfxProcessRfiColumnStyle(column) {
  const base = Number(column.width || 82);
  const width = column.type === "checkbox" ? Math.max(40, Math.min(base, 56)) : column.type === "number" ? Math.max(52, Math.min(base, 80)) : column.type === "textarea" ? Math.max(128, Math.min(base, 172)) : Math.max(58, Math.min(base, 124));
  return `style="width:${width}px;min-width:${width}px;max-width:${width}px"`;
}

function rfxProcessEditorLaneRow(lane = {}, index = 0) {
  const field = (column) => escapeHtml(rfxProcessLaneValue(lane, column.key));
  const display = (column) => {
    const value = rfxProcessLaneValue(lane, column.key);
    if (column.type === "checkbox") return value === true ? "Yes" : "-";
    return rfxProcessText(value) || "-";
  };
  const input = (column) => {
    const value = field(column);
    const listId = column.list ? ` list="rfx-rfi-options-${column.key}"` : "";
    if (column.type === "checkbox") return `<input type="checkbox" data-rfi-field="${column.key}" ${rfxProcessLaneValue(lane, column.key) === true ? "checked" : ""} aria-label="${escapeHtml(column.label)}">`;
    if (column.type === "textarea") return `<textarea data-rfi-field="${column.key}" rows="1" aria-label="${escapeHtml(column.label)}">${value}</textarea>`;
    return `<input data-rfi-field="${column.key}" type="${column.type === "number" ? "number" : "text"}"${column.type === "number" ? ' step="any" min="0"' : ""}${listId} value="${value}" aria-label="${escapeHtml(column.label)}">`;
  };
  const editing = state.rfiEditingLaneIndex === index;
  const laneId = rfxProcessLaneValue(lane, "lane_id") || `L${index + 1}`;
  const actionCell = editing
    ? `<button type="button" class="page-primary-action small-button" data-rfx-action="save-rfi-lane" data-lane-index="${index}">Save</button><button type="button" class="secondary small-button" data-rfx-action="cancel-rfi-lane" data-lane-index="${index}">Cancel</button>`
    : `<button type="button" class="secondary small-button" data-rfx-action="edit-rfi-lane" data-lane-index="${index}">Edit</button><button type="button" class="secondary small-button" data-rfx-action="remove-rfi-lane" data-lane-index="${index}">Remove</button>`;
  return `
    <tr data-rfi-editor-lane="${index}" data-segment="${escapeHtml(rfxProcessLaneSegment(lane))}" class="${editing ? "is-editing" : ""}">
      <td class="rfi-action-column">${actionCell}</td>
      <td ${rfxProcessRfiColumnStyle({ width: 82 })}>${editing ? `<input data-rfi-field="lane_id" value="${escapeHtml(laneId)}" aria-label="Lane ID">` : `<span class="rfi-readonly-cell" title="${escapeHtml(laneId)}">${escapeHtml(laneId)}</span>`}</td>
      ${RFX_RFI_LANE_COLUMNS.map((column) => `<td ${rfxProcessRfiColumnStyle(column)}>${editing ? input(column) : `<span class="rfi-readonly-cell" title="${escapeHtml(display(column))}">${escapeHtml(display(column))}</span>`}</td>`).join("")}
    </tr>
  `;
}

function rfxProcessChecklistSegments(submission = {}) {
  const source = Array.isArray(submission.segment_checklists) ? submission.segment_checklists : [];
  if (source.length) return source;
  const selected = [...rfxProcessSegmentValues(submission, state.detail?.project)];
  const keys = selected.length ? selected : ["crossborder"];
  return keys.map((segmentKey, index) => rfxProcessDefaultChecklistSegment(segmentKey, index));
}

function rfxProcessDefaultChecklistSegment(segmentKey, index = 0) {
  return { segment_key: segmentKey, segment_name: RFX_PROCESS_SEGMENTS.find(([key]) => key === segmentKey)?.[1] || `Segment ${index + 1}`, rubric_items: {} };
}

function resetRfxProcessRfiDraft(detail = state.detail) {
  const submission = detail?.rfi_submission || {};
  const sourceSegments = rfxProcessChecklistSegments(submission);
  const configuredKeys = [...rfxProcessSegmentValues(submission, detail?.project)];
  const sourceKeys = sourceSegments.map((segment) => rfxProcessCanonicalSegmentKey(segment.segment_key || segment.segment, "")).filter(Boolean);
  const selectedKeys = [...new Set(configuredKeys.length ? configuredKeys : sourceKeys)].filter(Boolean);
  const keys = selectedKeys.length ? selectedKeys : ["crossborder"];
  state.rfiDraftLanes = Array.isArray(detail?.lanes) ? detail.lanes.map((lane) => ({ ...lane })) : [];
  state.rfiSelectedSegmentKeys = keys;
  state.rfiDraftSegments = keys.map((key, index) => {
    const source = sourceSegments.find((segment) => rfxProcessCanonicalSegmentKey(segment.segment_key || segment.segment, "") === key);
    return source ? { ...source, segment_key: key, rubric_items: { ...(source.rubric_items || {}) } } : rfxProcessDefaultChecklistSegment(key, index);
  });
  state.rfiActiveSegmentKey = keys.includes(state.rfiActiveSegmentKey) ? state.rfiActiveSegmentKey : keys[0];
  state.rfiActiveWorkspaceView = "lanes";
  state.rfiEditingLaneIndex = null;
}

function rfxProcessRubricRows(segment, groupKey) {
  const saved = segment?.rubric_items && typeof segment.rubric_items === "object" ? segment.rubric_items : {};
  const rows = Object.entries(saved).filter(([, value]) => value && (value.category === groupKey || !value.category));
  const fallback = RFX_RUBRIC_DEFAULTS[groupKey] || [["Requirement", "What must be confirmed?", "Carrier response or exception"]];
  const defaults = fallback.map((item, index) => {
    const [label, question, expected] = item;
    return [`${groupKey}_${index + 1}`, { category: groupKey, label, question, expected, required: false, observation: "" }];
  });
  if (!rows.length) return defaults;
  const savedKeys = new Set(rows.map(([key]) => key));
  return [...rows, ...defaults.filter(([key]) => !savedKeys.has(key))];
}

function rfxProcessRubricPanel(segment, segmentIndex, groupKey, groupLabel) {
  const rows = rfxProcessRubricRows(segment, groupKey);
  const required = rows.filter(([, item]) => item?.required === true).length;
  return `
    <details class="rfx-rfi-rubric-group" ${groupKey === "logistics_model" ? "open" : ""}>
      <summary><span><strong>${escapeHtml(groupLabel)}</strong><small>${required}/${rows.length} required</small></span><b>+</b></summary>
      <div class="rfx-rfi-rubric-table-wrap">
        <table class="rfx-rfi-rubric-table">
          <thead><tr><th>Check</th><th>Rubric</th><th>What to ask</th><th>Expected answer</th><th>Observations</th></tr></thead>
          <tbody>${rows.map(([key, item]) => `
            <tr data-rfx-rubric-row data-rubric-key="${escapeHtml(key)}" data-rubric-category="${escapeHtml(groupKey)}">
              <td><input type="checkbox" data-rfx-rubric-field="required" ${item?.required === true ? "checked" : ""} aria-label="Required"></td>
              <td><input data-rfx-rubric-field="label" value="${escapeHtml(item?.label || key)}"></td>
              <td><textarea data-rfx-rubric-field="question" rows="1">${escapeHtml(item?.question || "")}</textarea></td>
              <td><textarea data-rfx-rubric-field="expected" rows="1">${escapeHtml(item?.expected || "")}</textarea></td>
              <td><textarea data-rfx-rubric-field="observation" rows="1" placeholder="Carrier response, criterion or exception">${escapeHtml(item?.observation || item?.answer || item?.notes || "")}</textarea></td>
            </tr>`).join("")}</tbody>
        </table>
      </div>
    </details>
  `;
}

function rfxProcessSegmentTabs(segments, activeKey) {
  return segments.map((segment, index) => {
    const key = segment.segment_key || `segment_${index + 1}`;
    const laneCount = (state.rfiDraftLanes || []).filter((lane) => rfxProcessLaneSegment(lane) === key).length;
    const active = key === activeKey;
    return `<div class="rfi-segment-tab-item ${active ? "is-active" : ""}">
      <button type="button" role="tab" aria-selected="${active}" class="rfi-segment-tab ${active ? "is-active" : ""}" data-rfx-segment-tab="${escapeHtml(key)}"><span>${index + 1}</span><strong>${escapeHtml(segment.segment_name || key)}</strong><small>${laneCount} ${laneCount === 1 ? "lane" : "lanes"}</small></button>
    </div>`;
  }).join("");
}

function rfxProcessSegmentRequirements(segment, index) {
  const activeSegment = segment || rfxProcessDefaultChecklistSegment("crossborder", index);
  return `
    <article class="rfi-segment-checklist" data-rfx-segment-row data-segment-index="${index}">
      <div class="customer-rfi-row-head">
        <div><p class="eyebrow">Segment ${index + 1}</p><strong>${escapeHtml(activeSegment.segment_name || activeSegment.segment_key || "Segment")}</strong></div>
        <span class="status-pill">Checkbox + observation</span>
      </div>
      <div class="rfi-segment-meta">
        <label>Segment key<input data-rfx-segment-field="segment_key" value="${escapeHtml(activeSegment.segment_key || "crossborder")}"></label>
        <label>Segment name<input data-rfx-segment-field="segment_name" value="${escapeHtml(activeSegment.segment_name || "")}"></label>
        <label>Operation model<input data-rfx-segment-field="operation_type" value="${escapeHtml(activeSegment.operation_type || "")}"></label>
      </div>
      <div class="rfi-suggestion-row"><span>Suggestions</span><span class="field-help">Select the requirements that must be confirmed by the carrier.</span></div>
      <div class="rfi-rubric-groups">
        ${RFX_RUBRIC_GROUPS.map(([groupKey, groupLabel]) => {
          const rows = rfxProcessRubricRows(activeSegment, groupKey);
          const required = rows.filter(([, item]) => item?.required === true).length;
          return `<details class="rfi-rubric-group" data-rubric-group="${escapeHtml(groupKey)}" ${groupKey === "logistics_model" ? "open" : ""}>
            <summary><span class="rfi-rubric-group-copy"><strong>${escapeHtml(groupLabel)}</strong><small>Choose what applies, then document the response or exception.</small></span><span class="rfi-rubric-group-progress">${required}/${rows.length}</span></summary>
            <div class="rfi-checklist-table-wrap"><table class="rfi-checklist-table">
              <thead><tr><th>Required</th><th>Rubric</th><th>What to ask</th><th>Expected answer</th><th>Observations</th></tr></thead>
              <tbody>${rows.map(([key, item]) => `<tr data-rfx-rubric-row data-rubric-key="${escapeHtml(key)}" data-rubric-category="${escapeHtml(groupKey)}">
                <td class="rfi-check-cell"><input type="checkbox" data-rfx-rubric-field="required" ${item?.required === true ? "checked" : ""} aria-label="Required"></td>
                <td><input data-rfx-rubric-field="label" value="${escapeHtml(item?.label || key)}"></td>
                <td><textarea data-rfx-rubric-field="question" rows="1">${escapeHtml(item?.question || "")}</textarea></td>
                <td><textarea data-rfx-rubric-field="expected" rows="1">${escapeHtml(item?.expected || "")}</textarea></td>
                <td><textarea data-rfx-rubric-field="observation" rows="1" placeholder="Response, criterion, exception or note">${escapeHtml(item?.observation || item?.answer || item?.notes || "")}</textarea></td>
              </tr>`).join("")}</tbody>
            </table></div>
          </details>`;
        }).join("")}
      </div>
    </article>
  `;
}

function rfxProcessChecklistEditor(segment, index, view) {
  return `<section class="customer-rfi-card rfi-rubrics-card" data-rfx-workspace-panel="rubrics"${view === "rubrics" ? "" : " hidden"}>
    <div class="rfi-section-heading"><div><p class="eyebrow">Segment rubrics</p><h2>Carrier confirmation checklist</h2><p class="rfi-section-description">Select what must be confirmed and document the operational answer or exception.</p></div></div>
    <div class="rfi-segment-checklist-grid">${rfxProcessSegmentRequirements(segment, index)}</div>
  </section>`;
}

function rfxProcessRfiEditorPanel() {
  const detail = state.detail;
  const submission = detail.rfi_submission || {};
  const account = submission.account_overview || {};
  const selectedSegments = new Set(state.rfiSelectedSegmentKeys.length ? state.rfiSelectedSegmentKeys : [...rfxProcessSegmentValues(submission, detail.project)]);
  const lanes = Array.isArray(state.rfiDraftLanes) ? state.rfiDraftLanes : detail.lanes;
  const draftSegments = Array.isArray(state.rfiDraftSegments) ? state.rfiDraftSegments : rfxProcessChecklistSegments(submission);
  const selectedKeys = [...selectedSegments];
  const segments = (selectedKeys.length ? selectedKeys : draftSegments.map((segment) => segment.segment_key)).filter(Boolean).map((key, index) => draftSegments.find((segment) => segment.segment_key === key) || rfxProcessDefaultChecklistSegment(key, index));
  const activeKey = segments.some((segment) => segment.segment_key === state.rfiActiveSegmentKey) ? state.rfiActiveSegmentKey : (segments[0]?.segment_key || "crossborder");
  const activeIndex = Math.max(0, segments.findIndex((segment) => segment.segment_key === activeKey));
  const activeSegment = segments[activeIndex] || rfxProcessDefaultChecklistSegment(activeKey, activeIndex);
  const activeView = ["lanes", "rubrics", "files"].includes(state.rfiActiveWorkspaceView) ? state.rfiActiveWorkspaceView : "lanes";
  const groupedColumns = Object.entries(RFX_RFI_GROUP_LABELS).map(([group, label]) => [group, label, RFX_RFI_LANE_COLUMNS.filter((column) => column.group === group)]);
  const allLaneEntries = lanes.map((lane, index) => ({ lane, index }));
  const matchingLaneEntries = allLaneEntries.filter(({ lane }) => rfxProcessLaneSegment(lane) === activeKey);
  const hasExplicitSegments = lanes.some((lane) => rfxProcessText(lane.operating_segment || lane.segment_key || lane.segment));
  const laneEntries = matchingLaneEntries.length || hasExplicitSegments ? matchingLaneEntries : (activeKey === "crossborder" ? allLaneEntries : []);
  return `
    <div class="rfx-process-rfi-editor rfx-process-rfi-legacy-layout">
    <div class="customer-rfi-two-col rfx-process-rfi-account-grid">
      <section class="customer-rfi-card rfi-section-card">
        <div class="rfi-section-heading"><div><p class="eyebrow">Account overview</p><h2>Project account details</h2></div><span class="status-pill">Internal source</span></div>
        <div class="rfi-inline-fields rfi-account-fields">
          <label>Company / business unit<input data-rfi-editor-account="company" value="${escapeHtml(account.company || detail.project.customer_name || "")}"></label>
          <label>Primary contact<input data-rfi-editor-account="contact" value="${escapeHtml(account.contact || detail.project.customer_contact_name || "")}"></label>
          <label class="rfi-field-wide">Scope summary<textarea data-rfi-editor-account="scope" rows="2">${escapeHtml(account.scope || "")}</textarea></label>
        </div>
      </section>
      <section class="customer-rfi-card rfi-section-card">
        <div class="rfi-section-heading"><div><p class="eyebrow">Operating segments</p><h2>Select the operating scope</h2></div><span class="rfi-section-description">The workspace follows the selected segments.</span></div>
        <div class="checkbox-grid rfi-segment-selector">${RFX_PROCESS_SEGMENTS.map(([value, label]) => `<label><input type="checkbox" data-rfi-editor-segment="${value}" ${selectedSegments.has(value) ? "checked" : ""}> <span>${label}</span></label>`).join("")}</div>
      </section>
    </div>
    <section class="customer-rfi-card rfi-segment-workspace">
      <div class="rfi-section-heading rfi-workspace-heading"><div><p class="eyebrow">Operating workspace</p><h2>${escapeHtml(activeSegment.segment_name || "Segment details")}</h2><p class="rfi-section-description">Routes, requirements and supporting files stay organized by segment.</p></div><span class="status-pill">${escapeHtml(`${segments.length} segment(s)`)}</span></div>
      <div class="rfi-workspace-controls">
        <div class="rfi-segment-tabs" role="tablist" aria-label="Operating segments">${rfxProcessSegmentTabs(segments, activeKey)}</div>
        <div class="rfi-workspace-view-toggle" role="tablist" aria-label="Segment workspace view">
          <button type="button" class="${activeView === "lanes" ? "is-active" : ""}" data-rfx-workspace-view="lanes" aria-selected="${activeView === "lanes"}">Routes</button>
          <button type="button" class="${activeView === "rubrics" ? "is-active" : ""}" data-rfx-workspace-view="rubrics" aria-selected="${activeView === "rubrics"}">Requirements</button>
          <button type="button" class="${activeView === "files" ? "is-active" : ""}" data-rfx-workspace-view="files" aria-selected="${activeView === "files"}">Files</button>
        </div>
      </div>
      <div class="rfi-segment-template-bar rfx-process-rfi-template-bar">
        <label class="rfi-segment-template-name"><span>Segment name</span><input data-rfx-segment-meta-field="segment_name" value="${escapeHtml(activeSegment.segment_name || "")}"></label>
        <span class="rfi-workspace-description">This workspace contains the active segment: routes, rubrics, instructions and catalog fields.</span>
      </div>
      <div class="rfx-process-template-bar">
        <div><strong>${escapeHtml(activeSegment.segment_name || activeKey)} template</strong><span>Segment-specific workbook. Add route rows without deleting the existing draft.</span></div>
        <div class="rfx-process-template-actions"><button type="button" class="secondary small-button" data-rfx-action="download-rfi-template">Download segment template</button><button type="button" class="secondary small-button" data-rfx-action="import-rfi-template">Import segment template</button></div>
        <input id="rfx-rfi-template-file" type="file" accept=".xlsx,.xls,.csv" hidden>
      </div>
    </section>
    <section class="customer-rfi-card rfi-route-card" data-rfx-workspace-panel="lanes"${activeView === "lanes" ? "" : " hidden"}>
      <div class="rfi-section-heading"><div><p class="eyebrow">Route schedule</p><h2>Lane schedule</h2><p class="rfi-section-description">Edit one route at a time. The source matrix preserves the full RFI structure used for publication.</p></div><div class="rfi-heading-actions"><button type="button" class="secondary small-button" data-rfx-action="add-rfi-lane">Add lane</button></div></div>
      <div class="rfx-process-table-wrap rfi-route-scroll">
        <table class="rfx-process-table customer-rfi-lane-table rfx-process-rfi-editor-table">
          <thead><tr class="rfi-route-group-head"><th class="rfi-action-column" rowspan="2">Actions</th><th rowspan="2" ${rfxProcessRfiColumnStyle({ width: 82 })}>Lane ID</th>${groupedColumns.map(([group, label, columns]) => `<th colspan="${columns.length}" data-column-group="${group}">${label}</th>`).join("")}</tr><tr class="rfi-route-column-head">${RFX_RFI_LANE_COLUMNS.map((column) => `<th ${rfxProcessRfiColumnStyle(column)} title="${escapeHtml(column.label)}"><span class="rfi-route-head-label">${escapeHtml(column.label)}${column.required ? " *" : ""}</span></th>`).join("")}</tr></thead>
          <tbody>${laneEntries.map(({ lane, index }) => rfxProcessEditorLaneRow(lane, index)).join("") || `<tr><td colspan="${RFX_RFI_LANE_COLUMNS.length + 2}">No lanes in this segment yet. Add a lane or import this segment's template.</td></tr>`}</tbody>
        </table>
      </div>
      ${RFX_RFI_LANE_COLUMNS.filter((column) => column.list).map((column) => `<datalist id="rfx-rfi-options-${column.key}">${column.list.map((option) => `<option value="${escapeHtml(option)}"></option>`).join("")}</datalist>`).join("")}
    </section>
    ${rfxProcessChecklistEditor(activeSegment, activeIndex, activeView)}
    <section class="customer-rfi-card rfi-files-card" data-rfx-workspace-panel="files"${activeView === "files" ? "" : " hidden"}>
      <div class="rfi-section-heading"><div><p class="eyebrow">File vault</p><h2>Instructions and supporting files</h2><p class="rfi-section-description">Keep links and source references attached to the active operating segment.</p></div></div>
      <div class="rfi-file-vault"><div class="rfi-vault-context"><strong>${escapeHtml(activeSegment.segment_name || activeKey)}</strong><span>Paste a Drive, SharePoint or storage link associated with this segment.</span></div><label>Attachment links<textarea rows="3" data-rfx-segment-field="attachment_links" placeholder="https://drive.google.com/...">${escapeHtml(activeSegment.attachment_links || "")}</textarea></label></div>
    </section>
    <div class="rfx-process-rfi-editor-actions"><button type="button" data-rfx-action="cancel-rfi" class="secondary">Cancel</button><button type="button" data-rfx-action="save-rfi">Save RFI</button></div>
    </div>
  `;
}

function rfxProcessExternalLinkPanel() {
  const detail = state.detail;
  const currentLink = activeRfiLink(detail.magic_links);
  const latestLink = currentLink || latest(detail.magic_links);
  const activeLinkUrl = String(currentLink?.link || "");
  const submitted = detail.rfi_submission?.status === "submitted";
  return `
    <section class="rfx-process-card">
      <div class="split-heading compact">
        <div>
          <p class="eyebrow">Customer progress view</p>
          <h3>Customer RFI link</h3>
        </div>
        <div class="action-row">
          ${currentLink ? (activeLinkUrl ? `
            <button type="button" data-rfx-action="copy-rfi-link" data-rfi-link="${escapeHtml(activeLinkUrl)}">Copy link</button>
            <a class="secondary-link" href="${escapeHtml(activeLinkUrl)}" target="_blank" rel="noreferrer">Open progress view</a>
          ` : `<button type="button" class="secondary" data-rfx-action="replace-legacy-rfi-link" data-link-id="${escapeHtml(currentLink.id)}">Replace legacy link</button>`)
            : `<button type="button" data-rfx-action="create-rfi-link">Generate link</button>`}
          ${submitted ? `<button type="button" data-rfx-action="reopen-rfi" class="secondary">Reopen customer RFI</button>` : ""}
        </div>
      </div>
      <p>The customer uses this link to review progress and submit information. Procurement edits the source RFI above.</p>
      ${latestLink ? `
        <div class="rfx-process-link-row">
          <span class="status-pill">${escapeHtml(latestLink.status)}</span>
          <span>Expires ${escapeHtml(latestLink.expires_at || "-")}</span>
          ${currentLink && activeLinkUrl ? `<input class="rfx-process-link-input" value="${escapeHtml(activeLinkUrl)}" readonly aria-label="Active Customer RFI link">` : ""}
          ${currentLink && !activeLinkUrl ? `<span class="warning-text">Legacy link: replace once to make the fixed URL available.</span>` : ""}
          <button type="button" class="secondary small-button" data-rfx-action="revoke-rfi-link" data-link-id="${escapeHtml(latestLink.id)}">Revoke</button>
        </div>
      ` : `<p class="empty-note">No customer progress link generated yet.</p>`}
    </section>
  `;
}

function collectRfxProcessRfi() {
  const detail = state.detail;
  const submission = detail.rfi_submission || {};
  const getAccount = (field) => document.querySelector(`[data-rfi-editor-account="${field}"]`)?.value || "";
  const draftLanes = Array.isArray(state.rfiDraftLanes) ? state.rfiDraftLanes.map((lane) => ({ ...lane })) : [];
  const editedLanes = new Map();
  Array.from(els.panels?.querySelectorAll("[data-rfi-editor-lane]") || []).forEach((row) => {
    const index = Number(row.dataset.rfiEditorLane);
    const lane = { ...(draftLanes[index] || {}) };
    row.querySelectorAll("[data-rfi-field]").forEach((input) => { lane[input.dataset.rfiField] = input.type === "checkbox" ? input.checked : input.value; });
    lane.lane_id = lane.lane_id || `L${index + 1}`;
    editedLanes.set(index, lane);
  });
  const lanes = draftLanes.map((lane, index) => editedLanes.get(index) || lane);
  const segmentChecklists = Array.from(els.panels?.querySelectorAll("[data-rfx-segment-row]") || []).map((row, index) => {
    const segmentIndex = Number.isInteger(Number(row.dataset.segmentIndex)) ? Number(row.dataset.segmentIndex) : index;
    const segmentKeyFromRow = row.querySelector('[data-rfx-segment-field="segment_key"], [data-rfx-segment-meta-field="segment_key"]')?.value || "";
    const previous = state.rfiDraftSegments.find((segment) => segment.segment_key === segmentKeyFromRow)
      || state.rfiDraftSegments[segmentIndex]
      || submission.segment_checklists?.find((segment) => segment.segment_key === segmentKeyFromRow)
      || submission.segment_checklists?.[segmentIndex]
      || {};
    const getSegment = (field) => row.querySelector(`[data-rfx-segment-field="${field}"], [data-rfx-segment-meta-field="${field}"]`)?.value
      || els.panels?.querySelector(`[data-rfx-segment-field="${field}"]`)?.value
      || previous[field]
      || "";
    const rubricItems = {};
    row.querySelectorAll("[data-rfx-rubric-row]").forEach((itemRow) => {
      const key = itemRow.dataset.rubricKey;
      if (!key) return;
      const field = (name) => itemRow.querySelector(`[data-rfx-rubric-field="${name}"]`);
      rubricItems[key] = {
        category: itemRow.dataset.rubricCategory,
        label: field("label")?.value || key,
        question: field("question")?.value || "",
        expected: field("expected")?.value || "",
        required: field("required")?.checked === true,
        observation: field("observation")?.value || ""
      };
    });
    return { ...previous, segment_key: getSegment("segment_key"), segment_name: getSegment("segment_name"), operation_type: getSegment("operation_type"), attachment_links: getSegment("attachment_links"), rubric_items: rubricItems };
  });
  const selectedSegmentKeys = Array.from(els.panels?.querySelectorAll("[data-rfi-editor-segment]:checked") || [])
    .map((input) => input.dataset.rfiEditorSegment)
    .filter(Boolean);
  const draftSegments = Array.isArray(state.rfiDraftSegments) && state.rfiDraftSegments.length ? state.rfiDraftSegments : (Array.isArray(submission.segment_checklists) ? submission.segment_checklists : []);
  const checklistByKey = new Map(draftSegments.map((segment) => [segment.segment_key, segment]));
  segmentChecklists.forEach((segment) => checklistByKey.set(segment.segment_key, segment));
  const selectedChecklists = selectedSegmentKeys.map((segmentKey, index) => checklistByKey.get(segmentKey) || rfxProcessDefaultChecklistSegment(segmentKey, index));
  return {
    account_overview: { company: getAccount("company"), contact: getAccount("contact"), scope: getAccount("scope") },
    operating_segments: selectedSegmentKeys.map((value) => ({ value })),
    lanes,
    segment_checklists: selectedChecklists.length ? selectedChecklists : (segmentChecklists.length ? segmentChecklists : (Array.isArray(submission.segment_checklists) ? submission.segment_checklists : [])),
    logistics_models: submission.logistics_models || {},
    operational_criteria: submission.operational_criteria || {},
    business_rules: submission.business_rules || {},
    service_requirements: submission.service_requirements || {},
    carrier_requirements: submission.carrier_requirements || {},
    crossborder_details: submission.crossborder_details || {},
    notes_exceptions: submission.notes_exceptions || {},
    attachments: Array.isArray(submission.attachments) ? submission.attachments : []
  };
}

function rfiPanel() {
  return `<section class="rfx-process-panel active">${rfxProcessRfiEditorPanel()}</section>`;
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
  const project = state.detail.project;
  const snapshot = latest(state.detail.demand_snapshots);
  const pack = latest(state.detail.packages);
  const segments = Array.isArray(state.rfiDraftSegments)
    ? state.rfiDraftSegments
    : (Array.isArray(pack?.rfx_package_segments) && pack.rfx_package_segments.length
      ? pack.rfx_package_segments
      : rfxProcessChecklistSegments(state.detail.rfi_submission || {}));
  const previewLanes = Array.isArray(state.rfiDraftLanes)
    ? state.rfiDraftLanes
    : (Array.isArray(state.detail.lanes) && state.detail.lanes.length
      ? state.detail.lanes
      : (Array.isArray(snapshot?.rfx_demand_lanes) ? snapshot.rfx_demand_lanes : []));
  const eventId = pack?.linked_rfx_event_id || project.linked_rfx_event_id;
  const weeklyVolumeTotal = previewLanes.reduce((total, lane) => {
    const raw = lane.weekly_volume ?? lane.volume ?? (lane.weekly || "");
    const value = Number(String(raw).replace(/,/g, ""));
    return Number.isFinite(value) ? total + value : total;
  }, 0);
  const uniqueLaneValues = (values) => [...new Set(values.map((value) => rfxProcessText(value)).filter(Boolean))];
  const equipmentSummary = uniqueLaneValues(previewLanes.map((lane) => lane.equipment_type || lane.truck_type || lane.trailer_requirements)).slice(0, 3);
  const operationSummary = uniqueLaneValues(previewLanes.map((lane) => lane.operation_type || lane.operation)).slice(0, 3);
  const serviceSummary = uniqueLaneValues(previewLanes.map((lane) => lane.service_type || lane.service)).slice(0, 3);
  const rubricGroupCount = RFX_RUBRIC_GROUPS.length;
  const previewRouteRows = previewLanes.slice(0, 8).map((lane, index) => {
    const laneId = lane.lane_key || lane.lane_id || `L${index + 1}`;
    const origin = lane.origin || lane.origin_text || lane.origin_location || "Origin";
    const destination = lane.destination || lane.destination_text || lane.destination_location || "Destination";
    const equipment = lane.equipment_type || lane.truck_type || lane.trailer_requirements || "Equipment";
    const operation = lane.operation_type || "Operation";
    const service = lane.service_type || "Service";
    const volume = lane.weekly_volume || lane.monthly_volume || "-";
    return `
      <article class="rfx-public-route-row">
        <div class="rfx-public-route-id"><strong>${escapeHtml(laneId)}</strong><span>Included in opportunity</span></div>
        <div class="rfx-public-route-flow"><div><small>ORIGIN</small><strong>${escapeHtml(origin)}</strong></div><b aria-hidden="true">→</b><div><small>DESTINATION</small><strong>${escapeHtml(destination)}</strong></div></div>
        <div class="rfx-public-route-details"><span>${escapeHtml(equipment)}</span><span>${escapeHtml(operation)}</span><span>${escapeHtml(service)}</span><span>${escapeHtml(`${volume} / week`)}</span></div>
      </article>`;
  }).join("");
  const goldenSegments = segments.map((segment, index) => {
    const segmentLaneCount = previewLanes.filter((lane) => rfxProcessLaneSegment(lane) === segment.segment_key).length || segment.lane_count || 0;
    const setup = [segment.operation_type || segment.operation, segment.service, segment.equipment, segment.trailer].filter(Boolean).join(" | ") || "Carrier confirms operating fit";
    const requiredCount = Object.values(segment.rubric_items || {}).filter((item) => item?.required === true).length;
    return `
      <article class="rfx-golden-segment-row">
        <span class="rfx-golden-segment-number">${index + 1}</span>
        <div class="rfx-golden-segment-copy"><strong>${escapeHtml(segment.segment_name || "General segment")}</strong><span>${escapeHtml(setup)}</span><small title="The carrier confirms whether this operating segment fits its capabilities.">Fit confirmation required</small></div>
        <div class="rfx-golden-segment-stat" title="Routes included in this operating segment"><small>LANES</small><strong>${segmentLaneCount}</strong></div>
        <div class="rfx-golden-segment-stat" title="Checklist groups presented for carrier confirmation"><small>CHECKLIST</small><strong>${requiredCount ? `${requiredCount} required checks` : `${rubricGroupCount} groups`}</strong></div>
        <span class="rfx-golden-segment-status" title="The carrier can confirm fit, flag an exception or mark the segment as not applicable.">Confirm fit</span>
      </article>`;
  }).join("");
  return `
    <section class="rfx-process-panel active">
      <div class="rfx-process-preview-grid">
      <section class="rfx-process-card rfx-marketplace-preview">
        <div class="rfx-design-heading"><div><p class="eyebrow">Public marketplace preview</p><h3>What carriers will see before publication</h3><p class="rfx-design-description">A single commercial opportunity with a route book, operating scope and clear response expectations.</p></div><span class="status-pill ${eventId ? "success" : "muted"}">${eventId ? "Published event linked" : "Draft preview"}</span></div>
        <div class="rfx-public-preview-card">
          <header class="rfx-public-preview-header"><div><span class="rfx-public-preview-brand">RATEWARE MARKETPLACE</span><strong>${escapeHtml(project.title || "RFx opportunity")}</strong><span>${escapeHtml(project.customer_name || "Customer")} · ${escapeHtml(statusLabel(project.opportunity_type || "spot"))}</span></div><div class="rfx-public-preview-status"><span>${eventId ? "OPEN" : "PREVIEW"}</span><small>Due date</small><strong>${escapeHtml(project.due_date || "-")}</strong></div></header>
          <div class="rfx-public-preview-stats"><span><small>ROUTES</small><strong>${previewLanes.length}</strong></span><span><small>SEGMENTS</small><strong>${segments.length || 0}</strong></span><span><small>VISIBILITY</small><strong>Anonymous rank</strong></span><span><small>RESPONSE</small><strong>Rate + capacity + fit</strong></span></div>
          <div class="rfx-public-route-book"><div class="rfx-preview-section-heading"><div><span>ROUTE BOOK</span><strong>All lanes included in this opportunity</strong></div><small>${previewLanes.length} route(s)</small></div><div class="rfx-public-route-list">${previewRouteRows || `<div class="rfx-preview-empty">Create or load lanes to preview the marketplace card.</div>`}</div>${previewLanes.length > 8 ? `<p class="rfx-preview-more">Showing 8 routes in preview. Publication includes all ${previewLanes.length} routes.</p>` : ""}</div>
          <footer class="rfx-public-preview-footer"><strong>Carrier response</strong><span>Confirm capacity, operating fit, service requirements and bid terms by segment.</span></footer>
        </div>
        <p class="rfx-design-footnote">This preview does not publish anything. Launch the package from the RFx Project header after the route book and checklist are ready.</p>
      </section>
      <section class="rfx-process-card rfx-golden-package-preview">
        <div class="rfx-design-heading"><div><p class="eyebrow">Golden Bid Room Card</p><h3>One master opportunity, segmented for fit</h3><p class="rfx-design-description">Carriers receive one business book. Your operating segments keep their requirements and confirmation checklist organized inside it.</p></div><span class="status-pill ${segments.length ? "success" : "muted"}">${escapeHtml(`${segments.length || 0} segment(s)`)}</span></div>
        <div class="rfx-golden-card">
          <div class="rfx-golden-card-v2">
            <header class="rfx-golden-card-header"><div><span>PRIVATE BID ROOM / GOLDEN BUSINESS BOOK</span><strong>${escapeHtml(project.title || "RFx opportunity")}</strong><small>${escapeHtml(project.customer_name || "Customer")} | ${escapeHtml(statusLabel(project.opportunity_type || "spot"))} | Due ${escapeHtml(project.due_date || "-")}</small></div><div class="rfx-golden-card-mark"><b>MASTER RFx</b><span title="One master opportunity contains the full route book and its operating segments.">${eventId ? "OPEN" : "PREVIEW"}</span></div></header>
            <div class="rfx-golden-summary" aria-label="Golden business book summary">
              <div title="Every route in the published business book"><small>ROUTE BOOK</small><strong>${previewLanes.length}</strong><span>lanes</span></div>
              <div title="Total weekly volume stated in the route schedule"><small>WEEKLY VOLUME</small><strong>${weeklyVolumeTotal ? escapeHtml(String(weeklyVolumeTotal).replace(/\.0+$/, "")) : "-"}</strong><span>${weeklyVolumeTotal ? "loads / week" : "carrier confirms"}</span></div>
              <div title="Equipment values requested across the route book"><small>EQUIPMENT</small><strong>${escapeHtml(equipmentSummary[0] || "Carrier proposes")}</strong><span>${equipmentSummary.length > 1 ? `+${equipmentSummary.length - 1} more` : "requested scope"}</span></div>
              <div title="Expected response includes a rate, capacity commitment and fit confirmation"><small>RESPONSE</small><strong>Rate + fit</strong><span>capacity required</span></div>
            </div>
            <div class="rfx-golden-card-rule"><div><span>Carrier sees</span><strong>Routes, operating requirements, service expectations and bid terms</strong></div><span title="Internal target rates and procurement guidance never appear in the carrier-facing card.">Target rates stay private</span></div>
            <div class="rfx-golden-fit-strip"><span class="rfx-golden-fit-label">FIT CHECK</span><span title="Operations">${escapeHtml(operationSummary.join(", ") || "Operating model")}</span><span title="Service">${escapeHtml(serviceSummary.join(", ") || "Service requirements")}</span><span title="Checklist">${rubricGroupCount} checklist groups</span></div>
            <div class="rfx-golden-segment-heading"><div><span>OPERATING SEGMENTS</span><strong>Confirm the segments that fit your operation</strong></div><small>${segments.length || 0} segment(s)</small></div>
            <div class="rfx-golden-segment-list">${goldenSegments || `<div class="rfx-preview-empty">Create a package after the route book is ready.</div>`}</div>
            <footer class="rfx-golden-card-footer"><span><strong>1</strong> master business book</span><span><strong>${previewLanes.length}</strong> lanes included</span><span><strong>${rubricGroupCount}</strong> fit groups per segment</span><span title="Rates and capacity are submitted after the carrier confirms its operating fit.">Confirm fit, then submit your offer</span></footer>
          </div>
          <header class="rfx-golden-card-header"><div><span>PRIVATE PROCUREMENT ROOM</span><strong>${escapeHtml(project.title || "RFx opportunity")}</strong><small>${escapeHtml(project.customer_name || "Customer")} · ${escapeHtml(`${previewLanes.length} route(s)`)} · ${escapeHtml(statusLabel(project.opportunity_type || "spot"))}</small></div><b>MASTER RFx</b></header>
          <div class="rfx-golden-card-rule"><span>Carrier sees</span><strong>Route schedule + operating fit checklist + bid terms</strong><span>Internal guidance stays private</span></div>
          <div class="rfx-golden-segment-list">${goldenSegments || `<div class="rfx-preview-empty">Create a package after the route book is ready.</div>`}</div>
          <footer class="rfx-golden-card-footer"><span><strong>${previewLanes.length}</strong> lanes in the master book</span><span><strong>${segments.length || 0}</strong> operating segment(s)</span><span><strong>6</strong> checklist rubrics per segment</span><span>Carrier confirms fit before bidding</span></footer>
        </div>
      </section>
      </div>
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
            <thead><tr><th>Scenario</th><th>Status</th><th>Type</th><th>Created</th><th>Action</th></tr></thead>
            <tbody>${awards.map((row) => {
              const canPrepare = row.status !== "implementation_ready" && row.status !== "archived";
              return `<tr><td>${escapeHtml(row.scenario_name)}</td><td>${escapeHtml(row.status)}</td><td>${escapeHtml(row.scenario_type)}</td><td>${escapeHtml(row.created_at)}</td><td>${canPrepare ? `<button type="button" class="secondary" data-rfx-action="mark-award-implementation-ready" data-award-id="${escapeHtml(row.id)}">Mark implementation ready</button>` : "-"}</td></tr>`;
            }).join("") || `<tr><td colspan="5">No award packages created yet.</td></tr>`}</tbody>
          </table>
        </div>
        <p class="rfx-process-hint">This is the final commercial action. It moves the linked Shipper CRM opportunity to Won at 100% only after the RFx package is implementation ready.</p>
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
  els.panels.innerHTML = `
    <div class="rfx-process-single-page">
      <section class="rfx-process-section-heading"><p class="eyebrow">Customer RFI</p><h2>Requirements and route schedule</h2><span>Edit the source in place, then continue into RFx Design below.</span></section>
      ${rfiPanel()}
      <section class="rfx-process-section-heading"><p class="eyebrow">RFx Design</p><h2>Package and public marketplace preview</h2><span>Confirm the golden package before launching the Bid Room.</span></section>
      ${designPanel()}
    </div>
  `;
}

async function loadProjects() {
  const loadVersion = ++projectLoadVersion;
  state.loading = true;
  renderProjectList();
  try {
    const result = await fetchRfxProcessProjects({
      search: els.search?.value || "",
      status: els.status?.value || "",
      limit: 100
    });
    if (loadVersion !== projectLoadVersion) return;
    state.projects = result.rows || [];
    state.totalProjects = Number(result.total || state.projects.length);
    if (state.selectedId && !state.projects.some((project) => project.id === state.selectedId)) {
      state.selectedId = state.projects[0]?.id || "";
    }
    if (!state.selectedId && state.projects[0]) state.selectedId = state.projects[0].id;
    state.loading = false;
    renderProjectList();
    if (state.selectedId) await loadDetail(state.selectedId);
  } catch (error) {
    if (loadVersion !== projectLoadVersion) return;
    state.totalProjects = 0;
    els.list.innerHTML = `<article class="empty-state compact-empty"><strong>RFx Projects could not load</strong><span>${escapeHtml(humanizeError(error))}</span></article>`;
  } finally {
    if (loadVersion === projectLoadVersion) state.loading = false;
  }
}

async function loadDetail(projectId) {
  const loadVersion = ++projectDetailLoadVersion;
  try {
    const previousProjectId = state.selectedId;
    state.selectedId = projectId;
    if (previousProjectId !== projectId) {
      state.rfiEditing = false;
      state.rfiDraftLanes = [];
      state.rfiDraftSegments = [];
      state.rfiSelectedSegmentKeys = [];
      state.rfiActiveSegmentKey = "crossborder";
      state.rfiActiveWorkspaceView = "lanes";
      state.rfiEditingLaneIndex = null;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("project", projectId);
    window.history.replaceState({}, "", url);
    const detail = await fetchRfxProcessProject(projectId);
    if (loadVersion !== projectDetailLoadVersion || state.selectedId !== projectId) return;
    state.detail = detail;
    resetRfxProcessRfiDraft(detail);
    renderProjectList();
    renderShell();
  } catch (error) {
    if (loadVersion === projectDetailLoadVersion && state.selectedId === projectId) setStatus(error, "error");
  }
}

async function handleProjectAction(action, target) {
  if (action === "download-rfi-template") {
    if (rfxProcessTemplateRunning) return;
    rfxProcessTemplateRunning = true;
    if (target) target.disabled = true;
    try {
      setStatus("Generating Customer RFI template...");
      await downloadRfxProcessTemplate(state.rfiActiveSegmentKey);
      setStatus("Segment template downloaded. Fill it and import it from the same active segment.");
    } catch (error) {
      setStatus(error, "error");
    } finally {
      rfxProcessTemplateRunning = false;
      if (target) target.disabled = false;
    }
    return;
  }
  if (action === "import-rfi-template") {
    document.getElementById("rfx-rfi-template-file")?.click();
    return;
  }
  if (action === "edit-rfi") {
    state.rfiEditing = true;
    resetRfxProcessRfiDraft(state.detail);
    renderPanels();
    return;
  }
  if (action === "cancel-rfi") {
    state.rfiEditing = false;
    resetRfxProcessRfiDraft(state.detail);
    renderPanels();
    return;
  }
  if (action === "edit-rfi-lane") {
    state.rfiEditingLaneIndex = Number(target?.dataset.laneIndex);
    renderPanels();
    return;
  }
  if (action === "save-rfi-lane") {
    state.rfiDraftLanes = collectRfxProcessRfi().lanes;
    state.rfiEditingLaneIndex = null;
    renderPanels();
    return;
  }
  if (action === "cancel-rfi-lane") {
    state.rfiEditingLaneIndex = null;
    renderPanels();
    return;
  }
  if (action === "add-rfi-lane") {
    const current = collectRfxProcessRfi().lanes;
    const laneIndex = current.length;
    state.rfiDraftLanes = [...current, { lane_id: `L${laneIndex + 1}`, currency: "USD", operating_segment: state.rfiActiveSegmentKey }];
    state.rfiEditingLaneIndex = laneIndex;
    renderPanels();
    return;
  }
  if (action === "remove-rfi-lane") {
    const laneIndex = Number(target?.dataset.laneIndex);
    const current = collectRfxProcessRfi().lanes;
    if (Number.isInteger(laneIndex)) state.rfiDraftLanes = current.filter((_, index) => index !== laneIndex);
    state.rfiEditingLaneIndex = null;
    renderPanels();
    return;
  }
  if (projectActionRunning) return;
  const project = selectedProject();
  if (!project) return;
  const projectId = project.id;
  projectActionRunning = true;
  if (target) target.disabled = true;
  setStatus("Working...");
  try {
    if (action === "save-rfi") {
      const result = await saveRfxProcessRfi(project.id, collectRfxProcessRfi());
      state.rfiEditing = false;
      state.rfiEditingLaneIndex = null;
      setStatus(`RFI saved with ${result.lanes || 0} lane(s).`);
      await loadProjects();
      return;
    } else if (action === "create-rfi-link") {
      const result = await createRfxRfiMagicLink(project.id);
      if (result.reused) {
        if (result.link) await navigator.clipboard?.writeText(result.link).catch(() => {});
        setStatus(result.link ? `${result.message} Copied: ${result.link}` : (result.message || "An active Customer RFI link already exists."));
        return;
      }
      await navigator.clipboard?.writeText(result.link).catch(() => {});
      setStatus(`Customer RFI link generated and copied: ${result.link}`);
    } else if (action === "copy-rfi-link") {
      const link = target.dataset.rfiLink || "";
      if (!link) throw new Error("The active Customer RFI link is unavailable.");
      await navigator.clipboard?.writeText(link);
      setStatus("Active Customer RFI link copied.");
      return;
    } else if (action === "replace-legacy-rfi-link") {
      if (!window.confirm("The previous active link cannot be recovered because it was created before fixed-link storage. Revoke it and create one replacement link?")) return;
      await revokeRfxRfiMagicLink(project.id, target.dataset.linkId);
      const result = await createRfxRfiMagicLink(project.id);
      await navigator.clipboard?.writeText(result.link).catch(() => {});
      setStatus(`Replacement Customer RFI link generated and copied: ${result.link}`);
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
    } else if (action === "mark-award-implementation-ready") {
      if (!window.confirm("Mark this award package implementation ready? This moves the linked Shipper CRM opportunity to Won at 100%.")) return;
      const result = await markRfxAwardPackageImplementationReady(target.dataset.awardId);
      setStatus(result.shipper_opportunity
        ? "Award package is implementation ready. The linked Shipper CRM opportunity is now Won at 100%."
        : "Award package is implementation ready.");
    } else if (action === "mark-demand") {
      await updateRfxProcessProject(project.id, { status: "demand_review" });
      setStatus("Project moved to demand review.");
    } else if (action === "mark-evaluation") {
      await updateRfxProcessProject(project.id, { status: "bid_evaluation" });
      setStatus("Project moved to bid evaluation.");
    } else if (action === "archive-project") {
      if (!window.confirm("Archive this RFx Project?")) return;
      await updateRfxProcessProject(projectId, { status: "archived" });
      setStatus("Project archived.");
      if (state.selectedId === projectId) state.selectedId = "";
    }
    if (state.selectedId === projectId || action === "archive-project") await loadProjects();
  } catch (error) {
    setStatus(error, "error");
  } finally {
    projectActionRunning = false;
    if (target) target.disabled = false;
  }
}

function initEvents() {
  els.refresh?.addEventListener("click", loadProjects);
  els.search?.addEventListener("input", () => window.setTimeout(loadProjects, 150));
  els.status?.addEventListener("change", loadProjects);
  els.newButton?.addEventListener("click", () => els.dialog?.showModal());
  document.querySelectorAll("[data-dialog-close]").forEach((button) => button.addEventListener("click", () => els.dialog?.close()));
  els.list?.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-open-rfx]");
    if (openButton) {
      event.preventDefault();
      event.stopPropagation();
      const project = state.projects.find((item) => item.id === openButton.dataset.projectId);
      if (project) openProjectRfx(project);
      return;
    }
    const selectButton = event.target.closest("[data-project-select]");
    const row = event.target.closest("[data-project-id]");
    const projectId = selectButton?.dataset.projectId || row?.dataset.projectId;
    if (projectId) loadDetail(projectId);
  });
  document.querySelector(".rfx-process-tabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rfx-process-tab]");
    if (!button) return;
    state.activeTab = button.dataset.rfxProcessTab;
    document.querySelectorAll("[data-rfx-process-tab]").forEach((tab) => tab.classList.toggle("active", tab === button));
    renderPanels();
  });
  els.panels?.addEventListener("click", (event) => {
    const segmentTab = event.target.closest("[data-rfx-segment-tab]");
    if (segmentTab) {
      state.rfiActiveSegmentKey = segmentTab.dataset.rfxSegmentTab || "crossborder";
      renderPanels();
      return;
    }
    const workspaceView = event.target.closest("[data-rfx-workspace-view]");
    if (workspaceView) {
      state.rfiActiveWorkspaceView = workspaceView.dataset.rfxWorkspaceView || "lanes";
      renderPanels();
      return;
    }
    const button = event.target.closest("[data-rfx-action]");
    if (button) handleProjectAction(button.dataset.rfxAction, button);
  });
  els.panels?.addEventListener("change", async (event) => {
    const segmentToggle = event.target.closest("[data-rfi-editor-segment]");
    if (segmentToggle) {
      const key = segmentToggle.dataset.rfiEditorSegment || "";
      const selected = new Set(state.rfiSelectedSegmentKeys.length ? state.rfiSelectedSegmentKeys : [...rfxProcessSegmentValues(state.detail?.rfi_submission || {}, state.detail?.project)]);
      if (segmentToggle.checked) {
        selected.add(key);
        if (!state.rfiDraftSegments.some((segment) => segment.segment_key === key)) state.rfiDraftSegments.push(rfxProcessDefaultChecklistSegment(key, state.rfiDraftSegments.length));
        state.rfiActiveSegmentKey = key;
      } else if (selected.size > 1) {
        selected.delete(key);
        if (state.rfiActiveSegmentKey === key) state.rfiActiveSegmentKey = [...selected][0];
      } else {
        segmentToggle.checked = true;
        setStatus("Keep at least one operating segment selected.", "error");
        return;
      }
      state.rfiSelectedSegmentKeys = [...selected];
      renderPanels();
      return;
    }
    const input = event.target.closest("#rfx-rfi-template-file");
    if (!input || rfxProcessTemplateRunning) return;
    const [file] = Array.from(input.files || []);
    input.value = "";
    if (!file) return;
    rfxProcessTemplateRunning = true;
    try {
      setStatus("Reading Customer RFI template...");
      await importRfxProcessTemplate(file, state.rfiActiveSegmentKey);
    } catch (error) {
      setStatus(error, "error");
    } finally {
      rfxProcessTemplateRunning = false;
    }
  });
  els.heroActions?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rfx-action]");
    if (button) handleProjectAction(button.dataset.rfxAction, button);
  });
  els.createForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (projectCreateRunning) return;
    const formData = new FormData(els.createForm);
    const project = Object.fromEntries(formData.entries());
    const submitButton = els.createForm.querySelector("button[type='submit']");
    projectCreateRunning = true;
    if (submitButton) submitButton.disabled = true;
    try {
      const row = await createRfxProcessProject(project);
      els.dialog?.close();
      els.createForm.reset();
      state.selectedId = row.id;
      await loadProjects();
      setStatus("RFx Project created.");
    } catch (error) {
      setStatus(error, "error");
    } finally {
      projectCreateRunning = false;
      if (submitButton) submitButton.disabled = false;
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
