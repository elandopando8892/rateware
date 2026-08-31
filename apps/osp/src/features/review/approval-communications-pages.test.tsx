import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApprovalCommunicationsWorkspace } from '../../api/contracts';
import { SignatureApprovalPage } from '../approval/SignatureApprovalPage';
import { SalesAuthorizationPage } from '../approval/SalesAuthorizationPage';
import { OutboundPayloadPage } from '../communications/OutboundPayloadPage';
import { OperationsReviewPage } from './OperationsReviewPage';

const caseId = '33333333-3333-4333-8333-333333333333';
const payloadId = '44444444-4444-4444-8444-444444444444';
const workspace: ApprovalCommunicationsWorkspace = {
  caseId,
  caseVersion: 7,
  caseState: 'sales_authorization',
  inputSnapshot: {
    sha256: 'a'.repeat(64), documentCount: 4, extractionCount: 18,
    reviewDecisionCount: 3, formInstanceVersion: 2,
  },
  supplierPackage: null,
  signedPackage: {
    packageId: '66666666-6666-4666-8666-666666666666', outputSha256: 'c'.repeat(64),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  replyContext: {
    to: ['supplier@example.test'], cc: ['sales@heymarksman.com'],
    subject: 'Re: Supplier registration request', inReplyTo: '<source@example.test>',
    references: ['<source@example.test>'],
  },
  signature: {
    positionVersion: 3, approvalStatus: 'approved',
    approvalId: '55555555-5555-4555-8555-555555555555', outputSha256: 'b'.repeat(64),
  },
  outbound: {
    payloadId, kind: 'final_response', status: 'frozen', caseVersion: 7,
    from: 'carriers@xbfreight.com', to: ['supplier@example.test'],
    cc: ['sales@heymarksman.com'], subject: 'Supplier registration response',
    inReplyTo: '<source@example.test>', references: ['<source@example.test>'],
    bodyText: 'The reviewed supplier package is ready.',
    attachmentSha256: ['c'.repeat(64)], mimeSha256: 'd'.repeat(64),
    salesAuthorizationId: null, sendOutcome: null,
  },
  capabilities: {
    completeOperationsReview: true, approveAndApplySignature: true,
    saveOutboundDraft: false,
    freezeOutboundPayload: true, authorizeOutboundPayload: true,
    requestAuthorizedSend: true,
  },
};

afterEach(cleanup);

describe('controlled approval and communications pages', () => {
  it('requires an Operations evidence acknowledgment before advancing', async () => {
    const complete = vi.fn(async () => undefined);
    const operationsWorkspace: ApprovalCommunicationsWorkspace = {
      ...workspace,
      caseState: 'operations_review',
      supplierPackage: {
        packageId: '66666666-6666-4666-8666-666666666666',
        version: 1,
        outputSha256: 'e'.repeat(64),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        downloadUrl: 'https://example.test/reviewed-package',
      },
    };
    render(<OperationsReviewPage workspace={operationsWorkspace} onComplete={complete} />);
    expect(screen.getByText(/4 reviewed documents/i)).toBeInTheDocument();
    expect(screen.getByText(/18 extracted fields/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /download reviewed xlsx/i })).toHaveAttribute('href', 'https://example.test/reviewed-package');
    const action = screen.getByRole('button', { name: /complete operations review/i });
    expect(action).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: /evidence package is complete/i }));
    await userEvent.click(action);
    expect(complete).toHaveBeenCalledOnce();
  });

  it('shows José only fingerprints and requires his explicit signature confirmation', async () => {
    const approve = vi.fn(async () => undefined);
    render(<SignatureApprovalPage workspace={workspace} onApprove={approve} />);
    expect(screen.getByText(/position version 3/i)).toBeInTheDocument();
    expect(screen.getByText(/bbbbbbbbbbbb/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/vault|signature bytes/i);
    const action = screen.getByRole('button', { name: /approve and apply signature/i });
    expect(action).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: /approved signature policy/i }));
    await userEvent.click(action);
    expect(approve).toHaveBeenCalledOnce();
  });

  it('requires fresh authentication before rendering any signature command control', async () => {
    const approve = vi.fn(async () => undefined);
    const reauthenticate = vi.fn(async () => undefined);
    render(<SignatureApprovalPage
      workspace={workspace}
      reauthenticationRequired
      onReauthenticate={reauthenticate}
      onApprove={approve}
    />);
    expect(screen.queryByRole('checkbox', { name: /approved signature policy/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve and apply signature/i })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/no signature command will be sent yet/i);
    await userEvent.click(screen.getByRole('button', { name: /authenticate to approve/i }));
    expect(reauthenticate).toHaveBeenCalledOnce();
    expect(approve).not.toHaveBeenCalled();
  });

  it('shows Sales the exact outbound content and resets confirmation when its fingerprint changes', async () => {
    const authorize = vi.fn(async () => undefined);
    const view = render(<SalesAuthorizationPage workspace={workspace} onSaveDraft={vi.fn()} onFreeze={vi.fn()} onAuthorize={authorize} />);
    expect(screen.getByText('supplier@example.test')).toBeInTheDocument();
    expect(screen.getByText('sales@heymarksman.com')).toBeInTheDocument();
    expect(screen.getByText('Supplier registration response')).toBeInTheDocument();
    expect(screen.getByText('The reviewed supplier package is ready.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /exact recipients, content and attachments/i }));
    expect(screen.getByRole('button', { name: /authorize outbound payload/i })).toBeEnabled();
    view.rerender(<SalesAuthorizationPage
      workspace={{ ...workspace, outbound: { ...workspace.outbound!, mimeSha256: 'e'.repeat(64) } }}
      onSaveDraft={vi.fn()}
      onFreeze={vi.fn()}
      onAuthorize={authorize}
    />);
    expect(screen.getByRole('button', { name: /authorize outbound payload/i })).toBeDisabled();
  });

  it('moves from internal composer to an explicit Operations freeze without exposing send', async () => {
    const save = vi.fn(async () => undefined);
    const composer = render(<SalesAuthorizationPage
      workspace={{ ...workspace, outbound: null, capabilities: { ...workspace.capabilities, saveOutboundDraft: true, freezeOutboundPayload: false, authorizeOutboundPayload: false } }}
      onSaveDraft={save} onFreeze={vi.fn()} onAuthorize={vi.fn()}
    />);
    expect(screen.getByRole('heading', { name: /prepare final response/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save internal draft/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument();
    composer.unmount();

    const freeze = vi.fn(async () => undefined);
    render(<SalesAuthorizationPage
      workspace={{ ...workspace, outbound: { ...workspace.outbound!, status: 'draft', mimeSha256: null }, capabilities: { ...workspace.capabilities, saveOutboundDraft: true, freezeOutboundPayload: true, authorizeOutboundPayload: false } }}
      onSaveDraft={save} onFreeze={freeze} onAuthorize={vi.fn()}
    />);
    expect(screen.getAllByText('<source@example.test>').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: /save corrected version/i })).toBeInTheDocument();
    const action = screen.getByRole('button', { name: /freeze for sales review/i });
    expect(action).toBeDisabled();
    const confirmation = screen.getByRole('checkbox', { name: /exact draft, recipients and signed package/i });
    const body = screen.getByRole('textbox', { name: /^body$/i });
    fireEvent.change(body, { target: { value: 'Unsaved correction' } });
    expect(confirmation).toBeDisabled();
    expect(screen.getByText(/save or discard the body correction/i)).toBeInTheDocument();
    fireEvent.change(body, { target: { value: workspace.outbound!.bodyText } });
    expect(confirmation).toBeEnabled();
    await userEvent.click(confirmation);
    await userEvent.click(action);
    expect(freeze).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /authorize outbound payload/i })).not.toBeInTheDocument();
  });

  it('keeps freeze and send as distinct authority-gated actions', async () => {
    const freeze = vi.fn(async () => undefined);
    const send = vi.fn(async () => undefined);
    const view = render(<OutboundPayloadPage workspace={workspace} onFreeze={freeze} onRequestSend={send} />);
    expect(screen.getByText((content) => content.includes('carriers@xbfreight.com'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /freeze outbound payload/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request authorized send/i })).toBeInTheDocument();
    view.rerender(<OutboundPayloadPage
      workspace={{ ...workspace, capabilities: { ...workspace.capabilities, freezeOutboundPayload: false, requestAuthorizedSend: false } }}
      onFreeze={freeze}
      onRequestSend={send}
    />);
    expect(screen.queryByRole('button', { name: /freeze outbound payload/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /request authorized send/i })).not.toBeInTheDocument();
  });

  it('announces completed controls and manual reconciliation without suggesting missing authority', () => {
    const done = { ...workspace, capabilities: { ...workspace.capabilities, completeOperationsReview: false, approveAndApplySignature: false, authorizeOutboundPayload: false } };
    const operations = render(<OperationsReviewPage workspace={{ ...done, caseState: 'signature_approval' }} onComplete={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(/operations review complete/i);
    operations.unmount();
    const signature = render(<SignatureApprovalPage workspace={{ ...done, caseState: 'sales_authorization' }} onApprove={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(/signature applied/i);
    signature.unmount();
    const sales = render(<SalesAuthorizationPage workspace={{ ...done, caseState: 'ready_to_send', outbound: { ...workspace.outbound!, status: 'authorized', salesAuthorizationId: '55555555-5555-4555-8555-555555555555' } }} onSaveDraft={vi.fn()} onFreeze={vi.fn()} onAuthorize={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(/sales authorization complete/i);
    sales.unmount();
    render(<OutboundPayloadPage workspace={{ ...done, capabilities: { ...done.capabilities, requestAuthorizedSend: false, freezeOutboundPayload: false }, caseState: 'manual_reconciliation_required', outbound: { ...workspace.outbound!, status: 'manual_reconciliation_required', sendOutcome: 'manual_reconciliation_required' } }} onFreeze={vi.fn()} onRequestSend={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/manual reconciliation required/i);
    expect(screen.queryByRole('button', { name: /request authorized send/i })).not.toBeInTheDocument();
  });

  it('does not claim a reload after a generic command failure', async () => {
    render(<SalesAuthorizationPage
      workspace={workspace}
      onSaveDraft={vi.fn()}
      onFreeze={vi.fn()}
      onAuthorize={async () => { throw new Error('DEPENDENCY_UNAVAILABLE'); }}
    />);
    await userEvent.click(screen.getByRole('checkbox', { name: /exact recipients, content and attachments/i }));
    await userEvent.click(screen.getByRole('button', { name: /authorize outbound payload/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/reload the current state/i);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/state was reloaded/i);
  });

  it('does not report an Operations review as complete in an unrelated state and announces outbound progress', () => {
    const unrelated = render(<OperationsReviewPage
      workspace={{ ...workspace, caseState: 'awaiting_clarification', capabilities: { ...workspace.capabilities, completeOperationsReview: false } }}
      onComplete={vi.fn()}
    />);
    expect(screen.getByRole('status')).toHaveTextContent(/not active for the current state/i);
    expect(screen.getByRole('status')).not.toHaveTextContent(/review complete/i);
    unrelated.unmount();
    render(<OutboundPayloadPage
      workspace={{ ...workspace, outbound: { ...workspace.outbound!, status: 'frozen' }, capabilities: { ...workspace.capabilities, freezeOutboundPayload: false, requestAuthorizedSend: false } }}
      onFreeze={vi.fn()}
      onRequestSend={vi.fn()}
    />);
    expect(screen.getByRole('status')).toHaveTextContent(/payload frozen/i);
  });
});
