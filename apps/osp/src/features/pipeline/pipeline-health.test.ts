import { describe, expect, it } from 'vitest';

import { deriveMailboxHealth } from './pipeline-health';

const now = new Date('2026-08-22T19:00:00.000Z');
const connected = {
  connection_exists: true as const,
  pubsub_configured: true,
  watch_configured: true,
  token_expires_at: '2026-08-22T20:00:00.000Z',
  watch_expires_at: '2026-08-22T21:00:00.000Z',
  error_present: false,
  error_code: null,
  outbound_enabled: false as const,
};

describe('deriveMailboxHealth', () => {
  it.each([undefined, null, {}, { ...connected, token_expires_at: 'bad-date' }])('returns unknown for missing or malformed evidence', (value) => {
    expect(deriveMailboxHealth(value, () => now)).toBe('unknown');
  });

  it('returns disconnected only from an exact disconnected model', () => {
    expect(deriveMailboxHealth({ connection_exists: false, pubsub_configured: null, watch_configured: null, token_expires_at: null, watch_expires_at: null, error_present: false, error_code: null, outbound_enabled: false }, () => now)).toBe('disconnected');
  });

  it.each([
    { ...connected, error_present: true, error_code: 'AUTH_REQUIRED' },
    { ...connected, token_expires_at: null },
    { ...connected, token_expires_at: now.toISOString() },
    { ...connected, watch_expires_at: null },
    { ...connected, watch_expires_at: now.toISOString() },
    { ...connected, pubsub_configured: false, watch_configured: true },
  ])('returns degraded for explicit connection defects', (value) => {
    expect(deriveMailboxHealth(value, () => now)).toBe('degraded');
  });

  it('distinguishes manual no-Pub/Sub mode, a valid connection without watch and a future watch', () => {
    expect(deriveMailboxHealth({ ...connected, pubsub_configured: false, watch_configured: false, watch_expires_at: null }, () => now)).toBe('connected');
    expect(deriveMailboxHealth({ ...connected, watch_configured: false, watch_expires_at: null }, () => now)).toBe('connected');
    expect(deriveMailboxHealth(connected, () => now)).toBe('watching');
  });
});
