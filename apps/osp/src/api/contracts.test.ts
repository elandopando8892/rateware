import { describe, expect, it } from 'vitest';

import {
  CanonicalCountSchema,
  CaseFormWorkspaceResponseSchema,
  CaseDetailSuccessResponseSchema,
  CaseListSuccessResponseSchema,
  GmailReadModelSchema,
  GmailWatchSuccessResponseSchema,
  OspErrorResponseSchema,
  OspReadRequestSchema,
  PipelineSuccessResponseSchema,
} from './contracts';

it('exposes only safe automatic-prefill provenance in the case form workspace', () => {
  const response = {
    version: 1,
    data: {
      caseId: '11111111-1111-4111-8111-111111111111', supplierName: 'Synthetic supplier', caseVersion: 4, caseState: 'preparing', templateName: null, template: null, instance: null,
      mappings: [{ id: '22222222-2222-4222-8222-222222222222', version: 1, status: 'unresolved', automaticStatus: 'ready_for_operations_review', afterSha256: 'a'.repeat(64), matchesCurrentDraft: true, fields: [{ fieldId: 'legal_name', source: 'rateware', status: 'prepared', evidenceCount: 1 }], evidence: { sourceDocumentVersionId: '33333333-3333-4333-8333-333333333333', sourceDocumentVersion: 1, sourceDocumentStatus: 'review_required', sourceDocumentFingerprint: 'b'.repeat(64), extractionId: '44444444-4444-4444-8444-444444444444', extractionStatus: 'review_required', totalFieldCount: 2, invalidFieldCount: 0, protectedFields: [{ id: '55555555-5555-4555-8555-555555555555', fieldKey: 'fiscal.taxIdentifier', presence: 'present', value: 'SYN010101AA1', confidence: 0.91, validation: 'valid', evidenceCount: 1, reviewed: false }] }, updatedAt: '2026-08-26T20:00:00.000Z' }], evidenceReady: false,
      capabilities: { saveDraft: true, acceptMapping: true, correctMapping: false, submitForReview: false },
    },
  } as const;
  expect(CaseFormWorkspaceResponseSchema.parse(response)).toEqual(response);
  expect(CaseFormWorkspaceResponseSchema.safeParse({ ...response, data: { ...response.data, mappings: [{ ...response.data.mappings[0], values: { legal_name: 'private' } }] } }).success).toBe(false);
  expect(CaseFormWorkspaceResponseSchema.safeParse({ ...response, data: { ...response.data, mappings: [{ ...response.data.mappings[0], evidence: { ...response.data.mappings[0].evidence, protectedFields: [{ ...response.data.mappings[0].evidence.protectedFields[0], opaqueObjectKey: 'secret/path' }] } }] } }).success).toBe(false);
});

it('accepts only a safe Gmail watch renewal receipt', () => {
  const receipt = {
    version: 1,
    data: {
      watch_configured: true,
      watch_expires_at: '2030-01-07T00:00:00.000Z',
      outbound_enabled: false,
    },
  } as const;
  expect(GmailWatchSuccessResponseSchema.parse(receipt)).toEqual(receipt);
  expect(GmailWatchSuccessResponseSchema.safeParse({
    ...receipt,
    data: { ...receipt.data, history_id: 'secret-history-id' },
  }).success).toBe(false);
});

describe('CanonicalCountSchema', () => {
  it.each(['0', '1', '900719925474099300000'])('preserves canonical decimal %s', (value) => {
    expect(CanonicalCountSchema.parse(value)).toBe(value);
  });

  it.each([null, undefined, '', ' ', true, false, 0, 1, -1, 1.5, '-1', '01', '1.0', [], {}])(
    'rejects non-canonical boundary value %j',
    (value) => expect(CanonicalCountSchema.safeParse(value).success).toBe(false),
  );
});

it('accepts only the exact version-one action request', () => {
  expect(OspReadRequestSchema.parse({ version: 1, action: 'provider_gmail_status' })).toEqual({
    version: 1,
    action: 'provider_gmail_status',
  });
  expect(OspReadRequestSchema.safeParse({ version: 2, action: 'provider_gmail_status' }).success).toBe(false);
  expect(OspReadRequestSchema.safeParse({ version: 1, action: 'provider_gmail_status', organization: 'x' }).success).toBe(false);
  expect(OspReadRequestSchema.parse({ version: 1, action: 'get_customer_registration_case', case_id: '22222222-2222-4222-8222-222222222222' })).toEqual({
    version: 1, action: 'get_customer_registration_case', case_id: '22222222-2222-4222-8222-222222222222',
  });
  expect(OspReadRequestSchema.safeParse({ version: 1, action: 'get_customer_registration_case' }).success).toBe(false);
});

it('validates exact case summaries and keeps request bodies outside the read model', () => {
  const summary = {
    case_id: '22222222-2222-4222-8222-222222222222', supplier_name: 'Synthetic Supplier', state: 'received', aggregate_version: 1,
    blocked_by_duplicate_review: false, created_at: '2030-01-01T00:00:00.000Z', updated_at: '2030-01-01T01:00:00.000Z',
    message_count: '1', attachment_count: '2', document_count: '0',
  };
  expect(CaseListSuccessResponseSchema.parse({ version: 1, data: { cases: [summary] } }).data.cases).toEqual([summary]);
  const detail = {
    version: 1,
    data: {
      ...summary,
      latest_request: { subject: 'Customer setup request', sender_domain: 'supplier.example', received_at: '2030-01-01T00:00:00.000Z' },
      recent_events: [{ sequence: 1, state: 'received', occurred_at: '2030-01-01T00:00:00.000Z', reason_code: 'case_received' }],
    },
  };
  expect(CaseDetailSuccessResponseSchema.parse(detail)).toEqual(detail);
  expect(CaseDetailSuccessResponseSchema.safeParse({ ...detail, data: { ...detail.data, safe_body: 'private' } }).success).toBe(false);
  expect(CaseDetailSuccessResponseSchema.safeParse({ ...detail, data: { ...detail.data, latest_request: { ...detail.data.latest_request, sender_domain: null } } }).success).toBe(false);
});

it('requires the exact four pipeline keys inside a strict success envelope', () => {
  const valid = { version: 1, data: { requests_total: '4', documents_pending: '3', under_review: '2', ready_for_approval: '1' } };
  expect(PipelineSuccessResponseSchema.parse(valid)).toEqual(valid);
  expect(PipelineSuccessResponseSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
  expect(PipelineSuccessResponseSchema.safeParse({ version: 1, data: { ...valid.data, extra: '0' } }).success).toBe(false);
  expect(PipelineSuccessResponseSchema.safeParse({ version: 1, data: { ...valid.data, requests_total: 4 } }).success).toBe(false);
});

it('enforces every Gmail discriminant and invariant', () => {
  const disconnected = { connection_exists: false, pubsub_configured: null, watch_configured: null, token_expires_at: null, watch_expires_at: null, error_present: false, error_code: null, outbound_enabled: false };
  expect(GmailReadModelSchema.parse(disconnected)).toEqual(disconnected);
  expect(GmailReadModelSchema.safeParse({ ...disconnected, pubsub_configured: false }).success).toBe(false);

  const connected = { connection_exists: true, pubsub_configured: true, watch_configured: true, token_expires_at: '2026-08-22T20:00:00.000Z', watch_expires_at: '2026-08-22T21:00:00.000Z', error_present: false, error_code: null, outbound_enabled: false };
  expect(GmailReadModelSchema.parse(connected)).toEqual(connected);
  expect(GmailReadModelSchema.safeParse({ ...connected, watch_configured: false }).success).toBe(false);
  expect(GmailReadModelSchema.safeParse({ ...connected, error_present: true }).success).toBe(false);
  expect(GmailReadModelSchema.safeParse({ ...connected, error_code: 'RAW_UPSTREAM' }).success).toBe(false);
  expect(GmailReadModelSchema.safeParse({ ...connected, token_expires_at: '2026-08-22' }).success).toBe(false);
  expect(GmailReadModelSchema.safeParse({ ...connected, extra: true }).success).toBe(false);
});

it('accepts only the strict safe-error seam', () => {
  const valid = { error: { code: 'DEPENDENCY_UNAVAILABLE', incident_id: 'incident-synthetic' } };
  expect(OspErrorResponseSchema.parse(valid)).toEqual(valid);
  expect(OspErrorResponseSchema.safeParse({ ...valid, message: 'raw' }).success).toBe(false);
  expect(OspErrorResponseSchema.safeParse({ error: { ...valid.error, detail: 'raw' } }).success).toBe(false);
});
