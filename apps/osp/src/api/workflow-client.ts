import type { ZodType } from 'zod';

import type { AuthPort, BoundSession } from '../auth/auth-port';
import {
  ApprovalCommandReceiptSchema,
  ApprovalCommunicationsWorkspaceResponseSchema,
  FreezeCommandReceiptSchema,
  SendCommandReceiptSchema,
  type ApprovalCommunicationsWorkspace,
} from './contracts';

type WorkflowAuth = Pick<AuthPort, 'getCurrentSession' | 'getAccessToken'> & {
  getApprovalIdToken(expected: BoundSession): Promise<string>;
};
type CommandBase = { caseId: string; expectedVersion: number; idempotencyKey: string };
export type ApprovalCommandReceipt = typeof ApprovalCommandReceiptSchema._output['data'];
export type FreezeCommandReceipt = typeof FreezeCommandReceiptSchema._output['data'];
export type SendCommandReceipt = typeof SendCommandReceiptSchema._output['data'];

export type WorkflowClient = {
  getApprovalCommunicationsWorkspace(input: { caseId: string; payloadId?: string }): Promise<ApprovalCommunicationsWorkspace>;
  completeOperationsReview(input: CommandBase & { inputSnapshotSha256: string }): Promise<ApprovalCommandReceipt>;
  approveAndApplySignature(input: CommandBase & { inputSnapshotSha256: string; signaturePositionVersion: number }): Promise<ApprovalCommandReceipt>;
  freezeOutboundPayload(input: CommandBase & { payloadId: string }): Promise<FreezeCommandReceipt>;
  authorizeOutboundPayload(input: CommandBase & { payloadId: string; payloadSha256: string; attachmentSha256: readonly string[] }): Promise<ApprovalCommandReceipt>;
  requestAuthorizedSend(input: CommandBase & { salesAuthorizationId: string; payloadSha256: string }): Promise<SendCommandReceipt>;
};

export type OspWorkflowErrorCode = 'NO_SESSION' | 'NETWORK_UNAVAILABLE' | 'INVALID_RESPONSE' | 'STALE_SESSION' | 'INVALID_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'VERSION_CONFLICT' | 'DEPENDENCY_UNAVAILABLE' | 'INTERNAL_ERROR';

export class OspWorkflowError extends Error {
  constructor(readonly code: OspWorkflowErrorCode, readonly incidentId?: string) {
    super(code);
    this.name = 'OspWorkflowError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const KEY = /^[A-Za-z0-9:_-]{1,256}$/;
const ERROR_STATUS: Readonly<Record<string, number>> = Object.freeze({
  INVALID_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, VERSION_CONFLICT: 409,
  DEPENDENCY_UNAVAILABLE: 503, INTERNAL_ERROR: 500,
});

function assertSession(auth: WorkflowAuth, captured: BoundSession): void {
  const current = auth.getCurrentSession();
  if (!current || current.generation !== captured.generation ||
      current.identity.issuer !== captured.identity.issuer ||
      current.identity.authorizedParty !== captured.identity.authorizedParty ||
      current.identity.subject !== captured.identity.subject ||
      current.identity.organization !== captured.identity.organization ||
      current.identity.email !== captured.identity.email ||
      current.identity.emailVerified !== captured.identity.emailVerified) {
    throw new OspWorkflowError('STALE_SESSION');
  }
}

function validateBase(input: CommandBase): void {
  if (!UUID.test(input.caseId) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || input.expectedVersion > 2_147_483_647 || !KEY.test(input.idempotencyKey)) {
    throw new OspWorkflowError('INVALID_REQUEST');
  }
}

async function json(response: Response): Promise<unknown> {
  if (response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw new OspWorkflowError('INVALID_RESPONSE');
  try { return await response.json(); } catch { throw new OspWorkflowError('INVALID_RESPONSE'); }
}

export function createWorkflowClient(options: WorkflowAuth & { supabaseUrl: string; fetch?: typeof globalThis.fetch }): WorkflowClient {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const endpoint = `${options.supabaseUrl.replace(/\/+$/, '')}/functions/v1/osp-case-api`;

  async function request<T>(query: readonly (readonly [string, string])[], status: number, schema: ZodType<T>, approval = false): Promise<T> {
    const captured = options.getCurrentSession();
    if (!captured) throw new OspWorkflowError('NO_SESSION');
    let token: string;
    try { token = await options.getAccessToken(captured, false); } catch { throw new OspWorkflowError('NO_SESSION'); }
    let approvalProof: string | undefined;
    if (approval) {
      try { approvalProof = await options.getApprovalIdToken(captured); } catch { throw new OspWorkflowError('NO_SESSION'); }
    }
    assertSession(options, captured);
    const url = new URL(endpoint);
    for (const [key, value] of query) url.searchParams.append(key, value);
    let response: Response;
    try {
      response = await fetchImplementation(url.toString(), {
        method: 'POST',
        redirect: 'error',
        headers: {
          authorization: `Bearer ${token}`,
          ...(approvalProof ? { 'x-osp-approval-proof': approvalProof } : {}),
        },
      });
    } catch {
      assertSession(options, captured);
      throw new OspWorkflowError('NETWORK_UNAVAILABLE');
    }
    assertSession(options, captured);
    const body = await json(response);
    assertSession(options, captured);
    if (!response.ok) {
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new OspWorkflowError('INVALID_RESPONSE');
      const root = body as Record<string, unknown>;
      const error = root.error;
      if (Object.keys(root).join(',') !== 'error' || !error || typeof error !== 'object' || Array.isArray(error)) throw new OspWorkflowError('INVALID_RESPONSE');
      const row = error as Record<string, unknown>;
      if (Object.keys(row).sort().join(',') !== 'code,incident_id' || typeof row.code !== 'string' || typeof row.incident_id !== 'string' || ERROR_STATUS[row.code] !== response.status) throw new OspWorkflowError('INVALID_RESPONSE');
      throw new OspWorkflowError(row.code as OspWorkflowErrorCode, row.incident_id);
    }
    if (response.status !== status) throw new OspWorkflowError('INVALID_RESPONSE');
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new OspWorkflowError('INVALID_RESPONSE');
    return parsed.data;
  }

  return Object.freeze({
    getApprovalCommunicationsWorkspace: async ({ caseId, payloadId }) => {
      if (!UUID.test(caseId) || (payloadId !== undefined && !UUID.test(payloadId))) throw new OspWorkflowError('INVALID_REQUEST');
      const response = await request([
        ['action', 'get_approval_communications_workspace'], ['case_id', caseId], ['payload_id', payloadId ?? 'none'],
      ], 200, ApprovalCommunicationsWorkspaceResponseSchema);
      return response.data;
    },
    completeOperationsReview: async (input) => {
      validateBase(input);
      if (!SHA.test(input.inputSnapshotSha256)) throw new OspWorkflowError('INVALID_REQUEST');
      return (await request([
        ['action', 'complete_operations_review'], ['case_id', input.caseId], ['expected_case_version', String(input.expectedVersion)],
        ['input_snapshot_sha256', input.inputSnapshotSha256], ['idempotency_key', input.idempotencyKey],
      ], 200, ApprovalCommandReceiptSchema, true)).data;
    },
    approveAndApplySignature: async (input) => {
      validateBase(input);
      if (!SHA.test(input.inputSnapshotSha256) || !Number.isSafeInteger(input.signaturePositionVersion) || input.signaturePositionVersion < 1) throw new OspWorkflowError('INVALID_REQUEST');
      return (await request([
        ['action', 'approve_and_apply_signature'], ['case_id', input.caseId], ['expected_case_version', String(input.expectedVersion)],
        ['input_snapshot_sha256', input.inputSnapshotSha256], ['signature_position_version', String(input.signaturePositionVersion)], ['idempotency_key', input.idempotencyKey],
      ], 202, ApprovalCommandReceiptSchema, true)).data;
    },
    freezeOutboundPayload: async (input) => {
      validateBase(input);
      if (!UUID.test(input.payloadId)) throw new OspWorkflowError('INVALID_REQUEST');
      return (await request([
        ['action', 'freeze_outbound_payload'], ['case_id', input.caseId], ['payload_id', input.payloadId],
        ['expected_case_version', String(input.expectedVersion)], ['idempotency_key', input.idempotencyKey],
      ], 201, FreezeCommandReceiptSchema)).data;
    },
    authorizeOutboundPayload: async (input) => {
      validateBase(input);
      if (!UUID.test(input.payloadId) || !SHA.test(input.payloadSha256) || !Array.isArray(input.attachmentSha256) || input.attachmentSha256.some((hash) => !SHA.test(hash))) throw new OspWorkflowError('INVALID_REQUEST');
      return (await request([
        ['action', 'authorize_outbound_payload'], ['attachment_sha256s', input.attachmentSha256.length === 0 ? 'none' : input.attachmentSha256.join(',')], ['case_id', input.caseId],
        ['expected_case_version', String(input.expectedVersion)], ['idempotency_key', input.idempotencyKey], ['payload_id', input.payloadId], ['payload_sha256', input.payloadSha256],
      ], 202, ApprovalCommandReceiptSchema, true)).data;
    },
    requestAuthorizedSend: async (input) => {
      validateBase(input);
      if (!UUID.test(input.salesAuthorizationId) || !SHA.test(input.payloadSha256)) throw new OspWorkflowError('INVALID_REQUEST');
      return (await request([
        ['action', 'request_authorized_send'], ['case_id', input.caseId], ['expected_case_version', String(input.expectedVersion)],
        ['idempotency_key', input.idempotencyKey], ['payload_sha256', input.payloadSha256], ['sales_authorization_id', input.salesAuthorizationId],
      ], 202, SendCommandReceiptSchema, true)).data;
    },
  });
}
