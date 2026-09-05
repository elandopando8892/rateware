import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FormTemplateVersion } from './surveyjs-canonical-adapter';
import { FormRuntime } from './FormRuntime';

class ResizeObserverStub {
  observe() { return undefined; }
  unobserve() { return undefined; }
  disconnect() { return undefined; }
}
globalThis.ResizeObserver = ResizeObserverStub;
afterEach(cleanup);

const template: FormTemplateVersion = {
  id: '22222222-2222-4222-8222-222222222222',
  templateId: '11111111-1111-4111-8111-111111111111',
  version: 1,
  status: 'published',
  schemaSha256: 'a'.repeat(64),
  fields: [{ id: 'legal_name', label: 'Legal name', required: true, canonicalFieldId: 'supplier.legalName', supplierAliases: [], visibility: null, definition: { kind: 'text', minLength: 1, maxLength: 200 } }],
};

describe('FormRuntime', () => {
  it('keeps incomplete reference rows blocked and completes only after all three emails are entered', async () => {
    const complete = vi.fn();
    const references: FormTemplateVersion = { ...template, fields: [{ id: 'refs', label: 'Commercial references', required: true, canonicalFieldId: null, supplierAliases: [], visibility: null, definition: { kind: 'repeating_table', minRows: 3, maxRows: 4, uniqueBy: 'company', columns: [
      { id: 'company', label: 'Company', valueType: 'text', required: true },
      { id: 'email', label: 'Email', valueType: 'email', required: true },
    ] } }] };
    const { container } = render(<FormRuntime template={references} initialValues={{ refs: ['A', 'B', 'C'].map((company) => ({ company })) }} onComplete={complete} />);
    await userEvent.click(screen.getByRole('button', { name: /complete/i }));
    expect(complete).not.toHaveBeenCalled();
    const emails = container.querySelectorAll('input[type="email"]');
    expect(emails).toHaveLength(3);
    for (const [index, input] of [...emails].entries()) await userEvent.type(input, `reference${index}@example.test`);
    await userEvent.click(screen.getByRole('button', { name: /complete/i }));
    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0][0].refs).toHaveLength(3);
  });

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

  it('hydrates a saved draft and reports edits without exposing the complete action', async () => {
    const change = vi.fn();
    render(<FormRuntime template={template} initialValues={{ legal_name: 'Saved supplier' }} showCompleteButton={false} onChange={change} onComplete={vi.fn()} />);
    const input = screen.getByLabelText(/legal name/i);
    expect(input).toHaveValue('Saved supplier');
    expect(screen.queryByRole('button', { name: /complete/i })).not.toBeInTheDocument();
    await userEvent.type(input, ' updated');
    await waitFor(() => expect(change).toHaveBeenLastCalledWith({ legal_name: 'Saved supplier updated' }));
  });

  it('survives the development StrictMode mount cycle without disposing the live model', async () => {
    const change = vi.fn();
    render(<StrictMode><FormRuntime template={template} showCompleteButton={false} onChange={change} onComplete={vi.fn()} /></StrictMode>);
    await userEvent.type(screen.getByLabelText(/legal name/i), 'Strict supplier');
    await waitFor(() => expect(change).toHaveBeenLastCalledWith({ legal_name: 'Strict supplier' }));
  });
});
