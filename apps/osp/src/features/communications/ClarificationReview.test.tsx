import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ClarificationReview } from './ClarificationReview';

describe('ClarificationReview', () => {
  afterEach(cleanup);
  it('lets Operations edit cited questions and save review without a send action', async () => {
    const save = vi.fn();
    render(<ClarificationReview
      draft={{
        canonicalSha256: 'a'.repeat(64),
        authorizationMailbox: 'sales@heymarksman.com',
        status: 'operations_review_required',
        questions: [{ kind: 'missing', fieldId: 'supplier.address', question: 'Please confirm the registered address.', evidenceIds: ['ev-1'] }],
      }}
      onSaveReview={save}
    />);
    const editor = screen.getByLabelText(/question for supplier.address/i);
    await userEvent.clear(editor);
    await userEvent.type(editor, 'Please provide the current registered address.');
    expect(screen.getByRole('status')).toHaveTextContent(/edits require a new sales authorization/i);
    await userEvent.click(screen.getByRole('button', { name: /save operations review/i }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      expectedCanonicalSha256: 'a'.repeat(64),
      questions: [expect.objectContaining({ question: 'Please provide the current registered address.' })],
    }));
    expect(save.mock.calls[0]?.[0]).not.toHaveProperty('canonicalSha256');
    expect(screen.getByText('sales@heymarksman.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument();
  });

  it('contains save failures and keeps the reviewed draft unsaved', async () => {
    render(<ClarificationReview
      draft={{
        canonicalSha256: 'b'.repeat(64),
        authorizationMailbox: 'sales@heymarksman.com',
        status: 'operations_review_required',
        questions: [{ kind: 'contradiction', fieldId: 'supplier.tax_id', question: 'Please confirm the tax identifier.', evidenceIds: ['ev-2'] }],
      }}
      onSaveReview={async () => { throw new Error('NETWORK_UNAVAILABLE'); }}
    />);
    await userEvent.click(screen.getByRole('button', { name: /save operations review/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save/i);
  });

  it('consolidates exact repeated questions while preserving every citation', async () => {
    const save = vi.fn();
    render(<ClarificationReview
      draft={{
        canonicalSha256: 'd'.repeat(64),
        authorizationMailbox: 'sales@heymarksman.com',
        status: 'operations_review_required',
        questions: [
          { kind: 'missing', fieldId: 'supplier.address', question: '  Please provide   the registered address. ', evidenceIds: ['ev-4'] },
          { kind: 'missing', fieldId: 'supplier.address', question: 'Please provide the registered address.', evidenceIds: ['ev-5'] },
        ],
      }}
      onSaveReview={save}
    />);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByText('Evidence: ev-4, ev-5')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /save operations review/i }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ questions: [expect.objectContaining({ evidenceIds: ['ev-4', 'ev-5'] })] }));
  });

  it('keeps different questions for one field visible', () => {
    render(<ClarificationReview
      draft={{
        canonicalSha256: 'e'.repeat(64),
        authorizationMailbox: 'sales@heymarksman.com',
        status: 'operations_review_required',
        questions: [
          { kind: 'missing', fieldId: 'supplier.address', question: 'Please provide the registered address.', evidenceIds: ['ev-6'] },
          { kind: 'missing', fieldId: 'supplier.address', question: 'Confirm the address effective date.', evidenceIds: ['ev-7'] },
        ],
      }}
      onSaveReview={vi.fn()}
    />);
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });

  it('renders an immutable Operations-reviewed draft without another save action', () => {
    render(<ClarificationReview
      draft={{
        canonicalSha256: 'c'.repeat(64),
        authorizationMailbox: 'sales@heymarksman.com',
        status: 'operations_reviewed',
        questions: [{ kind: 'missing', fieldId: 'supplier.address', question: 'Please provide the registered address.', evidenceIds: ['ev-3'] }],
      }}
      onSaveReview={vi.fn()}
    />);
    expect(screen.getByRole('status')).toHaveTextContent(/operations review is immutable/i);
    expect(screen.queryByRole('button', { name: /save operations review/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
