import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { RequestManifestReadModel } from '../../api/contracts';
import { RequestManifestPanel } from './RequestManifestPanel';

const manifest: RequestManifestReadModel = {
  schemaVersion: 1,
  status: 'review_required',
  modelVersion: 'gpt-synthetic',
  sourceCount: 3,
  generatedAt: '2026-08-31T12:00:00.000Z',
  requestType: 'customer_setup',
  language: 'en',
  targetXbfEntity: 'XBFUS',
  requesterLegalName: 'Synthetic Carrier',
  dueDate: '2026-09-08',
  forms: [{ name: 'Supplier form.xlsx', format: 'xlsx', action: 'complete', required: true, evidenceIds: ['email:body'] }],
  requestedFields: [
    { id: 'business.legalName', sourceLabel: 'Legal name', canonicalFieldId: 'business.legalName', valueType: 'text', required: true, evidenceIds: ['xlsx:A1'] },
    { id: 'trade.references', sourceLabel: 'Trade references', canonicalFieldId: null, valueType: 'table', required: true, evidenceIds: ['xlsx:A2'] },
  ],
  requestedDocuments: [{ documentType: 'W-9', required: true, acceptableAlternatives: [], evidenceIds: ['email:body'] }],
  signature: { required: true, signerTitle: null, evidenceIds: ['docx:p1'] },
  submission: { method: 'reply_email', recipients: [], instructions: null, evidenceIds: ['email:body'] },
  requirements: [],
  contradictions: [],
  missingInformation: [{ fieldId: 'trade.references.3', description: 'Third reference missing', evidenceIds: ['xlsx:A2'] }],
  clarificationQuestions: [{ fieldId: 'trade.references.3', question: 'Provide a third trade reference.', evidenceIds: ['xlsx:A2'] }],
  readiness: { status: 'needs_clarification', reasonCodes: ['third_trade_reference_missing'] },
  aiGenerated: true,
  externalEffects: false,
};

describe('RequestManifestPanel', () => {
  it('shows the carrier request, mapped fields and governed blocker without an action control', () => {
    render(<RequestManifestPanel manifest={manifest} />);

    expect(screen.getByRole('heading', { name: /what this carrier is asking xbf to complete/i })).toBeInTheDocument();
    expect(screen.getByText('XBFUS')).toBeInTheDocument();
    expect(screen.getByText('Supplier form.xlsx')).toBeInTheDocument();
    expect(screen.getByText('W-9')).toBeInTheDocument();
    const fields = screen.getByRole('table', { name: /requested fields/i });
    expect(within(fields).getByText('business.legalName')).toBeInTheDocument();
    expect(within(fields).getByText('Needs mapping')).toBeInTheDocument();
    expect(screen.getByText('Provide a third trade reference.')).toBeInTheDocument();
    expect(screen.getByText(/ai proposes\. operations confirms\. no external effects/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('fails visibly closed when no request manifest exists', () => {
    render(<RequestManifestPanel manifest={null} />);
    expect(screen.getByRole('heading', { name: /request interpretation pending/i })).toBeInTheDocument();
    expect(screen.getByText(/no governed case-level interpretation/i)).toBeInTheDocument();
  });
});
