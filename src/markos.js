import { initAuthControls, requirePrivatePage } from "./auth.js";
import { humanizeError } from "./error-copy.js";
import { listGrowthCampaigns, listGrowthResults } from "./growth-service.js";
import {
  fetchContactHistoryPage,
  fetchOutreachCampaigns,
  fetchOutreachMessagesPage
} from "./outreach-service.js";

const state = {
  scope: "all",
  search: "",
  campaigns: [],
  activity: [],
  warnings: []
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function number(value) {
  return Number(value || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-MX").format(number(value));
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function objectiveLabel(value, scope) {
  const labels = {
    get_rfqs: "Generar RFQ",
    book_meetings: "Agendar conversación",
    create_opportunities: "Crear oportunidad",
    activate_accounts: "Activar cuenta",
    carrier_rfx: "Obtener participación",
    invite: "Invitar a pujar"
  };
  return labels[String(value || "").toLowerCase()] || (scope === "provider" ? "Obtener respuesta de puja" : "Desarrollar oportunidad");
}

function statusLabel(value) {
  const key = String(value || "draft").toLowerCase();
  const labels = {
    active: "Activa",
    launched: "En ejecución",
    running: "En ejecución",
    ready: "Lista",
    draft: "Borrador",
    paused: "Pausada",
    completed: "Completada",
    sent: "Enviada",
    closed: "Cerrada"
  };
  return labels[key] || key.replaceAll("_", " ");
}

function statusClass(value) {
  const key = String(value || "").toLowerCase();
  if (["active", "launched", "running", "ready", "sent"].includes(key)) return "is-active";
  if (["draft", "paused"].includes(key)) return "is-attention";
  return "";
}

function nextAction(campaign) {
  const status = String(campaign.status || "").toLowerCase();
  if (status === "draft") return campaign.scope === "customer" ? "Completar y aprobar campaña" : "Revisar audiencia e invitación";
  if (status === "paused") return "Resolver bloqueo o reprogramar";
  if (["completed", "closed"].includes(status)) return "Revisar resultados y actualizar CRM";
  if (campaign.scope === "provider") return campaign.sent > 0 ? "Dar seguimiento a quienes no respondieron" : "Preparar ejecución en Outreach";
  return campaign.responses > 0 ? "Calificar respuestas en Shipper CRM" : "Iniciar conversación y medir respuesta";
}

function normalizeGrowthCampaign(row) {
  const counts = row.member_counts || {};
  return {
    id: `customer:${row.id}`,
    scope: "customer",
    name: row.name || "Campaña de clientes",
    context: row.segment?.name || "Audiencia de Shipper CRM",
    objective: objectiveLabel(row.objective, "customer"),
    channels: Array.isArray(row.channels) ? row.channels : [],
    audience: number(counts.total),
    sent: number(counts.exported),
    responses: number(counts.responses),
    status: row.status || "draft",
    updatedAt: row.updated_at || row.created_at,
    href: "./growth-hacking.html#campaigns"
  };
}

function normalizeOutreachCampaign(row) {
  const channels = [];
  if (number(row.email_count)) channels.push("email");
  if (number(row.whatsapp_count)) channels.push("whatsapp");
  if (!channels.length && row.outreach_templates?.channel) channels.push(row.outreach_templates.channel);
  return {
    id: `provider:${row.id}`,
    scope: "provider",
    name: row.name || row.rfx_events?.name || "Campaña de proveedores",
    context: row.rfx_events?.customer || row.rfx_events?.name || "Oportunidad de Bid Room",
    objective: "Obtener participación de proveedores",
    channels,
    audience: number(row.message_count),
    sent: number(row.sent_count),
    responses: 0,
    status: row.status || "draft",
    updatedAt: row.updated_at || row.created_at,
    href: "./outreach.html#campaigns"
  };
}

function isMarkosRecord(row) {
  const metadata = row?.metadata || {};
  return metadata.source === "markos_voice" || Boolean(metadata.markos_session_id) || String(row?.status || "").startsWith("markos_");
}

function normalizeHistoryActivity(row) {
  const metadata = row.metadata || {};
  const isProfile = metadata.kind === "profile_update" || metadata.review_required === true || String(row.status || "").includes("profile");
  return {
    id: `history:${row.id}`,
    scope: "provider",
    kind: isProfile ? "CRM" : "VOZ",
    title: row.subject || (isProfile ? "Actualización de perfil propuesta" : "Conversación de MarkOS"),
    detail: row.vendors?.vendor_name || metadata.carrier_name || metadata.phone_number || "Proveedor",
    result: metadata.outcome || row.outcome || row.status || "Registrada",
    occurredAt: row.occurred_at || row.created_at,
    pendingReview: isProfile && !["approved", "rejected"].includes(String(metadata.review_status || row.review_status || "pending"))
  };
}

function normalizeMessageActivity(row) {
  const metadata = row.metadata || {};
  return {
    id: `message:${row.id}`,
    scope: "provider",
    kind: row.channel === "email" ? "MAIL" : "WA",
    title: row.subject || (row.channel === "email" ? "Seguimiento por correo" : "Seguimiento por WhatsApp"),
    detail: row.vendors?.vendor_name || row.recipient_email || row.recipient_phone || "Contacto",
    result: row.delivery_status || row.status || metadata.outcome || "Preparado",
    occurredAt: row.sent_at || row.updated_at || row.created_at,
    pendingReview: false
  };
}

function normalizeGrowthActivity(row) {
  return {
    id: `growth-result:${row.id}`,
    scope: "customer",
    kind: "CRM",
    title: row.campaign?.name || "Resultado de campaña comercial",
    detail: row.account?.shipper_name || row.contact?.contact_name || row.contact?.email || "Cliente",
    result: row.outcome || "Registrado",
    occurredAt: row.occurred_at || row.updated_at || row.created_at,
    pendingReview: false
  };
}

function visibleCampaigns() {
  const query = state.search.trim().toLowerCase();
  return state.campaigns.filter((campaign) => {
    if (state.scope !== "all" && campaign.scope !== state.scope) return false;
    if (!query) return true;
    return [campaign.name, campaign.context, campaign.objective, campaign.status, ...campaign.channels]
      .join(" ").toLowerCase().includes(query);
  });
}

function renderMetrics() {
  const campaigns = state.campaigns.filter((campaign) => state.scope === "all" || campaign.scope === state.scope);
  const activity = state.activity.filter((item) => state.scope === "all" || item.scope === state.scope);
  $("#markos-metric-campaigns").textContent = formatNumber(campaigns.length);
  $("#markos-metric-audience").textContent = formatNumber(campaigns.reduce((sum, row) => sum + row.audience, 0));
  $("#markos-metric-conversations").textContent = formatNumber(activity.filter((row) => row.kind === "VOZ").length);
  $("#markos-metric-reviews").textContent = formatNumber(activity.filter((row) => row.pendingReview).length);
}

function renderCampaigns() {
  const rows = visibleCampaigns();
  const body = $("#markos-campaign-rows");
  $("#markos-campaign-empty").hidden = rows.length > 0;
  $(".markos-table-wrap").hidden = rows.length === 0;
  body.innerHTML = rows.map((campaign) => `
    <tr>
      <td><span class="markos-pill ${campaign.scope === "customer" ? "is-customer" : "is-provider"}">${campaign.scope === "customer" ? "Cliente" : "Proveedor"}</span></td>
      <td><a href="${campaign.href}">${escapeHtml(campaign.name)}</a><small>${escapeHtml(campaign.context)}</small></td>
      <td>${escapeHtml(campaign.objective)}</td>
      <td>${escapeHtml(campaign.channels.length ? campaign.channels.join(" · ") : "Por definir")}</td>
      <td><strong>${formatNumber(campaign.audience)}</strong><small>${formatNumber(campaign.sent)} contactados · ${formatNumber(campaign.responses)} respuestas</small></td>
      <td><span class="markos-status-pill ${statusClass(campaign.status)}">${escapeHtml(statusLabel(campaign.status))}</span></td>
      <td><strong>${escapeHtml(nextAction(campaign))}</strong><small>${escapeHtml(formatDate(campaign.updatedAt))}</small></td>
    </tr>
  `).join("");
}

function renderActivity() {
  const items = state.activity
    .filter((item) => state.scope === "all" || item.scope === state.scope)
    .slice(0, 10);
  const container = $("#markos-activity-list");
  if (!items.length) {
    container.innerHTML = `<div class="markos-empty"><strong>No hay actividad MarkOS reciente para este filtro.</strong><span>Las conversaciones aparecerán aquí cuando el agente registre su resultado.</span></div>`;
    return;
  }
  container.innerHTML = items.map((item) => `
    <article>
      <span class="markos-activity-icon">${escapeHtml(item.kind)}</span>
      <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)} · ${escapeHtml(statusLabel(item.result))}</small></div>
      <time datetime="${escapeHtml(item.occurredAt || "")}">${escapeHtml(formatDate(item.occurredAt))}</time>
    </article>
  `).join("");
}

function render() {
  renderMetrics();
  renderCampaigns();
  renderActivity();
}

async function load() {
  const status = $("#markos-status");
  status.className = "markos-status";
  status.textContent = "Actualizando campañas, conversaciones y resultados...";
  state.warnings = [];

  const [growthCampaigns, growthResults, outreachCampaigns, history, messages] = await Promise.allSettled([
    listGrowthCampaigns(),
    listGrowthResults(),
    fetchOutreachCampaigns(),
    fetchContactHistoryPage({ limit: 300 }),
    fetchOutreachMessagesPage({ limit: 100, compact: true })
  ]);

  const read = (result, fallback, label) => {
    if (result.status === "fulfilled") return result.value;
    state.warnings.push(`${label}: ${humanizeError(result.reason)}`);
    return fallback;
  };

  const growthCampaignPayload = read(growthCampaigns, { rows: [] }, "Campañas de clientes");
  const growthResultPayload = read(growthResults, { rows: [], metrics: {} }, "Resultados de clientes");
  const outreachCampaignRows = read(outreachCampaigns, [], "Campañas de proveedores");
  const historyPayload = read(history, { rows: [] }, "Historial conversacional");
  const messagePayload = read(messages, { rows: [] }, "Seguimientos de MarkOS");

  state.campaigns = [
    ...(growthCampaignPayload.rows || []).map(normalizeGrowthCampaign),
    ...(outreachCampaignRows || []).map(normalizeOutreachCampaign)
  ].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  const historyRows = (historyPayload.rows || []).filter(isMarkosRecord).map(normalizeHistoryActivity);
  const messageRows = (messagePayload.rows || []).filter(isMarkosRecord).map(normalizeMessageActivity);
  const growthRows = (growthResultPayload.rows || []).map(normalizeGrowthActivity);
  state.activity = [...historyRows, ...messageRows, ...growthRows]
    .sort((a, b) => new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0));

  render();
  if (state.warnings.length) {
    status.className = "markos-status is-error";
    status.textContent = `La sección abrió con datos parciales. ${state.warnings.join(" ")}`;
  } else {
    status.textContent = `Actualizado ${formatDate(new Date().toISOString())}. Esta vista no envía mensajes ni inicia llamadas.`;
  }
}

function bindEvents() {
  $$('[data-markos-scope]').forEach((button) => button.addEventListener("click", () => {
    state.scope = button.dataset.markosScope || "all";
    $$('[data-markos-scope]').forEach((item) => item.classList.toggle("is-active", item === button));
    render();
  }));
  $("#markos-campaign-search").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderCampaigns();
  });
  $("#markos-refresh").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Actualizando...";
    try {
      await load();
    } finally {
      button.disabled = false;
      button.textContent = "Actualizar";
    }
  });
  $$('[data-markos-jump]').forEach((button) => button.addEventListener("click", () => {
    document.querySelector(`#markos-${button.dataset.markosJump}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

async function initialize() {
  bindEvents();
  await load();
}

initAuthControls();
requirePrivatePage()
  .then(initialize)
  .catch((error) => {
    const status = $("#markos-status");
    status.className = "markos-status is-error";
    status.textContent = humanizeError(error);
  });
