import { useState } from 'react';

import type { CaseDetail } from '../../api/contracts';
import type { HistoricalGmailImportResult } from '../../api/contracts';
import type { OspClient } from '../../api/osp-client';

type HistoricalIntake = NonNullable<CaseDetail['historical_intake']>;
type HistoricalClient = Partial<Pick<OspClient, 'previewHistoricalGmailSearch' | 'importHistoricalGmailMessage'>>;

export function HistoricalIntakePanel({ intake, subject, client }: {
  intake: HistoricalIntake | null;
  subject?: string | null;
  client?: HistoricalClient;
}) {
  const [candidate, setCandidate] = useState<Awaited<ReturnType<NonNullable<HistoricalClient['previewHistoricalGmailSearch']>>>['candidates'][number] | null>(null);
  const [verifiedCandidateCount, setVerifiedCandidateCount] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<'verify' | 'import' | null>(null);
  const [receipt, setReceipt] = useState<HistoricalGmailImportResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [subjectPhrase, setSubjectPhrase] = useState(subject ?? '');
  const [afterDate, setAfterDate] = useState(intake?.after_date ?? '');
  const [beforeDate, setBeforeDate] = useState(intake?.before_date ?? '');
  if (!intake) return null;
  const exactQuery = `in:anywhere subject:"${subjectPhrase}" after:${afterDate.replaceAll('-', '/')} before:${beforeDate.replaceAll('-', '/')}`;
  const searchWindowDays = (Date.parse(`${beforeDate}T00:00:00Z`) - Date.parse(`${afterDate}T00:00:00Z`)) / 86_400_000;
  const invalidSubjectCharacter = [...subjectPhrase].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 || character === '"' || character === '\\';
  });
  const validCriteria = subjectPhrase.length >= 3 && subjectPhrase.length <= 200 &&
    subjectPhrase.trim() === subjectPhrase && !invalidSubjectCharacter &&
    /^\d{4}-\d{2}-\d{2}$/.test(afterDate) && /^\d{4}-\d{2}-\d{2}$/.test(beforeDate) &&
    searchWindowDays >= 1 && searchWindowDays <= 31;
  const canRecover = Boolean(validCriteria && client?.previewHistoricalGmailSearch && client.importHistoricalGmailMessage);
  const changeCriteria = (change: () => void) => {
    change();
    setCandidate(null);
    setVerifiedCandidateCount(null);
    setConfirmed(false);
    setReceipt(null);
    setFailed(false);
  };
  const verify = async () => {
    if (!validCriteria || !client?.previewHistoricalGmailSearch) return;
    setPending('verify'); setFailed(false);
    try {
      const result = await client.previewHistoricalGmailSearch({ subjectPhrase, afterDate, beforeDate });
      setVerifiedCandidateCount(result.candidates.length);
      if (result.candidates.length !== 1) throw new Error('candidate mismatch');
      setCandidate(result.candidates[0]);
    } catch { setFailed(true); }
    finally { setPending(null); }
  };
  const importCandidate = async () => {
    if (!candidate || !confirmed || !validCriteria || !client?.importHistoricalGmailMessage) return;
    setPending('import'); setFailed(false);
    try {
      setReceipt(await client.importHistoricalGmailMessage({
        subjectPhrase,
        afterDate,
        beforeDate,
        candidateId: candidate.candidate_id,
        idempotencyKey: `historical_gmail:${crypto.randomUUID()}`,
      }));
    } catch { setFailed(true); }
    finally { setPending(null); }
  };
  return (
    <section className="panel historical-intake" aria-labelledby="historical-intake-title">
      <div className="panel-heading historical-intake-heading">
        <div>
          <p className="eyebrow">Historical source recovery</p>
          <h2 id="historical-intake-title">Bounded Gmail preflight</h2>
          <p>The existing intake can locate an older request before any message is persisted or processed.</p>
        </div>
        <span className="read-only-badge">{intake.status === 'preview_only' ? 'Preview only' : 'Imported'}</span>
      </div>
      <dl className="historical-intake-metrics" aria-label="Historical intake preflight">
        <div><dt>Search window</dt><dd>{afterDate} → {beforeDate}</dd></div>
        <div><dt>Candidates</dt><dd>{verifiedCandidateCount ?? intake.candidate_count}</dd></div>
        <div><dt>Replay status</dt><dd>{intake.duplicate_state === 'already_imported' ? 'Already captured' : 'Ready to import'}</dd></div>
      </dl>
      <div className="historical-search-fields" aria-label="Bounded Gmail search criteria">
        <label className="historical-subject-field"><span>Subject phrase</span><input type="text" maxLength={200} value={subjectPhrase} onChange={(event) => changeCriteria(() => setSubjectPhrase(event.target.value))} /></label>
        <label><span>After date</span><input type="text" inputMode="numeric" autoComplete="off" maxLength={10} pattern="\d{4}-\d{2}-\d{2}" placeholder="YYYY-MM-DD" value={afterDate} onChange={(event) => changeCriteria(() => setAfterDate(event.target.value))} /></label>
        <label><span>Before date</span><input type="text" inputMode="numeric" autoComplete="off" maxLength={10} pattern="\d{4}-\d{2}-\d{2}" placeholder="YYYY-MM-DD" value={beforeDate} onChange={(event) => changeCriteria(() => setBeforeDate(event.target.value))} /></label>
      </div>
      <div className="historical-intake-query"><span>Exact Gmail query</span><code>{exactQuery}</code></div>
      <ul className="historical-intake-guards" aria-label="Historical intake safety controls">
        <li><span aria-hidden="true">✓</span><strong>Source preserved</strong><small>Original email and attachment remain unchanged.</small></li>
        <li><span aria-hidden="true">✓</span><strong>Checkpoint unchanged</strong><small>Normal automatic intake does not lose its position.</small></li>
        <li><span aria-hidden="true">✓</span><strong>No external effects</strong><small>No reply, signature, webhook or provider write.</small></li>
      </ul>
      {canRecover ? (
        <div className="historical-intake-action">
          {!candidate ? (
            <button type="button" disabled={!validCriteria || pending !== null} onClick={() => void verify()}>
              {pending === 'verify' ? 'Verifying…' : 'Verify exact candidate'}
            </button>
          ) : (
            <>
              <div className="historical-candidate" aria-label="Verified historical candidate">
                <span>Verified candidate</span>
                <strong>{candidate.subject}</strong>
                <small>{candidate.sender_domain} · {candidate.attachment_count} attachment(s) · {candidate.duplicate_state === 'already_imported' ? 'replay path' : 'new import'}</small>
              </div>
              {!receipt ? (
                <div className="historical-import-confirmation">
                  <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Import only this verified customer-setup request into the existing OSP intake.</label>
                  <button type="button" disabled={!confirmed || pending !== null} onClick={() => void importCandidate()}>{pending === 'import' ? 'Importing…' : candidate.duplicate_state === 'already_imported' ? 'Verify idempotent replay' : 'Import selected request'}</button>
                </div>
              ) : (
                <div className="historical-import-receipt" role="status">
                  <strong>{receipt.import_status === 'replayed' ? 'Replay verified — already captured' : 'Imported into OSP intake'}</strong>
                  <span>{receipt.osp_enqueued} intake job queued · {receipt.attachment_metadata_rows} attachment metadata row(s)</span>
                  <code>Claim {receipt.claim_id.slice(0, 12)}…</code>
                </div>
              )}
            </>
          )}
          {!validCriteria ? <p className="case-warning" role="status">Use a trimmed subject phrase and a search window from 1 to 31 days.</p> : null}
          {failed ? <p className="case-warning" role="alert">The exact candidate changed or could not be verified. Nothing was imported.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
