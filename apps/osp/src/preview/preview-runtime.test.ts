import { describe, expect, it, vi } from 'vitest';

import { createPreviewRuntime } from './preview-runtime';

describe('synthetic preview runtime', () => {
  it('starts authenticated with realistic XBF onboarding data and no network calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const runtime = createPreviewRuntime();
    const session = await runtime.authPort.initialize();

    expect(session?.identity.email).toBe('sales@heymarksman.com');
    await expect(runtime.apiClient.listOnboardingWorkspace()).resolves.toEqual({
      requests_total: '26', documents_pending: '7', under_review: '5', ready_for_approval: '3',
    });
    await expect(runtime.apiClient.listDocumentVersions()).resolves.toHaveLength(3);
    await expect(runtime.apiClient.listClarificationReviews()).resolves.toHaveLength(1);
    await expect(runtime.apiClient.listFormTemplates()).resolves.toMatchObject({ templates: [{ latest: { status: 'published' } }, { latest: { status: 'draft' } }] });
    const cases = await runtime.apiClient.listCustomerRegistrationCases();
    expect(cases).toHaveLength(7);
    await expect(runtime.apiClient.getCustomerRegistrationCase(cases[0].case_id)).resolves.toMatchObject({
      supplier_name: 'Grupo Salzillo',
      state: 'analyzing_requirements',
      message_count: '1',
      request_manifest: {
        sourceCoverage: { xlsm: 1 },
        spreadsheetProtection: { macroEnabledFiles: 1, macroExecution: 'blocked', analysisMode: 'sanitized_copy' },
        externalEffects: false,
      },
      historical_intake: {
        status: 'preview_only',
        candidate_count: 1,
        duplicate_state: 'already_imported',
        checkpoint_unchanged: true,
        source_preserved: true,
        external_effects: false,
      },
    });
    await expect(runtime.apiClient.previewHistoricalGmailSearch?.({
      subjectPhrase: 'SALZILLO', afterDate: '2026-08-09', beforeDate: '2026-08-12',
    })).resolves.toMatchObject({ candidates: [{ duplicate_state: 'already_imported' }], checkpoint_unchanged: true, persisted: false });
    const formCase = cases.find((item) => item.supplier_name === 'Sierra Retail México');
    expect(formCase).toBeDefined();
    await expect(runtime.apiClient.getCaseFormWorkspace(formCase!.case_id)).resolves.toMatchObject({
      supplierName: 'Sierra Retail México', instance: { version: 2, values: { legal_name: 'Sierra Retail México', tax_identifier: 'SRM010101AA1' } }, mappings: expect.arrayContaining([expect.objectContaining({ status: 'unresolved', fields: expect.arrayContaining([expect.objectContaining({ source: 'rateware' })]) })]), capabilities: { saveDraft: true, acceptMapping: true, correctMapping: false, submitForReview: false },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('exposes the governed final-response composer with a locked signed package', async () => {
    const runtime = createPreviewRuntime();
    const cases = await runtime.apiClient.listCustomerRegistrationCases();
    const responseCase = cases.find((item) => item.supplier_name === 'Cumbre Manufacturing');
    expect(responseCase).toBeDefined();
    await expect(runtime.apiClient.getApprovalCommunicationsWorkspace({ caseId: responseCase!.case_id })).resolves.toMatchObject({
      caseState: 'sales_authorization',
      signedPackage: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      replyContext: {
        to: ['requester@example.test'],
        subject: 'Re: Supplier registration request | synthetic preview',
        inReplyTo: '<osp-preview-request@example.test>',
      },
      outbound: null,
      capabilities: { saveOutboundDraft: true, requestAuthorizedSend: false },
    });
  });

  it('creates and freezes a synthetic final response while preserving its captured reply thread', async () => {
    const runtime = createPreviewRuntime();
    const cases = await runtime.apiClient.listCustomerRegistrationCases();
    const responseCase = cases.find((item) => item.supplier_name === 'Cumbre Manufacturing')!;
    const workspace = await runtime.apiClient.getApprovalCommunicationsWorkspace({ caseId: responseCase.case_id });
    const context = workspace.replyContext!;
    const payloadId = '77777777-7777-4777-8777-777777777777';
    await runtime.apiClient.saveOutboundDraft({
      caseId: responseCase.case_id,
      expectedVersion: workspace.caseVersion,
      inputSnapshotSha256: workspace.inputSnapshot!.sha256,
      signedPackage: workspace.signedPackage!,
      payloadId,
      to: context.to,
      cc: context.cc,
      subject: context.subject,
      bodyText: 'Synthetic reviewed response.',
      inReplyTo: context.inReplyTo,
      references: context.references,
    });
    const draft = await runtime.apiClient.getApprovalCommunicationsWorkspace({ caseId: responseCase.case_id });
    expect(draft).toMatchObject({
      outbound: { payloadId, status: 'draft', inReplyTo: context.inReplyTo, attachmentSha256: [workspace.signedPackage!.outputSha256] },
      capabilities: { saveOutboundDraft: true, freezeOutboundPayload: true, requestAuthorizedSend: false },
    });
    const correctedPayloadId = '88888888-8888-4888-8888-888888888888';
    await runtime.apiClient.saveOutboundDraft({
      caseId: responseCase.case_id,
      expectedVersion: draft.caseVersion,
      inputSnapshotSha256: workspace.inputSnapshot!.sha256,
      signedPackage: workspace.signedPackage!,
      payloadId: correctedPayloadId,
      to: context.to,
      cc: context.cc,
      subject: context.subject,
      bodyText: 'Synthetic corrected response.',
      inReplyTo: context.inReplyTo,
      references: context.references,
    });
    await expect(runtime.apiClient.getApprovalCommunicationsWorkspace({ caseId: responseCase.case_id, payloadId })).resolves.toMatchObject({
      outbound: { payloadId, bodyText: 'Synthetic reviewed response.' },
      capabilities: { saveOutboundDraft: false, freezeOutboundPayload: false },
    });
    await expect(runtime.apiClient.freezeOutboundPayload({
      caseId: responseCase.case_id,
      payloadId,
      expectedVersion: draft.caseVersion,
      idempotencyKey: 'preview-freeze-final-response',
    })).rejects.toThrow('VERSION_CONFLICT');
    await runtime.apiClient.freezeOutboundPayload({
      caseId: responseCase.case_id,
      payloadId: correctedPayloadId,
      expectedVersion: draft.caseVersion,
      idempotencyKey: 'preview-freeze-corrected-response',
    });
    await expect(runtime.apiClient.getApprovalCommunicationsWorkspace({ caseId: responseCase.case_id })).resolves.toMatchObject({
      outbound: { payloadId: correctedPayloadId, status: 'frozen', mimeSha256: 'a'.repeat(64) },
      capabilities: { saveOutboundDraft: false, freezeOutboundPayload: false },
    });
  });

  it('keeps preview sign-out and sign-in entirely in memory', async () => {
    const runtime = createPreviewRuntime();
    await runtime.authPort.logout();
    expect(runtime.authPort.getCurrentSession()).toBeNull();
    await runtime.authPort.login('/app/pipeline');
    expect(runtime.authPort.getCurrentSession()?.identity.organization).toBe('xbf-preview-organization');
  });

  it('keeps a decided documentary candidate visible until the review is finalized', async () => {
    const runtime = createPreviewRuntime();
    const profile = await runtime.apiClient.getCorporateProfile();
    const field = profile.entities[0].fields.find((item) => item.code === 'tax_regime')!;
    const candidate = field.review_candidates[0];
    const claimed = await runtime.apiClient.claimProfileReview({ reviewId: candidate.review_id, expectedRevision: candidate.review_revision });
    const decided = await runtime.apiClient.decideProfileReviewField({
      reviewId: candidate.review_id,
      fieldId: candidate.review_field_id,
      expectedRevision: claimed.revision,
      decision: 'accepted',
      decisionNote: 'Synthetic evidence matches the proposed tax regime.',
      reviewerValue: null,
    });
    const afterDecision = await runtime.apiClient.getCorporateProfile();
    expect(afterDecision.entities[0].fields.find((item) => item.code === 'tax_regime')?.review_candidates[0]).toMatchObject({
      ownership: 'owned', field_status: 'accepted', pending_field_count: '0', review_revision: decided.revision,
    });

    await expect(runtime.apiClient.finalizeProfileReview({
      reviewId: candidate.review_id,
      expectedRevision: decided.revision,
      decision: 'approved',
      decisionNote: 'All synthetic evidence was reviewed.',
    })).resolves.toMatchObject({ reviewStatus: 'approved', verificationStatus: 'verified' });
    const finalized = await runtime.apiClient.getCorporateProfile();
    expect(finalized.entities[0].fields.find((item) => item.code === 'tax_regime')?.review_candidates).toEqual([]);
  });

  it('advances a completed form from Operations review to the signature gate in memory', async () => {
    const runtime = createPreviewRuntime();
    const cases = await runtime.apiClient.listCustomerRegistrationCases();
    const formCase = cases.find((item) => item.supplier_name === 'Sierra Retail México')!;
    const form = await runtime.apiClient.getCaseFormWorkspace(formCase.case_id);
    const values = form.instance!.values;
    await runtime.apiClient.acceptCaseFormMapping({
      caseId: form.caseId,
      mappingId: form.mappings[0].id,
      expectedMappingVersion: form.mappings[0].version,
      expectedAfterSha256: form.mappings[0].afterSha256,
      idempotencyKey: 'preview-accept-mapping',
    });

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
    expect(review).toMatchObject({
      caseState: 'operations_review',
      supplierPackage: { version: 1, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      capabilities: { completeOperationsReview: true },
    });

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
