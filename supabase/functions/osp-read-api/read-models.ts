import { OspApiError } from './http.ts';
import type { GmailSeamRow, OspReadStore, PipelineSeamRow } from './store.ts';

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
