import { describe, expect, it, vi } from 'vitest';

import type { BoundSession } from '../auth/auth-port';
import { createWorkflowClient } from './workflow-client';

const caseId = '33333333-3333-4333-8333-333333333333';
const payloadId = '44444444-4444-4444-8444-444444444444';
const sha = 'a'.repeat(64);
const session: BoundSession = {
  generation: 'generation-a',
  identity: {
    issuer: 'https://auth.example.test',
    authorizedParty: 'osp-client',
    subject: 'subject-a',
    organization: 'organization-a',
    email: 'operator@example.test',
    emailVerified: true,
  },
};

const workspace = {
  caseId,
  caseVersion: 7,
  caseState: 'sales_authorization' as const,
  inputSnapshot: {
    sha256: sha,
    documentCount: 4,
    extractionCount: 18,
    reviewDecisionCount: 3,
    formInstanceVersion: 2,
  },
  supplierPackage: null,
  signedPackage: {
    packageId: '66666666-6666-4666-8666-666666666666',
    outputSha256: 'c'.repeat(64),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const,
  },
  replyContext: {
    to: ['requester@xbfreight.com'],
    cc: ['supplier@example.test', 'sales@heymarksman.com'],
    subject: 'Re: Supplier registration request',
    inReplyTo: '<supplier-request@example.test>',
    references: ['<supplier-request@example.test>'],
  },
  signature: {
    positionVersion: 3,
    approvalStatus: 'approved' as const,
    approvalId: '55555555-5555-4555-8555-555555555555',
    outputSha256: 'b'.repeat(64),
  },
  outbound: {
    payloadId,
    kind: 'final_response' as const,
    status: 'frozen' as const,
    caseVersion: 7,
    from: 'carriers@xbfreight.com' as const,
    to: ['supplier@example.test'],
    cc: ['sales@heymarksman.com'],
    subject: 'Supplier registration response',
    inReplyTo: '<source@example.test>',
    references: ['<source@example.test>'],
    bodyText: 'The reviewed supplier package is ready.',
    attachments: [{ name: 'Formato 3.3 Alta Cliente.pdf', contentType: 'application/pdf' as const, sha256: 'c'.repeat(64) }],
    attachmentSha256: ['c'.repeat(64)],
    mimeSha256: 'd'.repeat(64),
    salesAuthorizationId: null,
    sendOutcome: null,
  },
  capabilities: {
    completeOperationsReview: false,
    approveAndApplySignature: false,
    saveOutboundDraft: false,
    freezeOutboundPayload: false,
    authorizeOutboundPayload: true,
    requestAuthorizedSend: false,
  },
};

function client(fetch: typeof globalThis.fetch) {
  return createWorkflowClient({
    supabaseUrl: 'https://project.example.test',
    getCurrentSession: () => session,
    getAccessToken: vi.fn(async (_session, forceRefresh) => {
      expect(forceRefresh).toBe(false);
      return 'synthetic-token';
    }),
    getApprovalIdToken: vi.fn(async () => 'synthetic-id-token'),
    fetch,
  });
}

describe('WorkflowClient', () => {
  it('loads a strict server-authorized workspace without private locators', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/functions/v1/osp-case-api');
      expect([...url.searchParams.entries()]).toEqual([
        ['action', 'get_approval_communications_workspace'],
        ['case_id', caseId],
        ['payload_id', payloadId],
      ]);
      expect(init).toMatchObject({ method: 'POST', redirect: 'error', headers: { authorization: 'Bearer synthetic-token' } });
      return new Response(JSON.stringify({ data: workspace }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const result = await client(fetch).getApprovalCommunicationsWorkspace({ caseId, payloadId });
    expect(result).toEqual(workspace);
    expect(JSON.stringify(result)).not.toMatch(/vault|mimeObject|signatureBytes|rawMime|accessToken/i);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('loads the previous read-only API shape with new write capability disabled', async () => {
    const legacyWorkspace = structuredClone(workspace) as unknown as Record<string, unknown>;
    delete legacyWorkspace.signedPackage;
    delete legacyWorkspace.replyContext;
    const legacyCapabilities = legacyWorkspace.capabilities as Record<string, unknown>;
    delete legacyCapabilities.saveOutboundDraft;
    const legacyOutbound = legacyWorkspace.outbound as Record<string, unknown>;
    delete legacyOutbound.inReplyTo;
    delete legacyOutbound.references;
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      data: legacyWorkspace,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const result = await client(fetch).getApprovalCommunicationsWorkspace({ caseId });
    expect(result.signedPackage).toBeNull();
    expect(result.replyContext).toBeNull();
    expect(result.outbound?.inReplyTo).toBeNull();
    expect(result.outbound?.references).toEqual([]);
    expect(result.capabilities.saveOutboundDraft).toBe(false);
  });

  it('sends each mutation exactly once and never refreshes or retries automatically', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toEqual({
        authorization: 'Bearer synthetic-token',
        'x-osp-approval-proof': 'synthetic-id-token',
      });
      throw new TypeError('offline');
    });
    await expect(client(fetch).completeOperationsReview({
      caseId,
      expectedVersion: 7,
      idempotencyKey: 'operations-1',
      inputSnapshotSha256: sha,
    })).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('fails closed before fetch when the bound approval proof is unavailable', async () => {
    const fetch = vi.fn();
    const workflow = createWorkflowClient({
      supabaseUrl: 'https://project.example.test',
      getCurrentSession: () => session,
      getAccessToken: vi.fn(async () => 'synthetic-token'),
      getApprovalIdToken: vi.fn(async () => { throw new Error('missing ID token'); }),
      fetch,
    });
    await expect(workflow.completeOperationsReview({
      caseId,
      expectedVersion: 7,
      idempotencyKey: 'operations-no-proof',
      inputSnapshotSha256: sha,
    })).rejects.toMatchObject({ code: 'NO_SESSION' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('maps the exact safe 409 response to VERSION_CONFLICT without replay', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'VERSION_CONFLICT', incident_id: 'incident-conflict' },
    }), { status: 409, headers: { 'content-type': 'application/json' } }));
    await expect(client(fetch).authorizeOutboundPayload({
      caseId,
      payloadId,
      payloadSha256: 'd'.repeat(64),
      attachmentSha256: ['c'.repeat(64)],
      expectedVersion: 7,
      idempotencyKey: 'sales-1',
    })).rejects.toEqual(expect.objectContaining({
      code: 'VERSION_CONFLICT',
      incidentId: 'incident-conflict',
    }));
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('saves one internal final-response draft with the exact signed XLSX and no send action', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect([...url.searchParams.entries()]).toEqual([
        ['action', 'save_outbound_draft'], ['case_id', caseId], ['expected_case_version', '7'],
        ['source_snapshot_sha256', sha], ['signed_package_sha256', 'c'.repeat(64)],
      ]);
      expect(init).toMatchObject({ method: 'POST', redirect: 'error', headers: {
        authorization: 'Bearer synthetic-token', 'content-type': 'application/json',
      } });
      expect(JSON.parse(String(init?.body))).toEqual({
        attachments: [{
          bucketId: 'osp-derived-documents',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          name: 'XBF-signed-supplier-package.xlsx',
          objectId: '66666666-6666-4666-8666-666666666666', sha256: 'c'.repeat(64),
        }],
        bodyText: 'Completed package attached.',
        cc: [{ email: 'sales@example.test', source: 'reviewed_manual' }],
        from: 'carriers@xbfreight.com', inReplyTo: '<source@example.test>', kind: 'final_response', payloadId,
        references: ['<source@example.test>'], subject: 'Completed supplier registration package',
        to: [{ email: 'supplier@example.test', source: 'reviewed_manual' }],
      });
      expect(String(input)).not.toContain('request_authorized_send');
      return new Response(JSON.stringify({ data: { payloadId, caseVersion: 7, kind: 'final_response' } }), {
        status: 201, headers: { 'content-type': 'application/json' },
      });
    });
    await expect(client(fetch).saveOutboundDraft({
      caseId, expectedVersion: 7, payloadId, inputSnapshotSha256: sha,
      signedPackage: workspace.signedPackage,
      to: ['supplier@example.test'], cc: ['sales@example.test'],
      subject: 'Completed supplier registration package', bodyText: 'Completed package attached.',
      inReplyTo: '<source@example.test>', references: ['<source@example.test>'],
    })).resolves.toEqual({ payloadId, caseVersion: 7, kind: 'final_response' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('encodes a body-only outbound authorization with the canonical no-attachments sentinel', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      expect(new URL(String(input)).searchParams.get('attachment_sha256s')).toBe('none');
      return new Response(JSON.stringify({ data: {
        caseId, state: 'ready_to_send', caseVersion: 8, replayed: false,
        authorizationId: '55555555-5555-4555-8555-555555555555',
      } }), { status: 202, headers: { 'content-type': 'application/json' } });
    });
    await client(fetch).authorizeOutboundPayload({
      caseId, payloadId, payloadSha256: 'd'.repeat(64), attachmentSha256: [],
      expectedVersion: 7, idempotencyKey: 'sales-body-only',
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(['reserved', 'sending', 'sent', 'failed', 'manual_reconciliation_required'] as const)(
    'accepts the exact stored send replay outcome %s',
    async (outcome) => {
      const fetch = vi.fn(async () => new Response(JSON.stringify({ data: {
        attemptId: '66666666-6666-4666-8666-666666666666',
        jobId: '77777777-7777-4777-8777-777777777777',
        outcome,
        replayed: true,
      } }), { status: 202, headers: { 'content-type': 'application/json' } }));
      await expect(client(fetch).requestAuthorizedSend({
        caseId,
        expectedVersion: 8,
        idempotencyKey: `send-replay-${outcome}`,
        salesAuthorizationId: '55555555-5555-4555-8555-555555555555',
        payloadSha256: 'd'.repeat(64),
      })).resolves.toMatchObject({ outcome, replayed: true });
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it('rejects a capability response carrying a private or extra field', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      data: { ...workspace, vaultRef: 'secret-vault-reference' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(client(fetch).getApprovalCommunicationsWorkspace({ caseId, payloadId }))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
