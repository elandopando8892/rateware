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
  ] }],
  capabilities: { saveDraft: true, acceptMapping: false, submitForReview: true },
};

function renderRoute(client: Pick<OspClient, 'getCaseFormWorkspace' | 'saveCaseFormDraft' | 'acceptCaseFormMapping' | 'submitCaseFormForReview'>) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [`/app/cases/${caseId}/form`] }));
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} context={{ apiClient: client as OspClient, email: 'operator@xbfreight.com', logout: async () => undefined }} /></QueryClientProvider>);
}

describe('CaseFormWorkspace', () => {
  it('shows prefilled progress and saves the exact case draft', async () => {
    const save = vi.fn().mockResolvedValue({ instance: { ...workspace.instance, version: 3 }, replayed: false });
    renderRoute({ getCaseFormWorkspace: vi.fn().mockResolvedValue(workspace), saveCaseFormDraft: save, acceptCaseFormMapping: vi.fn(), submitCaseFormForReview: vi.fn() });
    expect(await screen.findByRole('heading', { name: /complete customer setup/i })).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText(/tax identifier/i), 'XAXX010101000');
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ caseId, instanceId: workspace.instance.id, expectedVersion: 2, values: { legal_name: 'Sierra Retail México', tax_identifier: 'XAXX010101000' } })));
  }, 10_000);

  it('updates completion while typing and submits the exact form to Operations review', async () => {
    const submit = vi.fn().mockResolvedValue({ instance: { ...workspace.instance, version: 3 }, caseState: 'operations_review', caseVersion: 5, snapshotSha256: 'd'.repeat(64), replayed: false });
    renderRoute({ getCaseFormWorkspace: vi.fn().mockResolvedValue(workspace), saveCaseFormDraft: vi.fn(), acceptCaseFormMapping: vi.fn(), submitCaseFormForReview: submit });
    expect(await screen.findByText('50%')).toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText(/tax identifier/i), 'XAXX010101000');
    expect(await screen.findByText('100%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /submit for operations review/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ caseId, expectedCaseVersion: 4, expectedVersion: 2, values: { legal_name: 'Sierra Retail México', tax_identifier: 'XAXX010101000' } })));
  }, 10_000);

  it('shows safe prefill provenance and accepts the exact reviewed mapping', async () => {
    const mapping = { ...workspace.mappings[0], status: 'unresolved' as const };
    const reviewWorkspace = { ...workspace, instance: { ...workspace.instance, values: { legal_name: 'Sierra Retail México', tax_identifier: 'XAXX010101000' } }, mappings: [mapping], capabilities: { saveDraft: true, acceptMapping: true, submitForReview: false } };
    const accept = vi.fn().mockResolvedValue({ mappingId: mapping.id, mappingVersion: 1, status: 'accepted', reviewDecisionId: '75111111-1111-4111-8111-111111111111', replayed: false });
    renderRoute({ getCaseFormWorkspace: vi.fn().mockResolvedValue(reviewWorkspace), saveCaseFormDraft: vi.fn(), acceptCaseFormMapping: accept, submitCaseFormForReview: vi.fn() });
    expect(await screen.findByRole('heading', { name: /automatic prefill review/i })).toBeInTheDocument();
    expect(screen.getByText(/rateware · 1 evidence link/i)).toBeInTheDocument();
    expect(screen.getByText(/attachment · 2 evidence links/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /reviewed every prefilled field/i }));
    await userEvent.click(screen.getByRole('button', { name: /accept automatic prefill/i }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith({ idempotencyKey: expect.stringMatching(/^case-mapping-accept:/), caseId, mappingId: mapping.id, expectedMappingVersion: 1, expectedAfterSha256: 'e'.repeat(64) }));
  }, 10_000);
});
