import { describe, expect, it } from 'vitest';

import { OspWorkflowError } from '../api/workflow-client';
import { retainIdempotencyKeyForExplicitRetry } from './router';

describe('workflow command idempotency keys', () => {
  it('retains a key only for an outcome-uncertain network retry', () => {
    expect(retainIdempotencyKeyForExplicitRetry(new OspWorkflowError('NETWORK_UNAVAILABLE'))).toBe(true);
    expect(retainIdempotencyKeyForExplicitRetry(new OspWorkflowError('VERSION_CONFLICT'))).toBe(false);
    expect(retainIdempotencyKeyForExplicitRetry(new OspWorkflowError('INVALID_REQUEST'))).toBe(false);
    expect(retainIdempotencyKeyForExplicitRetry(new Error('unexpected'))).toBe(false);
  });
});
