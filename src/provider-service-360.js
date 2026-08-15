import { callRatewareFunction } from './rateware-api.js';
import { deriveProviderRelationshipAttention, groupProviderRequirements, summarizeProvider360 } from './provider-service-360-domain.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const label = (value) => String(value || '—').replaceAll('_',' ').replace(/\b\w/g, c=>c.toUpperCase());

function metric(title,value,detail='') {
  return `<article class="provider360-metric"><span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong>${detail?`<small>${escapeHtml(detail)}</small>`:''}</article>`;
}

function renderRelationship(row) {
  const attention=deriveProviderRelationshipAttention(row);
  const integration=`${Number(row.ready_integration_count||0)}/${Number(row.required_integration_count||0)}`;
  return `<article class="provider360-relationship provider360-${attention.level}">
    <header><div><strong>${escapeHtml(row.vendor_code||'Provider')}</strong><span>${escapeHtml(row.legal_entity_code||'')}</span></div><span class="provider360-state">${escapeHtml(label(attention.level))}</span></header>
    <div class="provider360-grid">
      ${metric('Lifecycle',label(row.lifecycle_status))}${metric('Activation',label(row.activation_status))}${metric('Compliance',label(row.compliance_status))}${metric('Integrations',integration)}
      ${metric('Documents',row.document_count||0,`${row.verified_document_count||0} verified`)}${metric('Cases',row.open_case_count||0,`${row.case_attention_count||0} attention`)}${metric('Inbox',row.open_thread_count||0,`${row.needs_reply_count||0} reply`)}${metric('Approvals',row.pending_approval_count||0)}
    </div>
    ${row.primary_blocker?`<p class="provider360-blocker">Blocker: ${escapeHtml(row.primary_blocker)}</p>`:''}
  </article>`;
}

function renderRequirements(rows) {
  const groups=groupProviderRequirements(rows);
  if (!groups.length) return '<p class="provider360-empty">No activation requirements configured.</p>';
  return groups.map(group=>`<section class="provider360-track"><header><strong>${escapeHtml(label(group.track))}</strong><span>${group.passed}/${group.total} passed${group.blockers?` · ${group.blockers} blockers`:''}</span></header><div>${group.items.map(item=>`<div class="provider360-requirement"><span>${escapeHtml(item.requirement_name||item.requirement_code)}</span><strong>${escapeHtml(label(item.state))}</strong></div>`).join('')}</div></section>`).join('');
}

function renderActivity(rows) {
  if (!rows.length) return '<p class="provider360-empty">No Provider Service activity yet.</p>';
  return rows.slice(0,20).map(item=>`<div class="provider360-activity ${item.attention?'provider360-activity-attention':''}"><div><strong>${escapeHtml(label(item.item_type))}</strong><span>${escapeHtml(item.item_code||'')}</span></div><p>${escapeHtml(item.title||item.status||'Activity')}</p><time>${escapeHtml(item.occurred_at?new Date(item.occurred_at).toLocaleString():'')}</time></div>`).join('');
}

export async function loadProviderService360(vendorId, legalEntityId=null) {
  const response=await callRatewareFunction('shipper-directory-api','get_provider_360',{vendor_id:vendorId,legal_entity_id:legalEntityId||undefined});
  return response?.data || response || {};
}

export function renderProviderService360(container,payload) {
  if (!container) return;
  const relationships=Array.isArray(payload.relationships)?payload.relationships:[];
  const requirements=Array.isArray(payload.requirements)?payload.requirements:[];
  const activity=Array.isArray(payload.activity)?payload.activity:[];
  const summary=summarizeProvider360({relationships,requirements,activity});
  container.innerHTML=`<div class="provider360-shell">
    <section class="provider360-summary">${metric('Relationships',summary.relationshipCount)}${metric('Critical',summary.criticalRelationshipCount)}${metric('Needs attention',summary.attentionRelationshipCount)}${metric('Open cases',summary.openCaseCount)}${metric('Needs reply',summary.needsReplyCount)}${metric('Approvals',summary.pendingApprovalCount)}</section>
    <section class="provider360-section"><header><h3>Provider relationships</h3></header>${relationships.length?relationships.map(renderRelationship).join(''):'<p class="provider360-empty">No Provider Service relationship exists for this vendor.</p>'}</section>
    <section class="provider360-section"><header><h3>Activation readiness</h3><span>${summary.passedRequirementCount}/${summary.requiredRequirementCount} required passed</span></header>${renderRequirements(requirements)}</section>
    <section class="provider360-section"><header><h3>Recent activity</h3></header>${renderActivity(activity)}</section>
  </div>`;
}

export async function mountProviderService360(container,{vendorId,legalEntityId=null}={}) {
  if (!container || !vendorId) return;
  container.innerHTML='<div class="provider360-loading">Loading Provider Service 360…</div>';
  try { renderProviderService360(container,await loadProviderService360(vendorId,legalEntityId)); }
  catch (error) { container.innerHTML=`<div class="provider360-error">${escapeHtml(error?.message||'Provider Service 360 could not be loaded.')}</div>`; }
}
