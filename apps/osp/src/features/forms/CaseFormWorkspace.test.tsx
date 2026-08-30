import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OspClient } from '../../api/osp-client';
import { createAppRouter } from '../../app/router';

const caseId = '11111111-1111-4111-8111-111111111115';
class ResizeObserverStub { observe() { return undefined; } unobserve() { return undefined; } disconnect() { return undefined; } }
globalThis.ResizeObserver = ResizeObserverStub;
window.scrollTo = vi.fn();
afterEach(cleanup);
const workspace = {
  caseId, supplierName: 'Sierra Retail México', caseVersion: 4, caseState: 'preparing' as const, templateName: 'XBF customer setup — Core',
  template: { id: '72111111-1111-4111-8111-111111111111', templateId: '71111111-1111-4111-8111-111111111111', version: 3, status: 'published' as const, schemaSha256: 'c'.repeat(64), fields: [
    { id: 'legal_name', label: 'Legal name', required: true, canonicalFieldId: 'supplier.legalName', supplierAliases: [], visibility: null, definition: { kind: 'text' as const, minLength: 1, maxLength: 256 } },
    { id: 'tax_identifier', label: 'Tax identifier', required: true, canonicalFieldId: 'fiscal.taxIdentifier', supplierAliases: [], visibility: null, definition: { kind: 'canonical_identifier' as const, minLength: 8, maxLength: 32 } },
  ] },
  instance: { id: '73111111-1111-4111-8111-111111111111', version: 2, values: { legal_name: 'Sierra Retail México' }, updatedAt: '2026-08-26T20:10:00.000Z' },
  mappings: [{ id: '74111111-1111-4111-8111-111111111111', version: 1, status: 'accepted' as const, automaticStatus: 'ready_for_operations_review' as const, afterSha256: 'e'.repeat(64), matchesCurrentDraft: true, updatedAt: '2026-08-26T20:10:00.000Z', fields: [
    { fieldId: 'legal_name', source: 'rateware' as const, status: 'prepared' as const, evidenceCount: 1 },
    { fieldId: 'tax_identifier', source: 'attachment' as const, status: 'prepared' as const, evidenceCount: 2 },
  ], evidence: {
    sourceDocumentVersionId: '76111111-1111-4111-8111-111111111111', sourceDocumentVersion: 1, sourceDocumentStatus: 'approved' as const, sourceDocumentFingerprint: 'f'.repeat(64),
    extractionId: '77111111-1111-4111-8111-111111111111', extractionStatus: 'reviewed' as const, totalFieldCount: 7, invalidFieldCount: 0,
    protectedFields: [{ id: '78111111-1111-4111-8111-111111111111', fieldKey: 'fiscal.taxIdentifier', presence: 'present' as const, value: 'SRM010101AA1', confidence: 0.94, validation: 'valid' as const, evidenceCount: 2, reviewed: true }],
  } }],
  evidenceReady: true,
  capabilities: { saveDraft: true, acceptMapping: false, correctMapping: false, submitForReview: true },
};

function renderRoute(client: Pick<OspClient, 'getCaseFormWorkspace' | 'saveCaseFormDraft' | 'acceptCaseFormMapping' | 'correctCaseFormMapping' | 'submitCaseFormForReview'>) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [`/app/cases/${caseId}/form`] }));
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} context={{ apiClient: client as OspClient, email: 'operator@xbfreight.com', logout: async () => undefined, reauthenticateForApproval: async () => undefined, approvalSessionFresh: () => true }} /></QueryClientProvider>);
}

describe('CaseFormWorkspace', () => {
  it('shows prefilled progress and saves the exact case draft', async () => {
    const save = vi.fn().mockResolvedValue({ instance: { ...workspace.instance, version: 3 }, replayed: false });
    renderRoute({ getCaseFormWorkspace: vi.fn().mockResolvedValue(workspace), saveCaseFormDraft: save, acceptCaseFormMapping: vi.fn(), correctCaseFormMapping: vi.fn(), submitCaseFormForReview: vi.fn() });
    expect(await screen.findByRole('heading', { name: /complete customer setup/i })).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText(/tax identifier/i, {}, { timeout: 5_000 }), 'XAXX010101000');
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ caseId, instanceId: workspace.instance.id, expectedVersion: 2, values: { legal_name: 'Sierra Retail México', tax_identifier: 'XAXX010101000' } })));
  }, 10_000);

  it('updates completion while typing and submits the exact form to Operations review', async () => {
    const submit = vi.fn().mockResolvedValue({ instance: { ...workspace.instance, version: 3 }, caseState: 'operations_review', caseVersion: 5, snapshotSha256: 'd'.repeat(64), replayed: false });
    renderRoute({ getCaseFormWorkspace: vi.fn().mockResolvedValue(workspace), saveCaseFormDraft: vi.fn(), acceptCaseFormMapping: vi.fn(), correctCaseFormMapping: vi.fn(), submitCaseFormForReview: submit });
    expect(await screen.findByText('50%')).toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText(/tax identifier/i, {}, { timeout: 5_000 }), 'XAXX010101000');
    expect(await screen.findByText('100%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /submit for operations review/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ caseId, expectedCaseVersion: 4, expectedVersion: 2, values: { legal_name: 'Sierra Retail México', tax_identifier: 'XAXX010101000' } })));
  }, 10_000);

  it('shows safe prefill provenance and accepts the exact reviewed mapping', async () => {
    const mapping = { ...workspace.mappings[0], status: 'unresolved' as const, evidence: { ...workspace.mappings[0].evidence, sourceDocumentStatus: 'review_required' as const, extractionStatus: 'review_required' as const, protectedFields: workspace.mappings[0].evidence.protectedFields.map((field) => ({ ...field, reviewed: false })) } };
    const reviewWorkspace = { ...workspace, instance: { ...workspace.instance, values: { legal_name: 'Sierra Retail México', tax_identifier: 'XAXX010101000' } }, mappings: [mapping], evidenceReady: false, capabilities: { saveDraft: true, acceptMapping: true, correctMapping: false, submitForReview: false } };
    const accept = vi.fn().mockResolvedValue({ mappingId: mapping.id, mappingVersion: 1, status: 'accepted', reviewDecisionId: '75111111-1111-4111-8111-111111111111', documentVersionId: mapping.evidence.sourceDocumentVersionId, extractionId: mapping.evidence.extractionId, reviewedFieldCount: 1, replayed: false });
    renderRoute({ getCaseFormWorkspace: vi.fn().mockResolvedValue(reviewWorkspace), saveCaseFormDraft: vi.fn(), acceptCaseFormMapping: accept, correctCaseFormMapping: vi.fn(), submitCaseFormForReview: vi.fn() });
    expect(await screen.findByRole('heading', { name: /automatic prefill review/i })).toBeInTheDocument();
    expect(screen.getByText(/rateware · 1 evidence link/i)).toBeInTheDocument();
    expect(screen.getByText(/attachment · 2 evidence links/i)).toBeInTheDocument();
    expect(screen.getByText('fiscal.taxIdentifier')).toBeInTheDocument();
    expect(screen.getByText('SRM010101AA1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /reviewed the source document/i }));
    await userEvent.click(screen.getByRole('button', { name: /accept evidence and prefill/i }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith({ idempotencyKey: expect.stringMatching(/^case-mapping-accept:/), caseId, mappingId: mapping.id, expectedMappingVersion: 1, expectedAfterSha256: 'e'.repeat(64) }));
  }, 10_000);

  it('does not claim submission readiness while protected evidence decisions remain open', async () => {
    renderRoute({ getCaseFormWorkspace: vi.fn().mockResolvedValue({ ...workspace, instance: { ...workspace.instance, values: { legal_name: 'Sierra Retail México', tax_identifier: 'XAXX010101000' } }, evidenceReady: false, capabilities: { ...workspace.capabilities, submitForReview: false } }), saveCaseFormDraft: vi.fn(), acceptCaseFormMapping: vi.fn(), correctCaseFormMapping: vi.fn(), submitCaseFormForReview: vi.fn() });
    expect(await screen.findByRole('heading', { name: /evidence review required/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit for operations review/i })).toBeDisabled();
  });

  it('records a reviewed bank correction from the exact saved draft', async () => {
    const bankTemplate = { ...workspace.template, fields: [...workspace.template.fields, { id: 'bank_account', label: 'Bank account', required: true, canonicalFieldId: 'banking.accountNumber', supplierAliases: [], visibility: null, definition: { kind: 'canonical_identifier' as const, minLength: 4, maxLength: 34 } }] };
    const mapping = { ...workspace.mappings[0], status: 'unresolved' as const, matchesCurrentDraft: false, fields: [...workspace.mappings[0].fields, { fieldId: 'bank_account', source: 'missing' as const, status: 'missing' as const, evidenceCount: 0 }], evidence: { ...workspace.mappings[0].evidence, sourceDocumentStatus: 'review_required' as const, extractionStatus: 'review_required' as const, protectedFields: workspace.mappings[0].evidence.protectedFields.map((field) => ({ ...field, reviewed: false })) } };
    const correctionWorkspace = { ...workspace, caseState: 'awaiting_xbf_information' as const, template: bankTemplate, instance: { ...workspace.instance, values: { legal_name: 'Sierra Retail México', tax_identifier: 'XAXX010101000', bank_account: '0127870221' } }, mappings: [mapping], evidenceReady: false, capabilities: { saveDraft: true, acceptMapping: false, correctMapping: true, submitForReview: false } };
    const correct = vi.fn().mockResolvedValue({ mappingId: mapping.id, mappingVersion: 2, status: 'corrected', reviewDecisionId: '75111111-1111-4111-8111-111111111111', evidenceDocumentVersionId: '76111111-1111-4111-8111-111111111112', extractionId: mapping.evidence.extractionId, reviewedFieldCount: 1, caseState: 'preparing', caseVersion: 5, replayed: false });
    renderRoute({ getCaseFormWorkspace: vi.fn().mockResolvedValue(correctionWorkspace), saveCaseFormDraft: vi.fn(), acceptCaseFormMapping: vi.fn(), correctCaseFormMapping: correct, submitCaseFormForReview: vi.fn() });
    expect(await screen.findByText(/saved bank account will be linked/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /reviewed the source documents/i }));
    await userEvent.click(screen.getByRole('button', { name: /record reviewed correction/i }));
    await waitFor(() => expect(correct).toHaveBeenCalledWith({ idempotencyKey: expect.stringMatching(/^case-mapping-correct:/), caseId, mappingId: mapping.id, expectedMappingVersion: 1, expectedAfterSha256: 'e'.repeat(64), instanceId: correctionWorkspace.instance.id, expectedInstanceVersion: 2 }));
  }, 10_000);

  it('fails closed when the source extraction contains an invalid field', async () => {
    const mapping = {
      ...workspace.mappings[0],
      status: 'unresolved' as const,
      evidence: { ...workspace.mappings[0].evidence, extractionStatus: 'review_required' as const, invalidFieldCount: 1 },
    };
    renderRoute({
      getCaseFormWorkspace: vi.fn().mockResolvedValue({
        ...workspace,
        instance: { ...workspace.instance, values: { legal_name: 'Sierra Retail México', tax_identifier: 'XAXX010101000' } },
        mappings: [mapping],
        evidenceReady: false,
        capabilities: { saveDraft: true, acceptMapping: true, correctMapping: false, submitForReview: false },
      }),
      saveCaseFormDraft: vi.fn(),
      acceptCaseFormMapping: vi.fn(),
      correctCaseFormMapping: vi.fn(),
      submitCaseFormForReview: vi.fn(),
    });
    expect(await screen.findByText(/1 invalid extracted field blocks acceptance/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /reviewed the source document/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /accept evidence and prefill/i })).toBeDisabled();
  });
});
