import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { FormTemplateVersion } from './surveyjs-canonical-adapter';
import { FormRuntime } from './FormRuntime';

class ResizeObserverStub {
  observe() { return undefined; }
  unobserve() { return undefined; }
  disconnect() { return undefined; }
}
globalThis.ResizeObserver = ResizeObserverStub;

const template: FormTemplateVersion = {
  id: '22222222-2222-4222-8222-222222222222',
  templateId: '11111111-1111-4111-8111-111111111111',
  version: 1,
  status: 'published',
  schemaSha256: 'a'.repeat(64),
  fields: [{ id: 'legal_name', label: 'Legal name', required: true, canonicalFieldId: 'supplier.legalName', supplierAliases: [], visibility: null, definition: { kind: 'text', minLength: 1, maxLength: 200 } }],
};

describe('FormRuntime', () => {
  it('renders only published canonical versions and returns validated values', async () => {
    const complete = vi.fn();
    render(<FormRuntime template={template} onComplete={complete} />);
    await userEvent.type(screen.getByLabelText(/legal name/i), 'Synthetic Supplier');
    await userEvent.click(screen.getByRole('button', { name: /complete/i }));
    expect(complete).toHaveBeenCalledWith({ legal_name: 'Synthetic Supplier' });
  });

  it('rejects mutable draft execution', () => {
    expect(() => render(<FormRuntime template={{ ...template, status: 'draft' }} onComplete={vi.fn()} />)).toThrow(/FORM_VERSION_NOT_PUBLISHED/);
  });
});
