import type { CaseState } from '../../api/contracts';

export const caseStateLabels: Readonly<Record<CaseState, string>> = Object.freeze({
  received: 'Received',
  analyzing_requirements: 'Analyzing requirements',
  awaiting_clarification: 'Awaiting clarification',
  awaiting_xbf_information: 'Awaiting XBF information',
  preparing: 'Preparing package',
  operations_review: 'Operations review',
  signature_approval: 'Signature approval',
  sales_authorization: 'Sales authorization',
  ready_to_send: 'Ready to send',
  sent: 'Sent',
  manual_reconciliation_required: 'Manual reconciliation',
  accepted: 'Accepted',
  rejected: 'Rejected',
  closed: 'Closed',
});

export const caseNextGates: Readonly<Record<CaseState, string>> = Object.freeze({
  received: 'Analyze the request and identify required documents.',
  analyzing_requirements: 'Complete requirements analysis.',
  awaiting_clarification: 'Wait for the provider clarification.',
  awaiting_xbf_information: 'Collect the missing XBF information.',
  preparing: 'Finish the exact onboarding package.',
  operations_review: 'Complete Operations evidence review.',
  signature_approval: 'Obtain JAGP approval and signature.',
  sales_authorization: 'Obtain Sales authorization for the exact reply.',
  ready_to_send: 'Delivery remains gated while outbound is disabled.',
  sent: 'Wait for provider confirmation.',
  manual_reconciliation_required: 'Reconcile provider and local delivery evidence.',
  accepted: 'Provider accepted the onboarding package.',
  rejected: 'Review the rejection evidence before reopening.',
  closed: 'No further action is currently required.',
});

export function caseStateTone(state: CaseState): 'new' | 'work' | 'gate' | 'done' | 'blocked' {
  if (state === 'received') return 'new';
  if (['analyzing_requirements', 'awaiting_clarification', 'awaiting_xbf_information', 'preparing', 'operations_review'].includes(state)) return 'work';
  if (['signature_approval', 'sales_authorization', 'ready_to_send'].includes(state)) return 'gate';
  if (state === 'manual_reconciliation_required' || state === 'rejected') return 'blocked';
  return 'done';
}

export function formatCaseDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(value));
}
