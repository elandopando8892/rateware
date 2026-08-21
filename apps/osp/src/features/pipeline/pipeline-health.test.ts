import { describe, expect, test } from 'vitest';
import { deriveMailboxHealth } from './pipeline-health';

describe('deriveMailboxHealth', () => {
  test.each([
    { connections: [{ status: 'watching' }], expected: 'watching' },
    {
      connections: [{ status: 'connected' }, { status: 'watching' }],
      expected: 'watching',
    },
    { connections: [{ status: 'connected' }], expected: 'idle' },
    { connections: [], expected: 'disconnected' },
    { connections: [{ status: 'unexpected' }], expected: 'disconnected' },
    { connections: undefined, expected: 'unknown' },
  ] as const)('maps $connections to $expected without assuming a healthy mailbox', ({
    connections,
    expected,
  }) => {
    // Catches defaulting missing, empty, or unrecognized provider state to healthy.
    expect(deriveMailboxHealth(connections)).toBe(expected);
  });
});
