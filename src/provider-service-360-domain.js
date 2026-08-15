const BAD_COMPLIANCE = new Set(['non_compliant','error']);
const REVIEW_COMPLIANCE = new Set(['review_required','warning']);

function n(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function deriveProviderRelationshipAttention(row = {}) {
  if (!row.provider_relationship_id) return Object.freeze({ level: 'not_configured', reasons: [] });
  const reasons = [];
  let level = 'healthy';
  const compliance = String(row.compliance_status || 'not_evaluated').toLowerCase();
  const requiredIntegrations = n(row.required_integration_count);
  const readyIntegrations = n(row.ready_integration_count);

  if (row.primary_blocker) reasons.push('primary_blocker');
  if (BAD_COMPLIANCE.has(compliance)) reasons.push('compliance');
  if (n(row.case_attention_count) > 0) reasons.push('case_attention');
  if (row.primary_blocker || BAD_COMPLIANCE.has(compliance)) level = 'critical';
  else if (n(row.case_attention_count) > 0) level = 'attention';

  if (n(row.document_attention_count) > 0) reasons.push('document_attention');
  if (n(row.needs_reply_count) > 0) reasons.push('needs_reply');
  if (n(row.pending_approval_count) > 0) reasons.push('pending_approval');
  if (REVIEW_COMPLIANCE.has(compliance) || compliance === 'not_evaluated') reasons.push('compliance_review');
  if (requiredIntegrations > readyIntegrations) reasons.push('integration_readiness');

  if (level === 'healthy' && reasons.length) level = 'attention';
  return Object.freeze({ level, reasons: Object.freeze(reasons) });
}

export function summarizeProvider360(payload = {}) {
  const relationships = Array.isArray(payload.relationships) ? payload.relationships : [];
  const requirements = Array.isArray(payload.requirements) ? payload.requirements : [];
  const activity = Array.isArray(payload.activity) ? payload.activity : [];
  const attention = relationships.map(deriveProviderRelationshipAttention);
  return Object.freeze({
    relationshipCount: relationships.length,
    criticalRelationshipCount: attention.filter(row => row.level === 'critical').length,
    attentionRelationshipCount: attention.filter(row => row.level === 'attention').length,
    openCaseCount: relationships.reduce((sum,row)=>sum+n(row.open_case_count),0),
    needsReplyCount: relationships.reduce((sum,row)=>sum+n(row.needs_reply_count),0),
    pendingApprovalCount: relationships.reduce((sum,row)=>sum+n(row.pending_approval_count),0),
    requiredRequirementCount: requirements.filter(row=>row.is_required===true).length,
    passedRequirementCount: requirements.filter(row=>row.is_required===true && ['passed','not_applicable'].includes(row.state)).length,
    blockerRequirementCount: requirements.filter(row=>row.is_blocking===true && ['failed','correction_required','expired'].includes(row.state)).length,
    activityCount: activity.length,
  });
}

export function groupProviderRequirements(rows = []) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const track = String(row.track_code || 'other');
    if (!groups.has(track)) groups.set(track, []);
    groups.get(track).push(row);
  }
  return [...groups.entries()].map(([track,items])=>Object.freeze({
    track,
    total: items.length,
    passed: items.filter(item=>['passed','not_applicable'].includes(item.state)).length,
    blockers: items.filter(item=>item.is_blocking===true && ['failed','correction_required','expired'].includes(item.state)).length,
    items: Object.freeze([...items].sort((a,b)=>n(a.sequence_number)-n(b.sequence_number))),
  }));
}
