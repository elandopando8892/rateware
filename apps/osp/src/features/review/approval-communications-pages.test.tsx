import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApprovalCommunicationsWorkspace } from '../../api/contracts';
import { SignatureApprovalPage } from '../approval/SignatureApprovalPage';
import { SalesAuthorizationPage } from '../approval/SalesAuthorizationPage';
import { OutboundPayloadPage } from '../communications/OutboundPayloadPage';
import { OperationsReviewPage } from './OperationsReviewPage';
import { MemberInspectionPanel } from './MemberInspectionPanel';

const caseId = '33333333-3333-4333-8333-333333333333';
it('allows Operations only when the exact set review digest is supplied by the server', async () => {
  const complete = vi.fn().mockResolvedValue(undefined);
  const file = { requirementId: 'form:1', sourceVersionId: caseId, outputSha256: 'b'.repeat(64), contentType: 'application/pdf' as const, downloadUrl: null };
  const set = { setId: caseId, version: 1, manifestSha256: 'e'.repeat(64), files: [file], operationsReviewSha256: 'a'.repeat(64) };
  render(<OperationsReviewPage workspace={{ ...workspace, caseState: 'operations_review', supplierPackage: null, supplierPackageSet: set }} onComplete={complete} />);
  await userEvent.click(screen.getByRole('checkbox', {name:/All pre-signature requirements/}));
  await userEvent.click(screen.getByRole('button', {name:'Complete Operations review'}));
  expect(complete).toHaveBeenCalledTimes(1);
});
it('saves an exact file inspection and displays persisted evidence after remount', async () => {
  sessionStorage.clear();
  const file = { requirementId: 'form:1', sourceVersionId: caseId, outputSha256: 'b'.repeat(64), contentType: 'application/pdf' as const, downloadUrl: null };
  const scope = { ...workspace, caseState: 'operations_review' as const, supplierPackageSet: { setId: caseId, version: 1, manifestSha256: 'e'.repeat(64), files: [file] } };
  const save = vi.fn().mockResolvedValue(undefined);
  const first = render(<MemberInspectionPanel workspace={scope} file={file} onSave={save} />);
  expect(screen.getByRole('button', { name: 'Save file inspection' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('I inspected the complete downloaded file'));
  fireEvent.change(screen.getByLabelText('Verified completion (%)'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('Inspected pages'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Inspection decision'), { target: { value: 'approved' } });
  fireEvent.change(screen.getByLabelText('Required signature method'), { target: { value: 'none' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save file inspection' }));
  expect(save).toHaveBeenCalledTimes(1);
  const command = save.mock.calls[0][0];
  expect(command).toMatchObject({ sourceVersionId: caseId, outputSha256: file.outputSha256, completionPercent: 100, pageCount: 2, status: 'approved' });
  first.unmount();
  render(<MemberInspectionPanel workspace={scope} file={{ ...file, latestReview: { ...command, reviewVersion: 1 } }} onSave={save} />);
  expect(screen.getByRole('status')).toHaveTextContent('Saved inspection v1: approved');
  expect(save).toHaveBeenCalledTimes(1);
});

it('settles an uncertain inspection only when refreshed evidence confirms the same command', () => {
  sessionStorage.clear();
  const file = { requirementId: 'form:1', sourceVersionId: caseId, outputSha256: 'b'.repeat(64), contentType: 'application/pdf' as const, downloadUrl: null };
  const scope = { ...workspace, caseState: 'operations_review' as const, supplierPackageSet: { setId: caseId, version: 1, manifestSha256: 'e'.repeat(64), files: [file] } };
  const command = { reviewId: caseId, caseId, setId: caseId, sourceVersionId: caseId, outputSha256: file.outputSha256, setManifestSha256: 'e'.repeat(64), requestManifestSha256: 'f'.repeat(64) };
  const key = `osp:member-inspection:${caseId}:${caseId}:${file.outputSha256}`;
  sessionStorage.setItem(key, JSON.stringify(command));
  const save = vi.fn();
  const view = render(<MemberInspectionPanel workspace={scope} file={file} onSave={save} />);
  expect(screen.getByLabelText('Verified completion (%)')).toBeDisabled();
  const latestReview = { reviewId: payloadId, reviewVersion: 1, requestManifestSha256: command.requestManifestSha256, status: 'approved' as const, fullOutputInspected: true, completionPercent: 100, pageCount: 2, signatureRequirement: 'none' as const, signaturePolicyVersion: null };
  view.rerender(<MemberInspectionPanel workspace={scope} file={{ ...file, latestReview }} onSave={save} />);
  expect(screen.getByLabelText('Verified completion (%)')).toBeDisabled();
  expect(sessionStorage.getItem(key)).not.toBeNull();
  view.rerender(<MemberInspectionPanel workspace={scope} file={{ ...file, latestReview: { ...latestReview, reviewId: command.reviewId } }} onSave={save} />);
  expect(screen.getByLabelText('Verified completion (%)')).toBeEnabled();
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(save).not.toHaveBeenCalled();
});

it('retains the original inspection identity after an uncertain save and reload', async () => {
  sessionStorage.clear();
  const file = { requirementId: 'form:1', sourceVersionId: caseId, outputSha256: 'b'.repeat(64), contentType: 'application/pdf' as const, downloadUrl: null };
  const scope = { ...workspace, caseState: 'operations_review' as const, supplierPackageSet: { setId: caseId, version: 1, manifestSha256: 'e'.repeat(64), files: [file] } };
  const command = { reviewId: caseId, caseId, sourceVersionId: caseId, outputSha256: file.outputSha256 };
  sessionStorage.setItem(`osp:member-inspection:${caseId}:${caseId}:${file.outputSha256}`, JSON.stringify(command));
  const save = vi.fn().mockRejectedValue(new Error('NETWORK_UNAVAILABLE'));
  render(<MemberInspectionPanel workspace={scope} file={file} onSave={save} />);
  expect(screen.getByLabelText('Verified completion (%)')).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Reconcile original inspection' }));
  expect(save.mock.calls[0][0].reviewId).toBe(caseId);
  expect(sessionStorage.length).toBe(1);
  sessionStorage.clear();
});
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
    attachments: [{ name: 'Formato 3.3 Alta Cliente.pdf', contentType: 'application/pdf', sha256: 'c'.repeat(64) }],
    attachmentSha256: ['c'.repeat(64)], mimeSha256: 'd'.repeat(64),
    salesAuthorizationId: null, sendOutcome: null,
  },
  fulfillment: {
    schemaVersion: 1,
    manifestSha256: 'f'.repeat(64),
    assessedAt: '2026-09-02T12:00:00.000Z',
    totalRequired: 1,
    satisfiedRequired: 1,
    blockingCount: 0,
    items: [{
      requirementId: 'form:provider.registration:1', kind: 'form',
      canonicalKey: 'form.provider.registration', label: 'Supplier form',
      status: 'satisfied', blocking: false,
      reason: 'Approved evidence satisfies the request contract.',
      evidenceIds: ['package:66666666-6666-4666-8666-666666666666'],
    }],
    gates: { operationsReview: true, signatureApproval: true, outboundDraft: true, outboundFreeze: true, salesAuthorization: true, send: true },
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
  it('shows each file of the set without enabling partial approval', () => {
    const complete = vi.fn();
    render(<OperationsReviewPage workspace={{...workspace,caseState:'operations_review',supplierPackage:null,
      supplierPackageSet:{setId:caseId,version:2,manifestSha256:'e'.repeat(64),files:[
        {requirementId:'form.a',sourceVersionId:caseId,outputSha256:'a'.repeat(64),contentType:'application/pdf',downloadUrl:'https://example.test/a'},
        {requirementId:'form.b',sourceVersionId:payloadId,outputSha256:'b'.repeat(64),contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',downloadUrl:'https://example.test/b'},
        {requirementId:'form.c',sourceVersionId:'55555555-5555-4555-8555-555555555555',outputSha256:'c'.repeat(64),contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',downloadUrl:null},
      ]},capabilities:{...workspace.capabilities,completeOperationsReview:false}}} onComplete={complete}/>);
    expect(screen.getByRole('link',{name:'Download form 1 (PDF)'})).toHaveAttribute('href','https://example.test/a');
    expect(screen.getByRole('link',{name:'Download form 2 (DOCX)'})).toHaveAttribute('href','https://example.test/b');
    expect(screen.getByText(/new secure download link for form 3/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(complete).not.toHaveBeenCalled();
  });
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
    await userEvent.click(screen.getByRole('checkbox', { name: /pre-signature requirements are satisfied/i }));
    await userEvent.click(action);
    expect(complete).toHaveBeenCalledOnce();
  });

  it('keeps the semantic stop visible and disables Operations completion when one carrier requirement is missing', () => {
    const blocked = {
      ...workspace.fulfillment!,
      satisfiedRequired: 0,
      blockingCount: 1,
      items: [{ ...workspace.fulfillment!.items[0], status: 'missing' as const, blocking: true, reason: 'No matching evidence is attached.', evidenceIds: [] }],
      gates: { operationsReview: false, signatureApproval: false, outboundDraft: false, outboundFreeze: false, salesAuthorization: false, send: false },
    };
    render(<OperationsReviewPage
      workspace={{
        ...workspace,
        caseState: 'operations_review',
        supplierPackage: { packageId: '66666666-6666-4666-8666-666666666666', version: 1, outputSha256: 'e'.repeat(64), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', downloadUrl: null },
        fulfillment: blocked,
        capabilities: { ...workspace.capabilities, completeOperationsReview: false },
      }}
      onComplete={vi.fn()}
    />);
    expect(screen.getByRole('alert')).toHaveTextContent(/semantic stop active/i);
    expect(screen.getByRole('link', { name: /complete form/i })).toHaveAttribute('href', `/app/cases/${caseId}/form`);
    expect(screen.getByRole('checkbox', { name: /pre-signature requirements are satisfied/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /complete operations review/i })).not.toBeInTheDocument();
  });

  it('keeps an incomplete PDF/DOCX workspace visible while every action stays disabled', () => {
    const saveNativeTargets = vi.fn();
    const notReady: ApprovalCommunicationsWorkspace = {
      ...workspace,
      caseState: 'operations_review',
      supplierPackage: null,
      fulfillment: {
        assessmentStatus: 'not_ready', schemaVersion: 1, manifestSha256: null,
        assessedAt: '2026-09-12T18:00:00.000Z', totalRequired: 1,
        satisfiedRequired: 0, blockingCount: 1,
        items: [{
          requirementId: 'request-manifest-review', kind: 'form',
          canonicalKey: 'request.manifest_review', label: 'Request requirements review',
          status: 'review_required', blocking: true,
          reason: 'A current reviewed request is required before fulfillment can be assessed.', evidenceIds: [],
        }],
        gates: { operationsReview: false, signatureApproval: false, outboundDraft: false, outboundFreeze: false, salesAuthorization: false, send: false },
      },
      nativeArtifactTargets: [
        {
          state: 'ready', mappingId: caseId, mappingVersion: 1, mappingSha256: 'a'.repeat(64),
          mappingDecisionId: payloadId, sourceVersionId: caseId, sourceSha256: 'b'.repeat(64),
          contentType: 'application/pdf', sourceDownloadUrl: 'https://example.test/original.pdf',
          requiredFieldCount: 1, mappedFieldCount: 1, completionPercent: 100,
          fields: [{ canonicalFieldId: 'company.name', label: 'Legal name', target: { kind: 'acroform', canonicalFieldId: 'company.name', fieldName: 'legal_name' } }],
        },
        {
          state: 'stale', mappingId: payloadId, mappingVersion: 2, mappingSha256: 'c'.repeat(64),
          mappingDecisionId: caseId, sourceVersionId: payloadId, sourceSha256: 'd'.repeat(64),
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sourceDownloadUrl: 'https://example.test/original.docx',
          requiredFieldCount: 1, mappedFieldCount: 0, completionPercent: 0,
          fields: [{ canonicalFieldId: 'company.tax_id', label: 'Tax ID', target: null }],
        },
      ],
      capabilities: {
        completeOperationsReview: false, approveAndApplySignature: false,
        saveOutboundDraft: false, freezeOutboundPayload: false,
        authorizeOutboundPayload: false, requestAuthorizedSend: false,
      },
    };
    render(<OperationsReviewPage workspace={notReady} onComplete={vi.fn()} onSaveNativeTargets={saveNativeTargets} />);
    expect(screen.getByRole('heading', { name: 'Operations evidence review' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Carrier requirement coverage' })).toBeVisible();
    expect(screen.getByText('Request requirements review')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Review request' })).toHaveAttribute('href', `/app/cases/${caseId}`);
    expect(screen.getAllByRole('link', { name: 'Open preserved original' })).toHaveLength(2);
    expect(screen.getByLabelText('Field name in PDF')).toBeDisabled();
    expect(screen.getByLabelText('Content control tag')).toBeDisabled();
    for (const action of screen.getAllByRole('button', { name: 'Save reviewed destinations' })) expect(action).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Complete Operations review' })).not.toBeInTheDocument();
    expect(saveNativeTargets).not.toHaveBeenCalled();
  });

  it('labels a missing bank cover as package-level evidence and routes to documents', () => {
    const blocked = {
      ...workspace.fulfillment!,
      satisfiedRequired: 0,
      blockingCount: 1,
      items: [{
        ...workspace.fulfillment!.items[0],
        canonicalKey: 'banking.account_evidence',
        kind: 'document' as const,
        label: 'Carátula del banco emisor',
        status: 'missing' as const,
        blocking: true,
        reason: 'No matching evidence is attached.',
        evidenceIds: [],
      }],
      gates: { operationsReview: false, signatureApproval: false, outboundDraft: false, outboundFreeze: false, salesAuthorization: false, send: false },
    };
    render(<OperationsReviewPage
      workspace={{
        ...workspace,
        caseState: 'operations_review',
        supplierPackage: { packageId: '66666666-6666-4666-8666-666666666666', version: 1, outputSha256: 'e'.repeat(64), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', downloadUrl: null },
        fulfillment: blocked,
        capabilities: { ...workspace.capabilities, completeOperationsReview: false },
      }}
      onComplete={vi.fn()}
    />);
    expect(screen.getByText(/package-level evidence/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review documents/i })).toHaveAttribute('href', '/app/documents');
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
    expect(screen.getByRole('heading', { name: /files returning to the carrier/i })).toBeInTheDocument();
    expect(screen.getByText('Formato 3.3 Alta Cliente.pdf')).toBeInTheDocument();
    expect(screen.getByText('PDF')).toBeInTheDocument();
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

  it('requires fresh Sales authentication before rendering any authorization command control', async () => {
    const authorize = vi.fn(async () => undefined);
    const reauthenticate = vi.fn(async () => undefined);
    render(<SalesAuthorizationPage
      workspace={workspace}
      reauthenticationRequired
      onSaveDraft={vi.fn()}
      onFreeze={vi.fn()}
      onReauthenticate={reauthenticate}
      onAuthorize={authorize}
    />);
    expect(screen.queryByRole('checkbox', { name: /exact recipients, content and attachments/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /authorize outbound payload/i })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/no authorization command will be sent yet/i);
    await userEvent.click(screen.getByRole('button', { name: /authenticate sales to authorize/i }));
    expect(reauthenticate).toHaveBeenCalledOnce();
    expect(authorize).not.toHaveBeenCalled();
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
