import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { QuarterlyDocumentVault } from './QuarterlyDocumentVault';

describe('QuarterlyDocumentVault', () => {
  it('shows the exact four-document currentness and requires explicit review before approval', async () => {
    const upload = vi.fn(async () => ({ id: '22222222-2222-4222-8222-222222222222', version: 2, expiresAt: '2026-11-24' }));
    const approve = vi.fn(async () => ({ id: '22222222-2222-4222-8222-222222222222', status: 'approved' as const }));
    render(<QuarterlyDocumentVault
      referenceDate="2026-08-24"
      versions={[
        { id: '11111111-1111-4111-8111-111111111111', documentType: 'proof_of_address', version: 1, status: 'approved', validFrom: '2026-08-24', expiresAt: '2026-11-24' },
        { id: '33333333-3333-4333-8333-333333333333', documentType: 'sat_compliance_opinion', version: 1, status: 'approved', validFrom: '2026-06-01', expiresAt: '2026-09-01' },
        { id: '44444444-4444-4444-8444-444444444444', documentType: 'bank_statement', version: 1, status: 'approved', validFrom: '2026-08-01', expiresAt: '2026-11-01' },
      ]}
      onUploadNewVersion={upload}
      onApproveVersion={approve}
    />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Constancia de situación fiscal')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /tax status certificate: missing/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /upload new tax status certificate version/i }));
    const file = new File([new Uint8Array([1, 2, 3])], 'tax-status.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/select tax status certificate file/i), file);
    await userEvent.click(screen.getByRole('button', { name: /stage tax status certificate for review/i }));
    await waitFor(() => expect(upload).toHaveBeenCalledWith(expect.objectContaining({
      documentType: 'tax_status_certificate', validFrom: '2026-08-24', contentType: 'application/pdf', bytes: new Uint8Array([1, 2, 3]),
    })));
    expect(approve).not.toHaveBeenCalled();
    const approveButton = screen.getByRole('button', { name: /approve reviewed tax-status.pdf/i });
    expect(approveButton).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: /i reviewed tax-status.pdf/i }));
    await userEvent.click(approveButton);
    expect(approve).toHaveBeenCalledWith(expect.objectContaining({
      versionId: '22222222-2222-4222-8222-222222222222', expectedVersion: 2,
    }));
    const [[approval]] = approve.mock.calls as unknown as [[{ reviewBeforeSha256: string; reviewAfterSha256: string }]];
    expect(approval.reviewBeforeSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(approval.reviewAfterSha256).toBe(approval.reviewBeforeSha256);
    expect(screen.queryByRole('button', { name: /renew automatically/i })).not.toBeInTheDocument();
  });
});
