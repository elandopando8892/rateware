const ATTENTION_ORDER = Object.freeze({ critical: 10, attention: 20, watch: 30, healthy: 40 });

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = (value) => value == null ? '' : String(value).trim();

export function normalizeProviderServiceQueue(value) {
  const normalized = text(value).toLowerCase() || 'all';
  return ['all','critical','attention','watch','healthy','needs_reply','approvals','blocked'].includes(normalized)
    ? normalized
    : 'all';
}

export function providerServiceAttentionRank(row = {}) {
  return ATTENTION_ORDER[text(row.attention_state).toLowerCase()] ?? 50;
}

export function providerServiceHealthLabel(row = {}) {
  const state = text(row.health_state).toLowerCase();
  if (state) return state;
  if (row.primary_blocker) return 'critical';
  return text(row.attention_state).toLowerCase() || 'unknown';
}

export function shouldReplaceProviderServiceMetrics({ queue = 'all', search = '', metrics = {}, currentMetrics = {} } = {}) {
  if (normalizeProviderServiceQueue(queue) === 'all' && !text(search)) return true;
  if (number(metrics?.relationships) > 0) return true;
  return number(currentMetrics?.relationships) === 0;
}

export function summarizeProviderServiceRows(rows = [], serverMetrics = null) {
  if (serverMetrics && typeof serverMetrics === 'object') {
    return Object.freeze({
      relationships: number(serverMetrics.relationships),
      critical: number(serverMetrics.critical),
      attention: number(serverMetrics.attention),
      needsReply: number(serverMetrics.needs_reply),
      pendingApprovals: number(serverMetrics.pending_approvals),
      blockedActivation: number(serverMetrics.blocked_activation),
    });
  }
  const list = Array.isArray(rows) ? rows : [];
  return Object.freeze({
    relationships: list.length,
    critical: list.filter((row) => row.attention_state === 'critical').length,
    attention: list.filter((row) => row.attention_state === 'attention').length,
    needsReply: list.filter((row) => number(row.needs_reply_count) > 0).length,
    pendingApprovals: list.filter((row) => number(row.pending_approval_count) > 0).length,
    blockedActivation: list.filter((row) => ['blocked','suspended'].includes(row.activation_status)).length,
  });
}

export function sortProviderServiceRows(rows = []) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    const attention = providerServiceAttentionRank(left) - providerServiceAttentionRank(right);
    if (attention) return attention;
    const leftHealth = left.health_score == null ? -1 : number(left.health_score);
    const rightHealth = right.health_score == null ? -1 : number(right.health_score);
    if (leftHealth !== rightHealth) return leftHealth - rightHealth;
    return text(left.vendor_name || left.vendor_legal_name).localeCompare(text(right.vendor_name || right.vendor_legal_name));
  });
}

export function providerServiceRowSignals(row = {}) {
  const signals = [];
  if (row.primary_blocker) signals.push(`Blocker: ${text(row.primary_blocker)}`);
  if (number(row.case_attention_count) > 0) signals.push(`${number(row.case_attention_count)} case attention`);
  if (number(row.document_attention_count) > 0) signals.push(`${number(row.document_attention_count)} document attention`);
  if (number(row.needs_reply_count) > 0) signals.push(`${number(row.needs_reply_count)} reply due`);
  if (number(row.pending_approval_count) > 0) signals.push(`${number(row.pending_approval_count)} approval pending`);
  if (number(row.required_integration_count) > number(row.ready_integration_count)) {
    signals.push(`${number(row.ready_integration_count)}/${number(row.required_integration_count)} integrations ready`);
  }
  if (!signals.length) signals.push('No active blocker');
  return Object.freeze(signals);
}
