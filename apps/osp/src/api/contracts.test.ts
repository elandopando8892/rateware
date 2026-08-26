import { describe, expect, it } from 'vitest';

import {
  CanonicalCountSchema,
  GmailReadModelSchema,
  OspErrorResponseSchema,
  OspReadRequestSchema,
  PipelineSuccessResponseSchema,
} from './contracts';

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
