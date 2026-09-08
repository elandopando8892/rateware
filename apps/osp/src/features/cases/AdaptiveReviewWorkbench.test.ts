import { describe, expect, it } from 'vitest';

import type { RequestManifestReadModel } from '../../api/contracts';
import { decisionSeeds, sourceCoverageSummary } from './AdaptiveReviewWorkbench';

const manifest = {
  schemaVersion: 1,
  status: 'review_required',
  modelVersion: 'gpt-synthetic',
  sourceCount: 1,
  sourceCoverage: { email: 1, xlsx: 0, xlsm: 0, pdf: 0, docx: 0, image: 0 },
  spreadsheetProtection: { macroEnabledFiles: 0, macroExecution: 'blocked', analysisMode: 'not_required' },
  generatedAt: '2026-09-07T12:00:00.000Z',
  requestType: 'customer_setup',
  language: 'en',
  targetXbfEntity: 'unknown',
  requesterLegalName: null,
  dueDate: null,
  forms: [],
  requestedFields: [],
  requestedDocuments: [],
  signature: { required: false, signerTitle: null, evidenceIds: [] },
  submission: { method: 'reply_email', recipients: [], instructions: null, evidenceIds: ['email:body'] },
  requirements: [],
  contradictions: [{ text: '  The legal name differs. ', evidenceIds: ['email:body'] }, { text: 'The legal name differs.', evidenceIds: ['email:body-2'] }],
  missingInformation: [{ fieldId: 'trade.references.3.email', description: 'Third reference email is missing', evidenceIds: ['email:body'] }],
  clarificationQuestions: [{ fieldId: 'trade.references.3.email', question: 'Provide the third reference email.', evidenceIds: ['email:body'] }, { fieldId: 'trade.references.3.email', question: '  Provide   the third reference email. ', evidenceIds: ['email:body-2'] }],
  readiness: { status: 'needs_clarification', reasonCodes: ['missing_information'] },
  aiGenerated: true,
  externalEffects: false,
} satisfies RequestManifestReadModel;

describe('AdaptiveReviewWorkbench decision identity', () => {
  it('names recognized source formats and explains an empty inventory', () => {
    expect(sourceCoverageSummary(manifest.sourceCoverage)).toBe('EMAIL');
    expect(sourceCoverageSummary({ email: 0, xlsx: 0, xlsm: 0, pdf: 0, docx: 0, image: 0 })).toBe('No recognized source formats');
  });

  it('removes exact duplicates while retaining first persisted ids', () => {
    expect(decisionSeeds(manifest).map((seed) => seed.decisionId)).toEqual(['clarification:0', 'contradiction:0', 'missing:0']);
  });

  it('keeps distinct constraints for the same field', () => {
    const distinct = {
      ...manifest,
      clarificationQuestions: [{ fieldId: 'trade.references.3.email', question: 'Confirm whether the third reference is active.', evidenceIds: ['email:body'] }],
      missingInformation: [{ fieldId: 'trade.references.3.email', description: 'Third reference email is missing', evidenceIds: ['email:body'] }],
      contradictions: [],
    } satisfies RequestManifestReadModel;
    expect(decisionSeeds(distinct).map((seed) => seed.decisionId)).toEqual(['clarification:0', 'missing:0']);
  });
});
