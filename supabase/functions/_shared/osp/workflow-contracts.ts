export const CASE_STATES = [
  'received', 'analyzing_requirements', 'awaiting_clarification',
  'awaiting_xbf_information', 'preparing', 'operations_review',
  'signature_approval', 'sales_authorization', 'ready_to_send',
  'sent', 'accepted', 'rejected', 'closed',
] as const;

export type CaseState = typeof CASE_STATES[number];

export type OspWriteCommand<A extends string, I> = {
  version: 1;
  action: A;
  idempotency_key: string;
  expected_version: number;
  input: I;
};

export type CaseEvent = {
  id: string;
  organizationId: string;
  caseId: string;
  sequence: number;
  state: CaseState;
  actorSubject: string;
  authorityRole: 'requester' | 'operations' | 'system';
  sourceVersion: number;
  occurredAt: string;
  reasonCode: string;
  correlationId: string;
};

export const CASE_REASON_CODES = [
  'case_received',
  'requirements_analysis_started',
  'clarification_requested',
  'xbf_information_requested',
  'preparation_started',
  'operations_review_requested',
  'operations_rework_requested',
  'operations_review_completed',
  'signature_approved',
  'signature_applied',
  'approval_invalidated',
  'sales_authorized',
  'authorized_send_requested',
] as const;

const sprintOneTransitions: Readonly<Record<CaseState, readonly CaseState[]>> = {
  received: ['analyzing_requirements'],
  analyzing_requirements: ['awaiting_clarification', 'awaiting_xbf_information', 'preparing'],
  awaiting_clarification: ['analyzing_requirements'],
  awaiting_xbf_information: ['preparing'],
  preparing: ['operations_review'],
  operations_review: ['preparing', 'signature_approval'],
  signature_approval: ['operations_review', 'sales_authorization'],
  sales_authorization: ['operations_review', 'ready_to_send'],
  ready_to_send: ['operations_review', 'sales_authorization', 'sent'],
  sent: [],
  accepted: [],
  rejected: [],
  closed: [],
};

function fail(code: 'INVALID_REASON_CODE' | 'VERSION_CONFLICT'): never {
  throw new Error(code);
}

export function allowedCaseTransition(from: CaseState, to: CaseState): boolean {
  return sprintOneTransitions[from].includes(to);
}

export function assertExpectedVersion(currentVersion: number, expectedVersion: number): void {
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 0 ||
      !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || currentVersion !== expectedVersion) {
    fail('VERSION_CONFLICT');
  }
}

export function assertKnownReasonCode(reasonCode: string): void {
  if (!CASE_REASON_CODES.includes(reasonCode as typeof CASE_REASON_CODES[number])) fail('INVALID_REASON_CODE');
}
