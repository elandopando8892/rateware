import { useState, type FormEvent } from 'react';

import type { DocumentVersion, QuarterlyDocumentType } from '../../api/contracts';

export type { QuarterlyDocumentType } from '../../api/contracts';

type UploadInput = {
  documentType: QuarterlyDocumentType;
  validFrom: string;
  contentType: string;
  bytes: Uint8Array;
};

type ApprovalInput = {
  versionId: string;
  expectedVersion: number;
  reviewBeforeSha256: string;
  reviewAfterSha256: string;
};

const DOCUMENTS: readonly { type: QuarterlyDocumentType; label: string; accessible: string }[] = [
  { type: 'proof_of_address', label: 'Comprobante de domicilio', accessible: 'proof of address' },
  { type: 'sat_compliance_opinion', label: 'Opinión de cumplimiento SAT', accessible: 'SAT compliance opinion' },
  { type: 'tax_status_certificate', label: 'Constancia de situación fiscal', accessible: 'tax status certificate' },
  { type: 'bank_statement', label: 'Estado de cuenta bancaria', accessible: 'bank statement' },
];
const CONTENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']);
const MAX_BYTES = 26_214_400;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function readFileBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('DOCUMENT_FILE_READ_FAILED'));
    reader.onload = () => reader.result && typeof reader.result !== 'string' ? resolve(new Uint8Array(reader.result)) : reject(new Error('DOCUMENT_FILE_READ_FAILED'));
    reader.readAsArrayBuffer(file);
  });
}

function documentState(referenceDate: string, versions: readonly DocumentVersion[], type: QuarterlyDocumentType) {
  const matching = versions.filter((version) => version.documentType === type);
  const approved = matching.filter((version) => version.status === 'approved').reduce<DocumentVersion | undefined>(
    (latest, version) => !latest || version.version > latest.version ? version : latest,
    undefined,
  );
  if (!approved) {
    const underReview = matching.some((version) => ['uploaded', 'analyzing', 'review_required'].includes(version.status));
    return { status: underReview ? 'under_review' as const : 'missing' as const, expiresAt: null };
  }
  const reference = Date.parse(`${referenceDate}T00:00:00.000Z`);
  const validFrom = Date.parse(`${approved.validFrom}T00:00:00.000Z`);
  const expires = Date.parse(`${approved.expiresAt}T00:00:00.000Z`);
  if (reference < validFrom || reference > expires) return { status: 'missing' as const, expiresAt: approved.expiresAt };
  const daysRemaining = Math.floor((expires - reference) / 86_400_000);
  return { status: daysRemaining <= 30 ? 'expiring' as const : 'current' as const, expiresAt: approved.expiresAt };
}

export function QuarterlyDocumentVault({
  referenceDate,
  versions,
  loading = false,
  loadFailed = false,
  onUploadNewVersion,
  onApproveVersion,
}: {
  referenceDate: string;
  versions: readonly DocumentVersion[];
  loading?: boolean;
  loadFailed?: boolean;
  onUploadNewVersion(input: UploadInput): Promise<{ id: string; version: number; expiresAt: string }>;
  onApproveVersion(input: ApprovalInput): Promise<{ id: string; status: 'approved' }>;
}) {
  const [selectedType, setSelectedType] = useState<QuarterlyDocumentType | null>(null);
  const [validFrom, setValidFrom] = useState(referenceDate);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'upload' | 'approve' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [pendingReview, setPendingReview] = useState<null | { id: string; version: number; sha256: string; fileName: string }>(null);
  const definition = selectedType ? DOCUMENTS.find((item) => item.type === selectedType) : undefined;

  async function stage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedType || !DATE.test(validFrom) || !file || !CONTENT_TYPES.has(file.type) || file.size < 1 || file.size > MAX_BYTES) {
      setFailed(true);
      setNotice(null);
      return;
    }
    setBusy('upload');
    setFailed(false);
    setNotice(null);
    try {
      const bytes = await readFileBytes(file);
      const contentSha256 = await sha256(bytes);
      const receipt = await onUploadNewVersion({ documentType: selectedType, validFrom, contentType: file.type, bytes });
      setPendingReview({ id: receipt.id, version: receipt.version, sha256: contentSha256, fileName: file.name });
      setReviewConfirmed(false);
      setNotice('The immutable version is staged and requires explicit review approval.');
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!pendingReview || !reviewConfirmed) return;
    setBusy('approve');
    setFailed(false);
    setNotice(null);
    try {
      await onApproveVersion({
        versionId: pendingReview.id,
        expectedVersion: pendingReview.version,
        reviewBeforeSha256: pendingReview.sha256,
        reviewAfterSha256: pendingReview.sha256,
      });
      setNotice('The reviewed document version is approved.');
      setPendingReview(null);
      setReviewConfirmed(false);
      setFile(null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  return <section aria-labelledby="quarterly-documents-title">
    <h1 id="quarterly-documents-title">Quarterly corporate documents</h1>
    <p>Currentness evaluated on <time dateTime={referenceDate}>{referenceDate}</time>. Renewal always creates a new immutable version.</p>
    {loading ? <p role="status">Loading document versions…</p> : null}
    {loadFailed || failed ? <p role="alert">The document operation could not be completed. No automatic retry was performed.</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    <ul className="quarterly-document-list">
      {DOCUMENTS.map((item) => {
        const document = documentState(referenceDate, versions, item.type);
        const visible = document.status === 'current' ? 'Current' : document.status === 'expiring' ? 'Expiring soon' : document.status === 'under_review' ? 'Under review' : 'Missing';
        return <li key={item.type}>
          <h2>{item.label}</h2>
          <p role="status" aria-label={`${item.accessible}: ${document.status.replace('_', ' ')}`}>
            {visible}{document.expiresAt ? <> · expires <time dateTime={document.expiresAt}>{document.expiresAt}</time></> : null}
          </p>
          <button type="button" onClick={() => { setSelectedType(item.type); setFile(null); setPendingReview(null); setNotice(null); setFailed(false); }}>Upload new {item.accessible} version</button>
        </li>;
      })}
    </ul>
    {selectedType && definition ? <form onSubmit={(event) => void stage(event)} aria-label={`Upload ${definition.accessible} version`}>
      <h2>Stage {definition.label}</h2>
      <label>Valid from <input type="date" value={validFrom} onChange={(event) => setValidFrom(event.currentTarget.value)} /></label>
      <label>Select {definition.accessible} file <input type="file" accept="application/pdf,image/jpeg,image/png,image/tiff" onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)} /></label>
      <p>Maximum 25 MiB. The file is scanned and stored privately before review.</p>
      <button type="submit" disabled={busy !== null || !file}>{busy === 'upload' ? 'Staging…' : `Stage ${definition.accessible} for review`}</button>
    </form> : null}
    {pendingReview ? <section aria-labelledby="document-review-title">
      <h2 id="document-review-title">Review required</h2>
      <p>File: {pendingReview.fileName}. Version {pendingReview.version}. SHA-256: <code>{pendingReview.sha256}</code></p>
      <label><input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.currentTarget.checked)} /> I reviewed {pendingReview.fileName} and authorize this exact immutable version.</label>
      <button type="button" disabled={!reviewConfirmed || busy !== null} onClick={() => void approve()}>{busy === 'approve' ? 'Approving…' : `Approve reviewed ${pendingReview.fileName}`}</button>
    </section> : null}
  </section>;
}
