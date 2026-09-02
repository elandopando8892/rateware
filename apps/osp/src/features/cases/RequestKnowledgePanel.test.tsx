import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { OspCaseReadClient } from '../../api/osp-client';
import { RequestKnowledgePanel } from './RequestKnowledgePanel';

const caseId = '11111111-1111-4111-8111-111111111117';
const workspace = {
  caseId,
  manifestId: '22222222-2222-4222-8222-222222222222',
  reviewId: '33333333-3333-4333-8333-333333333333',
  reviewVersion: 1,
  candidateSha256: 'a'.repeat(64),
  candidates: [
    { kind: 'field' as const, canonicalKey: 'business.trade.references', displayLabel: 'Trade references', aliases: ['Trade references'], valueType: 'table' as const, required: true, evidenceCount: 2, catalogState: 'new' as const },
    { kind: 'document' as const, canonicalKey: 'w.9', displayLabel: 'W-9', aliases: ['W-9'], valueType: null, required: true, evidenceCount: 1, catalogState: 'known' as const },
  ],
  catalogEntryCount: 4,
  priorPromotionCount: 0,
  externalEffects: false as const,
};

describe('RequestKnowledgePanel', () => {
  it('shows reviewed concepts and promotes only after explicit confirmation', async () => {
    const promoteRequestKnowledge = vi.fn(async () => ({
      promotionId: '44444444-4444-4444-8444-444444444444', promotionStatus: 'applied' as const,
      promotedCount: 1, unchangedCount: 0, replayed: false, externalEffects: false as const,
    }));
    const client = {
      getRequestKnowledgeWorkspace: vi.fn(async () => workspace),
      promoteRequestKnowledge,
    } as unknown as OspCaseReadClient;
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RequestKnowledgePanel client={client} caseId={caseId} enabled />
    </QueryClientProvider>);

    expect(await screen.findByRole('heading', { name: /reuse what this request taught us/i })).toBeInTheDocument();
    expect(screen.getByText('Trade references')).toBeInTheDocument();
    expect(screen.getByText('W-9')).toBeInTheDocument();
    const promote = screen.getByRole('button', { name: /promote 1 reviewed concept/i });
    expect(promote).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/i confirm these selected concepts/i));
    await userEvent.click(promote);
    await waitFor(() => expect(promoteRequestKnowledge).toHaveBeenCalledTimes(1));
    expect(promoteRequestKnowledge.mock.calls[0][0]).toMatchObject({
      caseId, reviewId: workspace.reviewId, expectedCandidateSha256: workspace.candidateSha256,
      selectedKeys: ['field:business.trade.references'], confirmation: 'PROMOTE_REVIEWED_REQUEST_KNOWLEDGE',
    });
    expect(await screen.findByText(/catalog updated: 1 promoted/i)).toBeInTheDocument();
  });
});
