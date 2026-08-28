import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import type { OspCorporateProfileClient } from '../../api/osp-client';
import { CorporateProfileWorkspace } from './CorporateProfileWorkspace';

const client: OspCorporateProfileClient = {
  async getCorporateProfile() { return {
    disclosure_locked: true,
    entities: [
      { entity_id: '91000000-0000-4000-8000-000000000001', entity_code: 'XBFMX', legal_name: 'XBF Demo Logistics', country_code: 'MX', default_currency: 'MXN', status: 'active', verified_fields: '2', review_fields: '0', total_fields: '2', fields: [
        { code: 'tax_identifier', label: 'Tax identifier', display_value: 'On file', verification_status: 'verified', sensitivity: 'restricted', support_status: 'verified_match', evidence_candidate_count: '2', reviewed_candidate_count: '2', review_candidates: [] },
        { code: 'registered_address', label: 'Registered address', display_value: 'Querétaro, Querétaro', verification_status: 'verified', sensitivity: 'confidential', support_status: 'evidence_available', evidence_candidate_count: '1', reviewed_candidate_count: '0', review_candidates: [] },
      ], promotion_candidates: [], evidence: [] },
      { entity_id: '91000000-0000-4000-8000-000000000002', entity_code: 'XBFUS', legal_name: 'XBF Demo Freight Systems', country_code: 'US', default_currency: 'USD', status: 'active', verified_fields: '2', review_fields: '1', total_fields: '3', fields: [
        { code: 'tax_identifier', label: 'Federal tax ID', display_value: 'On file', verification_status: 'verified', sensitivity: 'restricted', support_status: 'verified_match', evidence_candidate_count: '1', reviewed_candidate_count: '1', review_candidates: [] },
        { code: 'bank_name', label: 'Bank reference', display_value: 'Withheld', verification_status: 'needs_review', sensitivity: 'restricted', support_status: 'conflict', evidence_candidate_count: '1', reviewed_candidate_count: '1', review_candidates: [] },
        { code: 'registered_address', label: 'Registered address', display_value: 'Austin, Texas', verification_status: 'verified', sensitivity: 'confidential', support_status: 'unsupported', evidence_candidate_count: '0', reviewed_candidate_count: '0', review_candidates: [] },
      ], promotion_candidates: [], evidence: [{ name: 'Signature specimen', document_type: 'authorized_signature', verification_status: 'needs_review', sensitivity: 'highly_restricted', release_policy: 'approval_required', expiry_state: 'no_expiry' }] },
    ],
  }; },
  async claimProfileReview() { throw new Error('unused'); },
  async decideProfileReviewField() { throw new Error('unused'); },
  async finalizeProfileReview() { throw new Error('unused'); },
  async promoteProfileReviewFacts() { throw new Error('unused'); },
};

describe('CorporateProfileWorkspace', () => {
  it('shows a dual-entity profile without exposing production identifiers', async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CorporateProfileWorkspace client={client} /></QueryClientProvider>);
    expect(screen.getByRole('heading', { name: /corporate profile/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /xbf demo logistics/i })).toBeInTheDocument();
    expect(screen.getByText(/nothing is sent/i)).toBeInTheDocument();
    expect(screen.getAllByText('On file').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /verification queue/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /evidence ready/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /evidence ready/i }));
    expect(screen.getByText(/1 of 2 facts shown/i)).toBeInTheDocument();
    expect(screen.getByText(/review decisions are auditable/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /united states entity/i }));
    expect(screen.getByRole('heading', { name: /xbf demo freight systems/i })).toBeInTheDocument();
    expect(screen.getAllByText('On file').length).toBeGreaterThan(0);
    expect(screen.getByText(/signature specimen/i)).toBeInTheDocument();
    expect(screen.getAllByText(/withheld/i).length).toBeGreaterThan(0);
  });

  it('requires an explicit confirmation before promoting the exact reviewed snapshot', async () => {
    const promotion = {
      review_id: '92000000-0000-4000-8000-000000000004', review_revision: 6,
      document_type: 'formation_document', evidence_label: 'Formation document', candidate_sha256: '9'.repeat(64),
      candidate_count: '3', change_count: '2', unchanged_count: '1', withheld_count: '1', promotion_status: 'ready' as const,
      expected_current_fact_ids: { entity_type: null, business_start_year: '94000000-0000-4000-8000-000000000001' },
    };
    const base = await client.getCorporateProfile();
    const promote = vi.fn(async () => ({ promotionId: '95000000-0000-4000-8000-000000000001', promotionStatus: 'applied' as const, promotedFactCount: 2, unchangedFactCount: 1, withheldFieldCount: 1, reviewId: promotion.review_id, reviewRevision: 6, replayed: false }));
    const promotionClient: OspCorporateProfileClient = {
      ...client,
      getCorporateProfile: async () => ({ ...base, entities: base.entities.map((entity, index) => ({ ...entity, promotion_candidates: index === 0 ? [promotion] : [] })) }),
      promoteProfileReviewFacts: promote,
    };
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CorporateProfileWorkspace client={promotionClient} /></QueryClientProvider>);
    const action = await screen.findByRole('button', { name: /promote reviewed facts/i });
    expect(action).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: /exact reviewed snapshot/i }));
    await userEvent.click(action);
    expect(promote).toHaveBeenCalledWith({
      reviewId: promotion.review_id, expectedRevision: 6, candidateSha256: promotion.candidate_sha256,
      expectedCurrentFactIds: promotion.expected_current_fact_ids, confirmation: 'PROMOTE_VERIFIED_PROFILE_FACTS',
    });
    expect(await screen.findByText(/2 reviewed facts promoted/i)).toBeInTheDocument();
  });
});
