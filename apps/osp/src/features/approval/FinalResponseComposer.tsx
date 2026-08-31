import { useState } from 'react';

import type { ApprovalCommunicationsWorkspace } from '../../api/contracts';

export type FinalResponseDraftFields = {
  payloadId: string;
  to: readonly string[];
  cc: readonly string[];
  subject: string;
  bodyText: string;
  inReplyTo: string | null;
  references: readonly string[];
};

type SignedPackage = NonNullable<ApprovalCommunicationsWorkspace['signedPackage']>;
type ReplyContext = NonNullable<ApprovalCommunicationsWorkspace['replyContext']>;

const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;
const MESSAGE_ID = /^<[\x21-\x3d\x3f-\x7e]+@[A-Za-z0-9.-]+>$/;

function recipients(value: string): readonly string[] | null {
  const parsed = value.split(/[,;\n]+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  return parsed.length <= 50 && parsed.every((email) => EMAIL.test(email)) && new Set(parsed).size === parsed.length
    ? parsed
    : null;
}

function messageIds(value: string): readonly string[] | null {
  const parsed = value.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  return parsed.length <= 50 && parsed.every((messageId) => MESSAGE_ID.test(messageId)) && new Set(parsed).size === parsed.length
    ? parsed
    : null;
}

function hasForbiddenControl(value: string, body: boolean): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x7f || (body ? code === 0 || code === 0x0b || code === 0x0c : code < 0x20)) return true;
  }
  return false;
}

const defaultBody = 'Hello,\n\nPlease find attached the completed and signed XBF supplier registration package.\n\nRegards,\nXBF';

export function FinalResponseComposer({ signedPackage, replyContext, initialBodyText, revision = false, onDirtyChange, onSave }: {
  signedPackage: SignedPackage;
  replyContext: ReplyContext;
  initialBodyText?: string;
  revision?: boolean;
  onDirtyChange?(dirty: boolean): void;
  onSave(input: FinalResponseDraftFields): Promise<void>;
}) {
  const [payloadId] = useState(() => crypto.randomUUID());
  const [bodyText, setBodyText] = useState(initialBodyText ?? defaultBody);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setError(null);
    const to = recipients(replyContext.to.join(','));
    const cc = recipients(replyContext.cc.join(','));
    const references = messageIds(replyContext.references.join(' '));
    const replyHeader = replyContext.inReplyTo;
    const combined = to && cc ? [...to, ...cc] : [];
    if (!to || to.length === 0 || !cc || new Set(combined).size !== combined.length) return setError('The captured reply recipients are invalid. Reload the case before retrying.');
    if (replyContext.subject.length < 1 || replyContext.subject.length > 998 || replyContext.subject.trim() !== replyContext.subject || hasForbiddenControl(replyContext.subject, false)) return setError('The captured reply subject is invalid. Reload the case before retrying.');
    if (bodyText.trim().length < 1 || bodyText.length > 100_000 || hasForbiddenControl(bodyText, true)) return setError('Enter a valid response body.');
    if (!MESSAGE_ID.test(replyHeader) || !references || references.length === 0) return setError('The captured email thread is invalid. Reload the case before retrying.');
    setPending(true);
    try {
      await onSave({ payloadId, to, cc, subject: replyContext.subject, bodyText, inReplyTo: replyHeader, references });
      onDirtyChange?.(false);
    } catch {
      setError('The internal draft was not saved. No message was sent. Reload the current case before retrying.');
    } finally {
      setPending(false);
    }
  };

  return <section className="outbound-composer" aria-labelledby="draft-title">
    <div className="outbound-composer-heading">
      <div><p className="eyebrow">{revision ? 'CORRECTED VERSION · NO SEND' : 'INTERNAL DRAFT · NO SEND'}</p><h2 id="draft-title">{revision ? 'Correct final response' : 'Compose final response'}</h2></div>
      <p role="status">Saving creates an append-only internal version. It cannot send email.</p>
    </div>
    <div className="outbound-field-grid">
      <label><span>From</span><input value="carriers@xbfreight.com" readOnly aria-readonly="true" /></label>
      <label><span>To · captured</span><input value={replyContext.to.join(', ')} readOnly aria-readonly="true" /></label>
      <label><span>Cc · captured</span><input value={replyContext.cc.join(', ')} readOnly aria-readonly="true" /></label>
      <label className="outbound-wide-field"><span>Subject · captured</span><input value={replyContext.subject} readOnly aria-readonly="true" /></label>
      <label className="outbound-wide-field"><span>Body</span><textarea value={bodyText} onChange={(event) => { const next = event.target.value; setBodyText(next); onDirtyChange?.(next !== (initialBodyText ?? defaultBody)); }} maxLength={100_000} rows={9} required /></label>
      <label><span>In-Reply-To · captured</span><input value={replyContext.inReplyTo} readOnly aria-readonly="true" /></label>
      <label><span>References · captured</span><input value={replyContext.references.join(' ')} readOnly aria-readonly="true" /></label>
    </div>
    <section className="outbound-attachment" aria-labelledby="attachment-title">
      <div><p className="eyebrow">LOCKED ATTACHMENT</p><h3 id="attachment-title">Current signed package</h3></div>
      <dl><div><dt>Package</dt><dd><code>{signedPackage.packageId}</code></dd></div><div><dt>Type</dt><dd>{signedPackage.contentType === 'application/pdf' ? 'PDF' : 'XLSX'}</dd></div><div><dt>SHA-256</dt><dd><code>{signedPackage.outputSha256}</code></dd></div></dl>
      <p>The attachment is fixed by the signed package record and cannot be replaced in this composer.</p>
    </section>
    {error ? <p role="alert">{error}</p> : null}
    <div className="workflow-actions"><button type="button" disabled={pending} onClick={() => void submit()}>{pending ? 'Saving internal version…' : revision ? 'Save corrected version' : 'Save internal draft'}</button></div>
  </section>;
}
