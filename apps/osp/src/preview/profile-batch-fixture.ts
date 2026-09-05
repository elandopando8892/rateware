import type { CorporateProfileEntity } from '../api/contracts';

/** Synthetic-only documentary batch. No real tax, bank or identity values. */
export const previewProfilePromotion: CorporateProfileEntity['promotion_candidates'][number] = {
  review_id: '92000000-0000-4000-8000-000000000004', review_revision: 6,
  document_type: 'formation_document', evidence_label: 'Formation document',
  candidate_sha256: '9'.repeat(64), candidate_count: '3', change_count: '2',
  unchanged_count: '1', withheld_count: '1', promotion_status: 'ready',
  expected_current_fact_ids: { entity_type: null, business_start_year: '94000000-0000-4000-8000-000000000001', affiliated_company: '94000000-0000-4000-8000-000000000002' },
  batch: {
    reviewId: '92000000-0000-4000-8000-000000000004', reviewRevision: 6,
    comparisonSha256: 'b'.repeat(64), ready: true, totalFields: 5, readOnly: true, externalEffects: false,
    rows: [
      { fieldId: '93000000-0000-4000-8000-000000000001', fieldCode: 'entity_type', decision: 'accepted', change: 'new', currentFactId: null, before: null, after: 'LLC · entidad de demostración' },
      { fieldId: '93000000-0000-4000-8000-000000000002', fieldCode: 'business_start_year', decision: 'corrected', change: 'replace', currentFactId: '94000000-0000-4000-8000-000000000001', before: '2023', after: '2024' },
      { fieldId: '93000000-0000-4000-8000-000000000003', fieldCode: 'affiliated_company', decision: 'accepted', change: 'unchanged', currentFactId: '94000000-0000-4000-8000-000000000002', before: 'XBF Demo Network', after: 'XBF Demo Network' },
      { fieldId: '93000000-0000-4000-8000-000000000004', fieldCode: 'bank_account', decision: 'withheld', change: 'withheld', currentFactId: null, before: null, after: null },
      { fieldId: '93000000-0000-4000-8000-000000000005', fieldCode: 'legacy_contact', decision: 'rejected', change: 'rejected', currentFactId: null, before: null, after: null },
    ],
  },
};
