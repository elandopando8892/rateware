import { describe, expect, it, vi } from 'vitest';

import { createPreviewRuntime } from './preview-runtime';

describe('synthetic preview runtime', () => {
  it('starts authenticated with realistic XBF onboarding data and no network calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const runtime = createPreviewRuntime();
    const session = await runtime.authPort.initialize();

    expect(session?.identity.email).toBe('preview.operations@xbfreight.com');
    await expect(runtime.apiClient.listOnboardingWorkspace()).resolves.toEqual({
      requests_total: '26', documents_pending: '7', under_review: '5', ready_for_approval: '3',
    });
    await expect(runtime.apiClient.listDocumentVersions()).resolves.toHaveLength(3);
    await expect(runtime.apiClient.listClarificationReviews()).resolves.toHaveLength(1);
    await expect(runtime.apiClient.listFormTemplates()).resolves.toMatchObject({ templates: [{ latest: { status: 'published' } }, { latest: { status: 'draft' } }] });
    const cases = await runtime.apiClient.listCustomerRegistrationCases();
    expect(cases).toHaveLength(5);
    await expect(runtime.apiClient.getCustomerRegistrationCase(cases[0].case_id)).resolves.toMatchObject({
      supplier_name: 'Northstar Components', state: 'ready_to_send', message_count: '4',
    });
    const formCase = cases.find((item) => item.supplier_name === 'Sierra Retail México');
    expect(formCase).toBeDefined();
    await expect(runtime.apiClient.getCaseFormWorkspace(formCase!.case_id)).resolves.toMatchObject({
      supplierName: 'Sierra Retail México', instance: { version: 2, values: { legal_name: 'Sierra Retail México' } }, capabilities: { saveDraft: true },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('keeps preview sign-out and sign-in entirely in memory', async () => {
    const runtime = createPreviewRuntime();
    await runtime.authPort.logout();
    expect(runtime.authPort.getCurrentSession()).toBeNull();
    await runtime.authPort.login('/app/pipeline');
    expect(runtime.authPort.getCurrentSession()?.identity.organization).toBe('xbf-preview-organization');
  });

  it('advances a completed form from Operations review to the signature gate in memory', async () => {
    const runtime = createPreviewRuntime();
    const cases = await runtime.apiClient.listCustomerRegistrationCases();
    const formCase = cases.find((item) => item.supplier_name === 'Sierra Retail México')!;
    const form = await runtime.apiClient.getCaseFormWorkspace(formCase.case_id);
    const values = { ...form.instance!.values, tax_identifier: 'XAXX010101000' };

    const submitted = await runtime.apiClient.submitCaseFormForReview({
      caseId: form.caseId,
      expectedCaseVersion: form.caseVersion,
      idempotencyKey: 'preview-submit-review',
      templateVersionId: form.template!.id,
      instanceId: form.instance!.id,
      expectedVersion: form.instance!.version,
      values,
    });
    const review = await runtime.apiClient.getApprovalCommunicationsWorkspace({ caseId: form.caseId });
    expect(review).toMatchObject({ caseState: 'operations_review', capabilities: { completeOperationsReview: true } });

    await runtime.apiClient.completeOperationsReview({
      caseId: form.caseId,
      expectedVersion: submitted.caseVersion,
      idempotencyKey: 'preview-complete-operations',
      inputSnapshotSha256: submitted.snapshotSha256,
    });

    await expect(runtime.apiClient.getApprovalCommunicationsWorkspace({ caseId: form.caseId })).resolves.toMatchObject({
      caseState: 'signature_approval',
      caseVersion: submitted.caseVersion + 1,
      signature: { positionVersion: 1, approvalStatus: 'pending' },
      capabilities: { completeOperationsReview: false, approveAndApplySignature: true },
    });
    await expect(runtime.apiClient.listCustomerRegistrationCases()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ case_id: form.caseId, state: 'signature_approval', aggregate_version: submitted.caseVersion + 1 }),
    ]));
  });
});
