import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FinalResponseComposer } from './FinalResponseComposer';

const signedPackage = {
  packageId: '66666666-6666-4666-8666-666666666666',
  outputSha256: 'b'.repeat(64),
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const,
};
const replyContext = {
  to: ['supplier@example.com'],
  cc: ['reviewer@example.com'],
  subject: 'Re: Supplier registration request',
  inReplyTo: '<source@example.com>',
  references: ['<source@example.com>', '<prior@example.com>'],
};

afterEach(cleanup);

describe('FinalResponseComposer', () => {
  it('saves only the editable body with the captured thread and signed package locked', async () => {
    const save = vi.fn(async () => undefined);
    render(<FinalResponseComposer signedPackage={signedPackage} replyContext={replyContext} onSave={save} />);
    expect(screen.getByRole('status')).toHaveTextContent(/append-only internal version/i);
    expect(screen.getByText(signedPackage.packageId)).toBeInTheDocument();
    expect(screen.getByText(signedPackage.outputSha256)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^to · captured$/i })).toHaveAttribute('readonly');
    expect(screen.getByRole('textbox', { name: /^subject · captured$/i })).toHaveAttribute('readonly');

    fireEvent.change(screen.getByRole('textbox', { name: /^body$/i }), { target: { value: 'Reviewed and ready for Sales.' } });
    await userEvent.click(screen.getByRole('button', { name: /save internal draft/i }));

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      payloadId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      to: ['supplier@example.com'], cc: ['reviewer@example.com'],
      subject: 'Re: Supplier registration request', bodyText: 'Reviewed and ready for Sales.',
      inReplyTo: '<source@example.com>', references: ['<source@example.com>', '<prior@example.com>'],
    }));
    expect(JSON.stringify(save.mock.calls)).not.toContain('66666666-6666-4666-8666-666666666666');
  });

  it('fails closed on duplicate recipients without invoking save', async () => {
    const save = vi.fn(async () => undefined);
    render(<FinalResponseComposer signedPackage={signedPackage} replyContext={{ ...replyContext, cc: [...replyContext.to] }} onSave={save} />);
    await userEvent.click(screen.getByRole('button', { name: /save internal draft/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/captured reply recipients are invalid/i);
    expect(save).not.toHaveBeenCalled();
  });

  it('creates a new append-only corrected version without unlocking thread headers', async () => {
    const save = vi.fn(async () => undefined);
    render(<FinalResponseComposer signedPackage={signedPackage} replyContext={replyContext} initialBodyText="Original body" revision onSave={save} />);
    expect(screen.getByRole('textbox', { name: /^body$/i })).toHaveValue('Original body');
    expect(screen.getByRole('button', { name: /save corrected version/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /save corrected version/i }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ bodyText: 'Original body', inReplyTo: replyContext.inReplyTo }));
  });
});
