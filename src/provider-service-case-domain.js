export const PROVIDER_SERVICE_CASE_STATUSES = Object.freeze([
  'new',
  'open',
  'waiting_provider',
  'waiting_xbf',
  'waiting_external',
  'blocked',
  'escalated',
  'resolved',
  'closed',
  'cancelled',
]);

export const PROVIDER_SERVICE_CASE_PRIORITIES = Object.freeze([
  'low',
  'normal',
  'high',
  'urgent',
  'critical',
]);

const STATUS_TRANSITIONS = Object.freeze({
  new: ['open', 'blocked', 'escalated', 'cancelled'],
  open: ['waiting_provider', 'waiting_xbf', 'waiting_external', 'blocked', 'escalated', 'resolved', 'cancelled'],
  waiting_provider: ['open', 'blocked', 'escalated', 'resolved', 'cancelled'],
  waiting_xbf: ['open', 'blocked', 'escalated', 'resolved', 'cancelled'],
  waiting_external: ['open', 'blocked', 'escalated', 'resolved', 'cancelled'],
  blocked: ['open', 'escalated', 'resolved', 'cancelled'],
  escalated: ['open', 'blocked', 'resolved', 'cancelled'],
  resolved: ['open', 'closed'],
  closed: [],
  cancelled: [],
});

const TYPE_PATTERN = /^[a-z][a-z0-9_]{1,127}$/;

function parseDate(value, label) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${label} must be a valid date.`);
  return date;
}

export function normalizeProviderServiceCaseType(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!TYPE_PATTERN.test(normalized)) {
    throw new TypeError('Case type must be a normalized snake_case identifier.');
  }
  return normalized;
}

export function normalizeProviderServiceCasePriority(value = 'normal') {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!PROVIDER_SERVICE_CASE_PRIORITIES.includes(normalized)) {
    throw new RangeError(`Unsupported Provider Service priority: ${normalized}`);
  }
  return normalized;
}

export function canTransitionProviderServiceCase(fromStatus, toStatus) {
  const from = String(fromStatus ?? '').trim().toLowerCase();
  const to = String(toStatus ?? '').trim().toLowerCase();
  if (!PROVIDER_SERVICE_CASE_STATUSES.includes(from) || !PROVIDER_SERVICE_CASE_STATUSES.includes(to)) return false;
  if (from === to) return true;
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertProviderServiceCaseTransition(fromStatus, toStatus) {
  if (!canTransitionProviderServiceCase(fromStatus, toStatus)) {
    throw new RangeError(`Invalid Provider Service case transition: ${fromStatus} -> ${toStatus}`);
  }
  return String(toStatus).trim().toLowerCase();
}

export function calculateProviderServiceDueAt(openedAt, minutes) {
  const opened = parseDate(openedAt, 'Opened at');
  const numericMinutes = Number(minutes);
  if (!opened) return null;
  if (!Number.isSafeInteger(numericMinutes) || numericMinutes <= 0) {
    throw new TypeError('SLA minutes must be a positive integer.');
  }
  return new Date(opened.getTime() + numericMinutes * 60_000);
}

export function evaluateProviderServiceCaseSla(input, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Case SLA input must be an object.');
  }

  const current = parseDate(now, 'Current time');
  const responseDue = parseDate(input.firstResponseDueAt, 'First response due at');
  const responded = parseDate(input.firstRespondedAt, 'First responded at');
  const resolutionDue = parseDate(input.resolutionDueAt, 'Resolution due at');
  const resolved = parseDate(input.resolvedAt, 'Resolved at');
  const status = String(input.status ?? 'open').trim().toLowerCase();

  let firstResponseState = 'not_configured';
  if (responseDue) {
    if (responded) firstResponseState = responded <= responseDue ? 'met' : 'breached';
    else firstResponseState = current > responseDue ? 'breached' : 'pending';
  }

  let resolutionState = 'not_configured';
  if (resolutionDue) {
    if (resolved) resolutionState = resolved <= resolutionDue ? 'met' : 'breached';
    else if (['closed', 'cancelled'].includes(status)) resolutionState = 'not_applicable';
    else resolutionState = current > resolutionDue ? 'breached' : 'pending';
  }

  return Object.freeze({ firstResponseState, resolutionState });
}

export function deriveProviderServiceWorkQueue(input, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'active';
  const status = String(input.status ?? 'open').trim().toLowerCase();
  const escalationLevel = Number(input.escalationLevel ?? 0);
  const overdueTaskCount = Number(input.overdueTaskCount ?? 0);
  const sla = evaluateProviderServiceCaseSla(input, now);

  if (status === 'escalated' || escalationLevel > 0) return 'escalated';
  if (status === 'blocked') return 'blocked';
  if (sla.firstResponseState === 'breached' || sla.resolutionState === 'breached' || overdueTaskCount > 0) return 'overdue';
  if (status === 'waiting_provider') return 'waiting_provider';
  if (status === 'waiting_xbf') return 'waiting_xbf';
  if (status === 'waiting_external') return 'waiting_external';
  if (status === 'new') return 'new';
  if (['resolved', 'closed', 'cancelled'].includes(status)) return 'terminal';
  return 'active';
}

export function providerServiceWorkPriorityScore(input, now = new Date()) {
  const priority = normalizeProviderServiceCasePriority(input?.priority ?? 'normal');
  const base = { low: 10, normal: 20, high: 30, urgent: 40, critical: 50 }[priority];
  const queue = deriveProviderServiceWorkQueue(input ?? {}, now);
  const queueBoost = { escalated: 100, overdue: 80, blocked: 60, new: 20 }[queue] ?? 0;
  return base + queueBoost;
}

export function validateProviderServiceCaseDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Provider Service case draft must be an object.');
  }
  const subject = String(input.subject ?? '').trim();
  if (!subject) throw new TypeError('Case subject is required.');
  return Object.freeze({
    caseType: normalizeProviderServiceCaseType(input.caseType),
    subject,
    priority: normalizeProviderServiceCasePriority(input.priority ?? 'normal'),
  });
}
