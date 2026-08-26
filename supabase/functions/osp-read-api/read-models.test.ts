import assert from 'node:assert/strict';

import { OspApiError } from './http.ts';
import {
  getGmailHealth,
  getCustomerRegistrationCase,
  listCustomerRegistrationCases,
  listOnboardingWorkspace,
  normalizeCaseDetail,
  normalizeCaseSummary,
  normalizeCanonicalDecimal,
  normalizeGmailReadModel,
  normalizePipelineReadModel,
} from './read-models.ts';
import type { OspReadStore } from './store.ts';

const organizationId = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';

const caseSummary = {
  case_id: caseId, supplier_name: 'Synthetic Supplier', state: 'received', aggregate_version: '1',
  blocked_by_duplicate_review: false, created_at: '2030-01-01T00:00:00Z', updated_at: '2030-01-01T01:00:00Z',
  message_count: '1', attachment_count: 2, document_count: '0',
};

function expectDependency(fn: () => unknown) {
  assert.throws(fn, (error) => error instanceof OspApiError && error.code === 'DEPENDENCY_UNAVAILABLE');
}

Deno.test('normalizeCanonicalDecimal preserves canonical strings and accepts safe seam integers', () => {
  assert.equal(normalizeCanonicalDecimal('0'), '0');
  assert.equal(normalizeCanonicalDecimal('900719925474099312345'), '900719925474099312345');
  assert.equal(normalizeCanonicalDecimal(42), '42');
});

for (const value of [
  null,
  undefined,
  '',
  ' ',
  '00',
  '01',
  '-1',
  '1.5',
  true,
  [],
  {},
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
]) {
  Deno.test(`normalizeCanonicalDecimal rejects ${String(value)}`, () => {
    expectDependency(() => normalizeCanonicalDecimal(value));
  });
}

Deno.test('normalizePipelineReadModel emits exactly four canonical decimal strings', () => {
  assert.deepEqual(normalizePipelineReadModel({
    requests_total: 1,
    documents_pending: '2',
    under_review: 3,
    ready_for_approval: '9007199254740993',
  }), {
    requests_total: '1',
    documents_pending: '2',
    under_review: '3',
    ready_for_approval: '9007199254740993',
  });
  expectDependency(() => normalizePipelineReadModel({
    requests_total: '1',
    documents_pending: '2',
    under_review: '3',
    ready_for_approval: '4',
    extra: '5',
  }));
});

Deno.test('normalizeGmailReadModel preserves the exact disconnected discriminant', () => {
  assert.deepEqual(normalizeGmailReadModel({
    connection_exists: false,
    pubsub_configured: null,
    watch_configured: null,
    token_expires_at: null,
    watch_expires_at: null,
    error_present: false,
    error_code: null,
  }), {
    connection_exists: false,
    pubsub_configured: null,
    watch_configured: null,
    token_expires_at: null,
    watch_expires_at: null,
    error_present: false,
    error_code: null,
    outbound_enabled: false,
  });
});

Deno.test('normalizeGmailReadModel normalizes UTC dates and maps unknown upstream codes', () => {
  assert.deepEqual(normalizeGmailReadModel({
    connection_exists: true,
    pubsub_configured: true,
    watch_configured: true,
    token_expires_at: new Date('2030-01-01T01:00:00+01:00'),
    watch_expires_at: '2030-01-02T00:00:00Z',
    error_present: true,
    error_code: 'SYNTHETIC_UPSTREAM_CODE',
  }), {
    connection_exists: true,
    pubsub_configured: true,
    watch_configured: true,
    token_expires_at: '2030-01-01T00:00:00.000Z',
    watch_expires_at: '2030-01-02T00:00:00.000Z',
    error_present: true,
    error_code: 'UNKNOWN',
    outbound_enabled: false,
  });
});

Deno.test('normalizeGmailReadModel rejects Date values outside an exact four-digit RFC3339 UTC year', () => {
  const extendedYear = new Date(0);
  extendedYear.setUTCFullYear(10_000, 0, 1);
  expectDependency(() => normalizeGmailReadModel({
    connection_exists: true,
    pubsub_configured: true,
    watch_configured: true,
    token_expires_at: extendedYear,
    watch_expires_at: null,
    error_present: false,
    error_code: null,
  }));
});

Deno.test('case read models expose bounded metadata, canonical counts and no message body', () => {
  assert.deepEqual(normalizeCaseSummary(caseSummary), {
    ...caseSummary, aggregate_version: 1, attachment_count: '2',
    created_at: '2030-01-01T00:00:00.000Z', updated_at: '2030-01-01T01:00:00.000Z',
  });
  const detail = normalizeCaseDetail({
    ...caseSummary,
    latest_subject: 'Customer setup request', latest_sender_domain: 'supplier.example', latest_received_at: '2030-01-01T00:00:00Z',
    recent_events: [{ sequence: '1', state: 'received', occurred_at: '2030-01-01T00:00:00Z', reason_code: 'case_received' }],
  });
  assert.deepEqual(detail.latest_request, {
    subject: 'Customer setup request', sender_domain: 'supplier.example', received_at: '2030-01-01T00:00:00.000Z',
  });
  assert.equal('safe_body' in detail, false);
  assert.equal(detail.recent_events[0].sequence, 1);
  expectDependency(() => normalizeCaseSummary({ ...caseSummary, supplier_name: ' Synthetic Supplier' }));
  expectDependency(() => normalizeCaseDetail({ ...caseSummary, latest_subject: 'Only subject', latest_sender_domain: null, latest_received_at: null, recent_events: [] }));
});

for (const [name, value] of [
  ['disconnected non-null field', {
    connection_exists: false, pubsub_configured: false, watch_configured: null,
    token_expires_at: null, watch_expires_at: null, error_present: false, error_code: null,
  }],
  ['connected nullable boolean', {
    connection_exists: true, pubsub_configured: null, watch_configured: false,
    token_expires_at: null, watch_expires_at: null, error_present: false, error_code: null,
  }],
  ['disabled watch expiration', {
    connection_exists: true, pubsub_configured: true, watch_configured: false,
    token_expires_at: null, watch_expires_at: '2030-01-01T00:00:00Z', error_present: false, error_code: null,
  }],
  ['error code without error', {
    connection_exists: true, pubsub_configured: true, watch_configured: false,
    token_expires_at: null, watch_expires_at: null, error_present: false, error_code: 'TOKEN_EXPIRED',
  }],
  ['error without code', {
    connection_exists: true, pubsub_configured: true, watch_configured: false,
    token_expires_at: null, watch_expires_at: null, error_present: true, error_code: null,
  }],
  ['malformed date', {
    connection_exists: true, pubsub_configured: true, watch_configured: true,
    token_expires_at: 'not-a-date', watch_expires_at: null, error_present: false, error_code: null,
  }],
  ['additional field', {
    connection_exists: false, pubsub_configured: null, watch_configured: null,
    token_expires_at: null, watch_expires_at: null, error_present: false, error_code: null,
    token: 'must-not-pass',
  }],
] as const) {
  Deno.test(`normalizeGmailReadModel rejects ${name}`, () => {
    expectDependency(() => normalizeGmailReadModel(value));
  });
}

Deno.test('listOnboardingWorkspace and getGmailHealth scope each read to the resolved organization', async () => {
  const seen: string[] = [];
  const store: OspReadStore = {
    async resolveWorkspace() { return organizationId; },
    async readPipeline(id: string) {
      seen.push(id);
      return {
        requests_total: '1', documents_pending: '2', under_review: '3', ready_for_approval: '4',
      };
    },
    async readGmail(id: string) {
      seen.push(id);
      return {
        connection_exists: false, pubsub_configured: null, watch_configured: null,
        token_expires_at: null, watch_expires_at: null, error_present: false, error_code: null,
      };
    },
    async readCases(id: string) { seen.push(id); return [caseSummary]; },
    async readCase(id: string) {
      seen.push(id);
      return { ...caseSummary, latest_subject: null, latest_sender_domain: null, latest_received_at: null, recent_events: [] };
    },
  };
  assert.equal((await listOnboardingWorkspace(store, organizationId)).requests_total, '1');
  assert.equal((await getGmailHealth(store, organizationId)).connection_exists, false);
  assert.equal((await listCustomerRegistrationCases(store, organizationId)).cases.length, 1);
  assert.equal((await getCustomerRegistrationCase(store, organizationId, caseId)).case_id, caseId);
  assert.deepEqual(seen, [organizationId, organizationId, organizationId, organizationId]);
});
