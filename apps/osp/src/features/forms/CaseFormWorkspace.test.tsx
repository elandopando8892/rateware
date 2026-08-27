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
  capabilities: { saveDraft: true, submitForReview: true },
};

function renderRoute(client: Pick<OspClient, 'getCaseFormWorkspace' | 'saveCaseFormDraft' | 'submitCaseFormForReview'>) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [`/app/cases/${caseId}/form`] }));
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} context={{ apiClient: client as OspClient, email: 'operator@xbfreight.com', logout: async () => undefined }} /></QueryClientProvider>);
}

describe('CaseFormWorkspace', () => {
  it('shows prefilled progress and saves the exact case draft', async () => {
    const save = vi.fn().mockResolvedValue({ instance: { ...workspace.instance, version: 3 }, replayed: false });
    renderRoute({ getCaseFormWorkspace: vi.fn().mockResolvedValue(workspace), saveCaseFormDraft: save, submitCaseFormForReview: vi.fn() });
    expect(await screen.findByRole('heading', { name: /complete customer setup/i })).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText(/tax identifier/i), 'XAXX010101000');
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ caseId, instanceId: workspace.instance.id, expectedVersion: 2, values: { legal_name: 'Sierra Retail México', tax_identifier: 'XAXX010101000' } })));
  }, 10_000);

  it('updates completion while typing and submits the exact form to Operations review', async () => {
    const submit = vi.fn().mockResolvedValue({ instance: { ...workspace.instance, version: 3 }, caseState: 'operations_review', caseVersion: 5, snapshotSha256: 'd'.repeat(64), replayed: false });
    renderRoute({ getCaseFormWorkspace: vi.fn().mockResolvedValue(workspace), saveCaseFormDraft: vi.fn(), submitCaseFormForReview: submit });
    expect(await screen.findByText('50%')).toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText(/tax identifier/i), 'XAXX010101000');
    expect(await screen.findByText('100%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /submit for operations review/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ caseId, expectedCaseVersion: 4, expectedVersion: 2, values: { legal_name: 'Sierra Retail México', tax_identifier: 'XAXX010101000' } })));
  }, 10_000);
});
