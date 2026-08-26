import { OspApiError } from './http.ts';
import type { CaseDetailSeamRow, CaseSummarySeamRow, GmailSeamRow, OspReadStore, PipelineSeamRow } from './store.ts';

const PIPELINE_FIELDS = [
  'documents_pending',
  'ready_for_approval',
  'requests_total',
  'under_review',
] as const;
const GMAIL_FIELDS = [
  'connection_exists',
  'error_code',
  'error_present',
  'pubsub_configured',
  'token_expires_at',
  'watch_configured',
  'watch_expires_at',
] as const;

export const GMAIL_ERROR_CODES = [
  'AUTH_REQUIRED',
  'TOKEN_EXPIRED',
  'WATCH_EXPIRED',
  'PUBSUB_NOT_CONFIGURED',
  'UPSTREAM_UNAVAILABLE',
  'UNKNOWN',
] as const;

export type GmailErrorCode = typeof GMAIL_ERROR_CODES[number];

export type PipelineReadModel = {
  requests_total: string;
  documents_pending: string;
  under_review: string;
  ready_for_approval: string;
};

export type GmailReadModel = {
  connection_exists: boolean;
  pubsub_configured: boolean | null;
  watch_configured: boolean | null;
  token_expires_at: string | null;
  watch_expires_at: string | null;
  error_present: boolean;
  error_code: GmailErrorCode | null;
  outbound_enabled: false;
};

export const CASE_STATES = [
  'received', 'analyzing_requirements', 'awaiting_clarification',
  'awaiting_xbf_information', 'preparing', 'operations_review',
  'signature_approval', 'sales_authorization', 'ready_to_send',
  'sent', 'manual_reconciliation_required', 'accepted', 'rejected', 'closed',
] as const;

export type CaseState = typeof CASE_STATES[number];

export type CaseSummaryReadModel = {
  case_id: string;
  supplier_name: string;
  state: CaseState;
  aggregate_version: number;
  blocked_by_duplicate_review: boolean;
  created_at: string;
  updated_at: string;
  message_count: string;
  attachment_count: string;
  document_count: string;
};

export type CaseEventReadModel = {
  sequence: number;
  state: CaseState;
  occurred_at: string;
  reason_code: string;
};

export type CaseDetailReadModel = CaseSummaryReadModel & {
  latest_request: {
    subject: string | null;
    sender_domain: string | null;
    received_at: string | null;
  };
  recent_events: readonly CaseEventReadModel[];
};

const CASE_SUMMARY_FIELDS = [
  'aggregate_version', 'attachment_count', 'blocked_by_duplicate_review', 'case_id',
  'created_at', 'document_count', 'message_count', 'state', 'supplier_name', 'updated_at',
] as const;
const CASE_DETAIL_FIELDS = [
  'aggregate_version', 'attachment_count', 'blocked_by_duplicate_review', 'case_id',
  'created_at', 'document_count', 'latest_received_at', 'latest_sender_domain',
  'latest_subject', 'message_count', 'recent_events', 'state', 'supplier_name', 'updated_at',
] as const;

function recordWithExactKeys(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys])) {
    throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  }
  return value as Record<string, unknown>;
}

export function normalizeCanonicalDecimal(value: unknown): string {
  if (typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  throw new OspApiError('DEPENDENCY_UNAVAILABLE');
}

export function normalizePipelineReadModel(value: unknown): PipelineReadModel {
  const row = recordWithExactKeys(value, PIPELINE_FIELDS);
  return {
    requests_total: normalizeCanonicalDecimal(row.requests_total),
    documents_pending: normalizeCanonicalDecimal(row.documents_pending),
    under_review: normalizeCanonicalDecimal(row.under_review),
    ready_for_approval: normalizeCanonicalDecimal(row.ready_for_approval),
  };
}

function normalizeUtcDate(value: unknown): string | null {
  if (value === null) return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
    const normalized = value.toISOString();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(normalized)) {
      throw new OspApiError('DEPENDENCY_UNAVAILABLE');
    }
    return normalized;
  }
  if (typeof value !== 'string') throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.exec(value);
  if (!match) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const calendar = new Date(0);
  calendar.setUTCHours(0, 0, 0, 0);
  calendar.setUTCFullYear(year, month - 1, day);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 ||
      calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) {
    throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  const normalized = parsed.toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(normalized)) {
    throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  }
  return normalized;
}

function normalizeRequiredUtcDate(value: unknown): string {
  const normalized = normalizeUtcDate(value);
  if (normalized === null) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  return normalized;
}

function normalizeCaseState(value: unknown): CaseState {
  if (typeof value !== 'string' || !CASE_STATES.includes(value as CaseState)) {
    throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  }
  return value as CaseState;
}

function normalizeBoundedText(value: unknown, maximum: number, nullable = false): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  }
  return value;
}

function normalizeSafeInteger(value: unknown, minimum: number): number {
  const number = typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(number) || (number as number) < minimum || (number as number) > 2_147_483_647) {
    throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  }
  return number as number;
}

export function normalizeCaseSummary(value: unknown): CaseSummaryReadModel {
  const row = recordWithExactKeys(value, CASE_SUMMARY_FIELDS);
  if (typeof row.case_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.case_id) ||
      typeof row.blocked_by_duplicate_review !== 'boolean') {
    throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  }
  return {
    case_id: row.case_id,
    supplier_name: normalizeBoundedText(row.supplier_name, 256) as string,
    state: normalizeCaseState(row.state),
    aggregate_version: normalizeSafeInteger(row.aggregate_version, 0),
    blocked_by_duplicate_review: row.blocked_by_duplicate_review,
    created_at: normalizeRequiredUtcDate(row.created_at),
    updated_at: normalizeRequiredUtcDate(row.updated_at),
    message_count: normalizeCanonicalDecimal(row.message_count),
    attachment_count: normalizeCanonicalDecimal(row.attachment_count),
    document_count: normalizeCanonicalDecimal(row.document_count),
  };
}

function normalizeRecentEvents(value: unknown): readonly CaseEventReadModel[] {
  if (!Array.isArray(value) || value.length > 20) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  return value.map((candidate) => {
    const row = recordWithExactKeys(candidate, ['occurred_at', 'reason_code', 'sequence', 'state']);
    return {
      sequence: normalizeSafeInteger(row.sequence, 1),
      state: normalizeCaseState(row.state),
      occurred_at: normalizeRequiredUtcDate(row.occurred_at),
      reason_code: normalizeBoundedText(row.reason_code, 128) as string,
    };
  });
}

export function normalizeCaseDetail(value: unknown): CaseDetailReadModel {
  const row = recordWithExactKeys(value, CASE_DETAIL_FIELDS);
  const summary = normalizeCaseSummary(Object.fromEntries(CASE_SUMMARY_FIELDS.map((key) => [key, row[key]])));
  const subject = normalizeBoundedText(row.latest_subject, 998, true);
  const senderDomain = normalizeBoundedText(row.latest_sender_domain, 253, true);
  const receivedAt = normalizeUtcDate(row.latest_received_at);
  if ((subject === null || senderDomain === null || receivedAt === null) &&
      !(subject === null && senderDomain === null && receivedAt === null)) {
    throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  }
  return {
    ...summary,
    latest_request: { subject, sender_domain: senderDomain, received_at: receivedAt },
    recent_events: normalizeRecentEvents(row.recent_events),
  };
}

export function normalizeGmailReadModel(value: unknown): GmailReadModel {
  const row = recordWithExactKeys(value, GMAIL_FIELDS);
  if (typeof row.connection_exists !== 'boolean' || typeof row.error_present !== 'boolean') {
    throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  }

  if (!row.connection_exists) {
    if (row.pubsub_configured !== null || row.watch_configured !== null ||
        row.token_expires_at !== null || row.watch_expires_at !== null ||
        row.error_present !== false || row.error_code !== null) {
      throw new OspApiError('DEPENDENCY_UNAVAILABLE');
    }
    return {
      connection_exists: false,
      pubsub_configured: null,
      watch_configured: null,
      token_expires_at: null,
      watch_expires_at: null,
      error_present: false,
      error_code: null,
      outbound_enabled: false,
    };
  }

  if (typeof row.pubsub_configured !== 'boolean' || typeof row.watch_configured !== 'boolean') {
    throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  }
  const tokenExpiresAt = normalizeUtcDate(row.token_expires_at);
  const watchExpiresAt = normalizeUtcDate(row.watch_expires_at);
  if (!row.watch_configured && watchExpiresAt !== null) throw new OspApiError('DEPENDENCY_UNAVAILABLE');

  let errorCode: GmailErrorCode | null;
  if (row.error_present) {
    if (typeof row.error_code !== 'string' || row.error_code.trim() === '') {
      throw new OspApiError('DEPENDENCY_UNAVAILABLE');
    }
    errorCode = GMAIL_ERROR_CODES.includes(row.error_code as GmailErrorCode)
      ? row.error_code as GmailErrorCode
      : 'UNKNOWN';
  } else {
    if (row.error_code !== null) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
    errorCode = null;
  }

  return {
    connection_exists: true,
    pubsub_configured: row.pubsub_configured,
    watch_configured: row.watch_configured,
    token_expires_at: tokenExpiresAt,
    watch_expires_at: watchExpiresAt,
    error_present: row.error_present,
    error_code: errorCode,
    outbound_enabled: false,
  };
}

export async function listOnboardingWorkspace(
  store: OspReadStore,
  organizationId: string,
  signal?: AbortSignal,
): Promise<PipelineReadModel> {
  const row: PipelineSeamRow = await store.readPipeline(organizationId, signal);
  return normalizePipelineReadModel(row);
}

export async function getGmailHealth(
  store: OspReadStore,
  organizationId: string,
  signal?: AbortSignal,
): Promise<GmailReadModel> {
  const row: GmailSeamRow = await store.readGmail(organizationId, signal);
  return normalizeGmailReadModel(row);
}

export async function listCustomerRegistrationCases(
  store: OspReadStore,
  organizationId: string,
  signal?: AbortSignal,
): Promise<{ cases: readonly CaseSummaryReadModel[] }> {
  const rows = await store.readCases(organizationId, signal);
  if (!Array.isArray(rows) || rows.length > 100) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  return { cases: rows.map(normalizeCaseSummary) };
}

export async function getCustomerRegistrationCase(
  store: OspReadStore,
  organizationId: string,
  caseId: string,
  signal?: AbortSignal,
): Promise<CaseDetailReadModel> {
  return normalizeCaseDetail(await store.readCase(organizationId, caseId, signal));
}
