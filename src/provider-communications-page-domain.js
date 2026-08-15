const QUEUES = new Set([
  'all',
  'unmatched',
  'needs_review',
  'needs_reply',
  'waiting_xbf',
  'waiting_provider',
  'waiting_external',
  'active',
  'resolved',
]);

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = (value) => value == null ? '' : String(value).trim();

export function normalizeCommunicationQueue(value) {
  const normalized = text(value).toLowerCase() || 'all';
  return QUEUES.has(normalized) ? normalized : 'all';
}

export function communicationPriorityRank(row = {}) {
  const explicit = number(row.priority_rank);
  if (explicit > 0) return explicit;
  const queue = normalizeCommunicationQueue(row.queue_code);
  return {
    unmatched: 10,
    needs_review: 20,
    needs_reply: 30,
    waiting_xbf: 40,
    waiting_provider: 50,
    waiting_external: 50,
    active: 60,
    resolved: 90,
  }[queue] || 70;
}

export function sortCommunicationThreads(rows = []) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    const priority = communicationPriorityRank(left) - communicationPriorityRank(right);
    if (priority) return priority;
    const leftTime = Date.parse(left.last_message_at || left.updated_at || 0) || 0;
    const rightTime = Date.parse(right.last_message_at || right.updated_at || 0) || 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return text(left.subject).localeCompare(text(right.subject));
  });
}

export function summarizeCommunicationThreads(rows = [], serverMetrics = null) {
  if (serverMetrics && typeof serverMetrics === 'object') {
    return Object.freeze({
      threads: number(serverMetrics.threads),
      unmatched: number(serverMetrics.unmatched),
      needsReview: number(serverMetrics.needs_review),
      needsReply: number(serverMetrics.needs_reply),
      waitingXbf: number(serverMetrics.waiting_xbf),
      waitingExternal: number(serverMetrics.waiting_external),
      resolved: number(serverMetrics.resolved),
    });
  }
  const list = Array.isArray(rows) ? rows : [];
  return Object.freeze({
    threads: list.length,
    unmatched: list.filter((row) => row.queue_code === 'unmatched').length,
    needsReview: list.filter((row) => row.queue_code === 'needs_review').length,
    needsReply: list.filter((row) => row.needs_reply || row.queue_code === 'needs_reply').length,
    waitingXbf: list.filter((row) => row.queue_code === 'waiting_xbf').length,
    waitingExternal: list.filter((row) => ['waiting_provider', 'waiting_external'].includes(row.queue_code)).length,
    resolved: list.filter((row) => row.queue_code === 'resolved').length,
  });
}

export function shouldReplaceCommunicationMetrics({ queue = 'all', search = '', metrics = {}, currentMetrics = {} } = {}) {
  if (normalizeCommunicationQueue(queue) === 'all' && !text(search)) return true;
  if (number(metrics?.threads) > 0) return true;
  return number(currentMetrics?.threads) === 0;
}

export function communicationThreadSignals(row = {}) {
  const signals = [];
  if (row.needs_reply) signals.push('Reply due');
  if (number(row.candidate_count) > 0) signals.push(`${number(row.candidate_count)} match candidate${number(row.candidate_count) === 1 ? '' : 's'}`);
  if (number(row.attachment_count) > 0) signals.push(`${number(row.attachment_count)} attachment${number(row.attachment_count) === 1 ? '' : 's'}`);
  if (number(row.case_count) > 0) signals.push(`${number(row.case_count)} linked case${number(row.case_count) === 1 ? '' : 's'}`);
  if (!signals.length) signals.push('No active signal');
  return Object.freeze(signals);
}

export function communicationProviderLabel(row = {}) {
  return text(row.vendor_name || row.vendor_legal_name || row.vendor_code) || 'Unmatched provider';
}
