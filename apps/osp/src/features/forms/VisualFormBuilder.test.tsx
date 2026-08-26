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
    render(<VisualFormBuilder initialSurvey={survey} canonicalFieldIds={['supplier.legalName']} licenseEvidence={{ approved: false, licenseKey: '' }} onSaveDraft={vi.fn()} onPublish={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/license approval required/i);
    expect(screen.queryByRole('application')).not.toBeInTheDocument();
  });

  it('offers accessible preview, draft, and publish actions over canonical output', async () => {
    const save = vi.fn();
    const publish = vi.fn();
    render(<VisualFormBuilder initialSurvey={survey} canonicalFieldIds={['supplier.legalName']} licenseEvidence={{ approved: true, licenseKey: 'synthetic-local-license' }} onSaveDraft={save} onPublish={publish} />);
    expect(screen.getByRole('application', { name: /visual form canvas/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    fireEvent.click(screen.getByRole('button', { name: /publish version/i }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft', fields: expect.any(Array) })));
    await waitFor(() => expect(publish).toHaveBeenCalledWith(expect.objectContaining({ status: 'published', fields: expect.any(Array) })));
  });
});
