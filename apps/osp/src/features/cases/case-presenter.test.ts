import { describe, expect, it } from 'vitest';

import { casePrimaryAction } from './case-presenter';

describe('case primary action', () => {
  it.each([
    ['awaiting_clarification', 'clarification', 'Open clarification review'],
    ['preparing', 'form', 'Open XBF case form'],
    ['operations_review', 'operations_review', 'Open Operations review'],
    ['signature_approval', 'signature', 'Open signature approval'],
    ['sales_authorization', 'sales_authorization', 'Open Sales authorization'],
  ] as const)('routes %s to its controlled workspace', (state, kind, label) => {
    expect(casePrimaryAction(state)).toEqual({ kind, label });
  });

  it.each([
    'received', 'analyzing_requirements', 'awaiting_xbf_information', 'ready_to_send',
    'sent', 'manual_reconciliation_required', 'accepted', 'rejected', 'closed',
  ] as const)('does not invent an action for %s', (state) => {
    expect(casePrimaryAction(state)).toBeNull();
  });
});
