import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { VisualFormBuilder } from './VisualFormBuilder';

vi.mock('survey-creator-react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('survey-creator-react')>()),
  SurveyCreatorComponent: () => <div role="application" aria-label="Visual form canvas" />,
}));

const survey = { title: 'Registration', pages: [{ name: 'page_1', elements: [{ type: 'text', name: 'legal_name', title: 'Legal name', ospKind: 'text', ospCanonicalFieldId: 'supplier.legalName' }] }] };

describe('VisualFormBuilder', () => {
  it('fails closed before rendering the commercial creator without approved license evidence', () => {
    render(<VisualFormBuilder initialSurvey={survey} canonicalFieldIds={['supplier.legalName']} licenseEvidence={{ approved: false, licenseKey: '' }} templateContext={{ templateId: '11111111-1111-4111-8111-111111111111', versionId: '22222222-2222-4222-8222-222222222222', version: 1 }} onSaveDraft={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/license approval required/i);
    expect(screen.queryByRole('application')).not.toBeInTheDocument();
  });

  it('offers accessible preview and immutable draft creation over canonical output', async () => {
    const save = vi.fn();
    render(<VisualFormBuilder initialSurvey={survey} canonicalFieldIds={['supplier.legalName']} licenseEvidence={{ approved: true, licenseKey: 'synthetic-local-license' }} templateContext={{ templateId: '11111111-1111-4111-8111-111111111111', versionId: '22222222-2222-4222-8222-222222222222', version: 1 }} onSaveDraft={save} />);
    expect(screen.getByRole('application', { name: /visual form canvas/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /save as new draft/i }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ status: 'draft', fields: expect.any(Array) })));
  });
});
