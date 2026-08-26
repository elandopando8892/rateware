import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FormTemplateCatalog } from '../../api/contracts';
import { FormTemplateLibrary } from './FormTemplateLibrary';

const catalog: FormTemplateCatalog = {
  capabilities: { saveDraft: true, publish: true },
  templates: [
    {
      templateId: '11111111-1111-4111-8111-111111111111', name: 'Customer setup — Core', updatedAt: '2026-08-26T18:00:00.000Z',
      latest: { id: '21111111-1111-4111-8111-111111111111', templateId: '11111111-1111-4111-8111-111111111111', version: 3, status: 'published', schemaSha256: 'a'.repeat(64), fields: [
        { id: 'legal_name', label: 'Legal name', required: true, canonicalFieldId: 'supplier.legalName', supplierAliases: [], visibility: null, definition: { kind: 'text', minLength: 1, maxLength: 256 } },
      ] },
    },
    {
      templateId: '12222222-2222-4222-8222-222222222222', name: 'Customer setup — Banking', updatedAt: '2026-08-26T19:00:00.000Z',
      latest: { id: '22222222-2222-4222-8222-222222222222', templateId: '12222222-2222-4222-8222-222222222222', version: 1, status: 'draft', schemaSha256: 'b'.repeat(64), fields: [
        { id: 'bank_account', label: 'Bank account', required: true, canonicalFieldId: 'banking.accountNumber', supplierAliases: [], visibility: null, definition: { kind: 'text', minLength: 4, maxLength: 34 } },
      ] },
    },
  ],
};

afterEach(cleanup);

describe('FormTemplateLibrary', () => {
  it('shows the XBF catalog and remains useful when the paid visual editor is locked', () => {
    render(<FormTemplateLibrary catalog={catalog} licenseEvidence={{ approved: false, licenseKey: '' }} onCreateStarter={vi.fn()} onSaveDraft={vi.fn()} onPublish={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /form template library/i })).toBeInTheDocument();
    expect(screen.getByText('2', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText(/visual editing is locked/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /customer setup — banking/i })).toBeInTheDocument();
    expect(screen.getByText(/bank account/i)).toBeInTheDocument();
  });

  it('creates an XBF starter and publishes the selected draft through explicit callbacks', () => {
    const create = vi.fn();
    const publish = vi.fn();
    render(<FormTemplateLibrary catalog={catalog} licenseEvidence={{ approved: false, licenseKey: '' }} onCreateStarter={create} onSaveDraft={vi.fn()} onPublish={publish} />);
    fireEvent.click(screen.getByRole('button', { name: /create xbf starter draft/i }));
    expect(create).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /publish version 1/i }));
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ templateId: catalog.templates[1].templateId, templateVersionId: catalog.templates[1].latest.id, expectedVersion: 1 }));
  });
});
