import { decodeWords } from 'npm:postal-mime@3.0.0';

import { OspApiError } from './http.ts';
import type { CaseDetailSeamRow, CaseSummarySeamRow, CorporateProfileSeamRow, GmailSeamRow, OspReadStore, PipelineSeamRow } from './store.ts';

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
  'poll_interval_seconds',
  'poll_last_completed_at',
  'poll_status',
  'pubsub_configured',
  'scheduled_poll_configured',
  'token_expires_at',
  'watch_configured',
  'watch_expires_at',
] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
  scheduled_poll_configured: boolean | null;
  poll_interval_seconds: number | null;
  poll_last_completed_at: string | null;
  poll_status: 'disabled' | 'running' | 'succeeded' | 'failed' | null;
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

export type CorporateProfileFieldReadModel = {
  code: string;
  label: string;
  display_value: string;
  verification_status: 'verified' | 'needs_review' | 'unverified' | 'rejected';
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted' | 'highly_restricted';
  support_status: 'verified_match' | 'conflict' | 'evidence_available' | 'unsupported';
  evidence_candidate_count: string;
  reviewed_candidate_count: string;
  review_candidates: readonly {
    review_id: string;
    review_field_id: string;
    review_revision: number;
    review_status: 'pending' | 'in_review';
    ownership: 'available' | 'owned' | 'locked';
    field_status: 'pending' | 'accepted' | 'corrected' | 'rejected' | 'withheld';
    document_type: string;
    evidence_label: string;
    proposed_display_value: string;
    pending_field_count: string;
    total_field_count: string;
  }[];
};

export type CorporateProfileEvidenceReadModel = {
  name: string;
  document_type: string;
  verification_status: 'verified' | 'needs_review' | 'unverified' | 'rejected';
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted' | 'highly_restricted';
  release_policy: 'automatic' | 'review_required' | 'approval_required' | 'never_release';
  expiry_state: 'no_expiry' | 'expired' | 'expiring_soon' | 'current';
};

export type CorporateProfileEntityReadModel = {
  entity_id: string;
  entity_code: string;
  legal_name: string;
  country_code: string;
  default_currency: string | null;
  status: 'draft' | 'active';
  verified_fields: string;
  review_fields: string;
  total_fields: string;
  fields: readonly CorporateProfileFieldReadModel[];
  promotion_candidates: readonly {
    review_id: string;
    review_revision: number;
    document_type: string;
    evidence_label: string;
    candidate_sha256: string;
    candidate_count: string;
    change_count: string;
    unchanged_count: string;
    withheld_count: string;
    expected_current_fact_ids: Readonly<Record<string, string | null>>;
    promotion_status: 'ready' | 'pending' | 'applied' | 'conflict' | 'failed';
  }[];
  evidence: readonly CorporateProfileEvidenceReadModel[];
};

export type CorporateProfileReadModel = { entities: readonly CorporateProfileEntityReadModel[]; disclosure_locked: true };

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

function normalizeMimeHeader(value: unknown): string | null {
  const raw = normalizeBoundedText(value, 998, true);
  if (raw === null) return null;
  try {
    return normalizeBoundedText(decodeWords(raw).trim(), 998) as string;
  } catch {
    return raw;
  }
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
  const subject = normalizeMimeHeader(row.latest_subject);
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
      scheduled_poll_configured: null,
      poll_interval_seconds: null,
      poll_last_completed_at: null,
      poll_status: null,
      token_expires_at: null,
      watch_expires_at: null,
      error_present: false,
      error_code: null,
      outbound_enabled: false,
    };
  }

  if (typeof row.pubsub_configured !== 'boolean' || typeof row.watch_configured !== 'boolean' ||
      typeof row.scheduled_poll_configured !== 'boolean' ||
      !Number.isSafeInteger(Number(row.poll_interval_seconds)) || Number(row.poll_interval_seconds) < 60 || Number(row.poll_interval_seconds) > 3600 ||
      !['disabled', 'running', 'succeeded', 'failed'].includes(String(row.poll_status))) {
    throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  }
  const tokenExpiresAt = normalizeUtcDate(row.token_expires_at);
  const watchExpiresAt = normalizeUtcDate(row.watch_expires_at);
  const pollLastCompletedAt = normalizeUtcDate(row.poll_last_completed_at);
  if (!row.watch_configured && watchExpiresAt !== null) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  if (!row.scheduled_poll_configured && (row.poll_status !== 'disabled' || pollLastCompletedAt !== null)) throw new OspApiError('DEPENDENCY_UNAVAILABLE');

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
    scheduled_poll_configured: row.scheduled_poll_configured,
    poll_interval_seconds: Number(row.poll_interval_seconds),
    poll_last_completed_at: pollLastCompletedAt,
    poll_status: row.poll_status as 'disabled' | 'running' | 'succeeded' | 'failed',
    token_expires_at: tokenExpiresAt,
    watch_expires_at: watchExpiresAt,
    error_present: row.error_present,
    error_code: errorCode,
    outbound_enabled: false,
  };
}

const PROFILE_VERIFICATION = ['verified', 'needs_review', 'unverified', 'rejected'] as const;
const PROFILE_SENSITIVITY = ['public', 'internal', 'confidential', 'restricted', 'highly_restricted'] as const;
const PROFILE_RELEASE_POLICY = ['automatic', 'review_required', 'approval_required', 'never_release'] as const;
const PROFILE_EXPIRY = ['no_expiry', 'expired', 'expiring_soon', 'current'] as const;
const PROFILE_SUPPORT = ['verified_match', 'conflict', 'evidence_available', 'unsupported'] as const;
const PROFILE_REVIEW_STATUS = ['pending', 'in_review'] as const;
const PROFILE_REVIEW_OWNERSHIP = ['available', 'owned', 'locked'] as const;
const PROFILE_FIELD_STATUS = ['pending', 'accepted', 'corrected', 'rejected', 'withheld'] as const;
const PROFILE_PROMOTION_STATUS = ['ready', 'pending', 'applied', 'conflict', 'failed'] as const;

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  return value as T[number];
}

function normalizeProfileField(value: unknown): CorporateProfileFieldReadModel {
  const row = recordWithExactKeys(value, [
    'code', 'display_value', 'evidence_candidate_count', 'label', 'review_candidates',
    'reviewed_candidate_count', 'sensitivity', 'support_status', 'verification_status',
  ]);
  const code = normalizeBoundedText(row.code, 128) as string;
  if (!/^[a-z][a-z0-9_]{1,127}$/.test(code)) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  if (!Array.isArray(row.review_candidates) || row.review_candidates.length > 20) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  return {
    code,
    label: normalizeBoundedText(row.label, 128) as string,
    display_value: normalizeBoundedText(row.display_value, 512) as string,
    verification_status: enumValue(row.verification_status, PROFILE_VERIFICATION),
    sensitivity: enumValue(row.sensitivity, PROFILE_SENSITIVITY),
    support_status: enumValue(row.support_status, PROFILE_SUPPORT),
    evidence_candidate_count: normalizeCanonicalDecimal(row.evidence_candidate_count),
    reviewed_candidate_count: normalizeCanonicalDecimal(row.reviewed_candidate_count),
    review_candidates: row.review_candidates.map((candidate) => {
      const item = recordWithExactKeys(candidate, [
        'document_type', 'evidence_label', 'field_status', 'ownership', 'pending_field_count',
        'proposed_display_value', 'review_field_id', 'review_id', 'review_revision',
        'review_status', 'total_field_count',
      ]);
      if (typeof item.review_id !== 'string' || !UUID_PATTERN.test(item.review_id) ||
          typeof item.review_field_id !== 'string' || !UUID_PATTERN.test(item.review_field_id)) {
        throw new OspApiError('DEPENDENCY_UNAVAILABLE');
      }
      const reviewRevision = Number(item.review_revision);
      const documentType = normalizeBoundedText(item.document_type, 128) as string;
      if (!Number.isSafeInteger(reviewRevision) || reviewRevision < 1 || reviewRevision > 2_147_483_647 ||
          !/^[a-z][a-z0-9_]{1,127}$/.test(documentType)) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
      return Object.freeze({
        review_id: item.review_id,
        review_field_id: item.review_field_id,
        review_revision: reviewRevision,
        review_status: enumValue(item.review_status, PROFILE_REVIEW_STATUS),
        ownership: enumValue(item.ownership, PROFILE_REVIEW_OWNERSHIP),
        field_status: enumValue(item.field_status, PROFILE_FIELD_STATUS),
        document_type: documentType,
        evidence_label: normalizeBoundedText(item.evidence_label, 256) as string,
        proposed_display_value: normalizeBoundedText(item.proposed_display_value, 512) as string,
        pending_field_count: normalizeCanonicalDecimal(item.pending_field_count),
        total_field_count: normalizeCanonicalDecimal(item.total_field_count),
      });
    }),
  };
}

function normalizeProfileEvidence(value: unknown): CorporateProfileEvidenceReadModel {
  const row = recordWithExactKeys(value, ['document_type', 'expiry_state', 'name', 'release_policy', 'sensitivity', 'verification_status']);
  const documentType = normalizeBoundedText(row.document_type, 128) as string;
  if (!/^[a-z][a-z0-9_]{1,127}$/.test(documentType)) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  return {
    name: normalizeBoundedText(row.name, 256) as string,
    document_type: documentType,
    verification_status: enumValue(row.verification_status, PROFILE_VERIFICATION),
    sensitivity: enumValue(row.sensitivity, PROFILE_SENSITIVITY),
    release_policy: enumValue(row.release_policy, PROFILE_RELEASE_POLICY),
    expiry_state: enumValue(row.expiry_state, PROFILE_EXPIRY),
  };
}

function normalizeCorporateProfileEntity(value: unknown): CorporateProfileEntityReadModel {
  const row = recordWithExactKeys(value, [
    'country_code', 'default_currency', 'entity_code', 'entity_id', 'evidence', 'fields',
    'legal_name', 'promotion_candidates', 'review_fields', 'status', 'total_fields', 'verified_fields',
  ]);
  if (typeof row.entity_id !== 'string' || !UUID_PATTERN.test(row.entity_id) ||
      typeof row.entity_code !== 'string' || !/^[A-Z0-9]{2,16}$/.test(row.entity_code) ||
      typeof row.country_code !== 'string' || !/^[A-Z]{2}$/.test(row.country_code) ||
      !(row.default_currency === null || (typeof row.default_currency === 'string' && /^[A-Z]{3}$/.test(row.default_currency))) ||
      !Array.isArray(row.fields) || row.fields.length > 128 || !Array.isArray(row.evidence) || row.evidence.length > 64 ||
      !Array.isArray(row.promotion_candidates) || row.promotion_candidates.length > 20) {
    throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  }
  const fields = row.fields.map(normalizeProfileField);
  if (new Set(fields.map((field) => field.code)).size !== fields.length) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  const promotionCandidates = row.promotion_candidates.map((value) => {
    const candidate = recordWithExactKeys(value, [
      'candidate_count', 'candidate_sha256', 'change_count', 'document_type', 'evidence_label',
      'expected_current_fact_ids', 'promotion_status', 'review_id', 'review_revision',
      'unchanged_count', 'withheld_count',
    ]);
    if (typeof candidate.review_id !== 'string' || !UUID_PATTERN.test(candidate.review_id) ||
        typeof candidate.candidate_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(candidate.candidate_sha256) ||
        typeof candidate.document_type !== 'string' || !/^[a-z][a-z0-9_]{1,127}$/.test(candidate.document_type) ||
        !candidate.expected_current_fact_ids || typeof candidate.expected_current_fact_ids !== 'object' || Array.isArray(candidate.expected_current_fact_ids)) {
      throw new OspApiError('DEPENDENCY_UNAVAILABLE');
    }
    const reviewRevision = Number(candidate.review_revision);
    if (!Number.isSafeInteger(reviewRevision) || reviewRevision < 1 || reviewRevision > 2_147_483_647) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
    const expectedCurrentFactIds: Record<string, string | null> = {};
    for (const [key, currentId] of Object.entries(candidate.expected_current_fact_ids as Record<string, unknown>)) {
      if (!/^[a-z][a-z0-9_]{1,127}$/.test(key) || !(currentId === null || typeof currentId === 'string' && UUID_PATTERN.test(currentId))) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
      expectedCurrentFactIds[key] = currentId as string | null;
    }
    return Object.freeze({
      review_id: candidate.review_id,
      review_revision: reviewRevision,
      document_type: candidate.document_type,
      evidence_label: normalizeBoundedText(candidate.evidence_label, 256) as string,
      candidate_sha256: candidate.candidate_sha256,
      candidate_count: normalizeCanonicalDecimal(candidate.candidate_count),
      change_count: normalizeCanonicalDecimal(candidate.change_count),
      unchanged_count: normalizeCanonicalDecimal(candidate.unchanged_count),
      withheld_count: normalizeCanonicalDecimal(candidate.withheld_count),
      expected_current_fact_ids: Object.freeze(expectedCurrentFactIds),
      promotion_status: enumValue(candidate.promotion_status, PROFILE_PROMOTION_STATUS),
    });
  });
  return {
    entity_id: row.entity_id,
    entity_code: row.entity_code,
    legal_name: normalizeBoundedText(row.legal_name, 256) as string,
    country_code: row.country_code,
    default_currency: row.default_currency,
    status: enumValue(row.status, ['draft', 'active'] as const),
    verified_fields: normalizeCanonicalDecimal(row.verified_fields),
    review_fields: normalizeCanonicalDecimal(row.review_fields),
    total_fields: normalizeCanonicalDecimal(row.total_fields),
    fields,
    promotion_candidates: promotionCandidates,
    evidence: row.evidence.map(normalizeProfileEvidence),
  };
}

export function normalizeCorporateProfile(value: unknown): CorporateProfileReadModel {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  const entities = value.map(normalizeCorporateProfileEntity);
  if (new Set(entities.map((entity) => entity.entity_id)).size !== entities.length ||
      new Set(entities.map((entity) => entity.entity_code)).size !== entities.length) {
    throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  }
  return { entities, disclosure_locked: true };
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

export async function getCorporateProfile(
  store: OspReadStore,
  organizationId: string,
  reviewerSubject: string,
  signal?: AbortSignal,
): Promise<CorporateProfileReadModel> {
  const rows: readonly CorporateProfileSeamRow[] = await store.readCorporateProfile(organizationId, reviewerSubject, signal);
  return normalizeCorporateProfile(rows);
}
