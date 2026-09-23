import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { ManualConversionCandidate, OspClient } from '../../api/osp-client';

export type ConversionClient = Pick<OspClient,
  'getManualConversionSource' | 'getManualConversionCandidate' | 'listManualConversionCandidates' |
  'uploadCaseConversion' | 'approveDocumentVersion' | 'recordManualConversionReview'>;

type Attachment = { attachment_id: string; filename: string; source_sha256: string };
const MAX_BYTES = 26_214_400;

export function LegacyConversionPanel({ client, caseId, attachment, onResolved }: {
  client: ConversionClient; caseId: string; attachment: Attachment; onResolved(): Promise<unknown>;
}) {
  const source = { caseId, sourceAttachmentId: attachment.attachment_id, sourceSha256: attachment.source_sha256 };
  const query = useQuery({ queryKey: ['osp', 'legacy-conversion', caseId, attachment.attachment_id, attachment.source_sha256],
    queryFn: () => client.listManualConversionCandidates(source), retry: false, refetchOnWindowFocus: false });
  const [selected, setSelected] = useState<File | null>(null);
  const [busy, setBusy] = useState<'source' | 'candidate' | 'upload' | 'review' | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [candidateUrl, setCandidateUrl] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [sourcePages, setSourcePages] = useState('');
  const [convertedPages, setConvertedPages] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState('');
  const candidates = query.data ?? [];
  const candidate = candidates.find((entry) => entry.id === candidateId) ?? candidates.find((entry) => entry.conversionId === null);
  const pages = Number(sourcePages);
  const samePages = /^(?:[1-9][0-9]{0,2}|1000)$/.test(sourcePages) && sourcePages === convertedPages;

  async function link(kind: 'source' | 'candidate', entry?: ManualConversionCandidate) {
    setBusy(kind); setError(false); setNotice('');
    try {
      if (kind === 'source') {
        const result = await client.getManualConversionSource(source);
        setSourceUrl(result.downloadUrl);
      } else if (entry) {
        const result = await client.getManualConversionCandidate({ ...source, convertedDocumentVersionId: entry.id });
        if (result.convertedSha256 !== entry.convertedSha256) throw new Error('CONVERSION_HASH_MISMATCH');
        setCandidateUrl(result.downloadUrl);
        setCandidateId(entry.id);
      }
      setNotice('Enlace privado listo. Caduca en 60 segundos. Descarga y compara ambos archivos.');
    } catch { setError(true); }
    finally { setBusy(null); }
  }

  async function upload() {
    if (!selected || !/\.docx$/i.test(selected.name) || selected.size < 1 || selected.size > MAX_BYTES) {
      setError(true); return;
    }
    setBusy('upload'); setError(false); setNotice('');
    try {
      const bytes = new Uint8Array(await selected.arrayBuffer());
      const result = await client.uploadCaseConversion({ ...source, bytes });
      setCandidateId(result.id); setCandidateUrl(''); setConfirmed(false);
      setSelected(null);
      await query.refetch();
      setNotice('DOCX guardado como candidato. Revísalo junto con el original antes de aprobar.');
    } catch {
      setError(true);
      setNotice('Si la red falló, revisa los candidatos persistidos antes de volver a subirlo.');
      await query.refetch();
    } finally { setBusy(null); }
  }

  async function review() {
    if (!candidate || candidate.conversionId || !confirmed || !samePages || !sourceUrl || !candidateUrl) return;
    setBusy('review'); setError(false); setNotice('');
    try {
      if (candidate.status === 'review_required') {
        await client.approveDocumentVersion({ versionId: candidate.id, expectedVersion: candidate.version,
          reviewBeforeSha256: candidate.convertedSha256, reviewAfterSha256: candidate.convertedSha256 });
      } else if (candidate.status !== 'approved') throw new Error('CONVERSION_CANDIDATE_UNAVAILABLE');
      await client.recordManualConversionReview({ ...source, convertedDocumentVersionId: candidate.id,
        convertedSha256: candidate.convertedSha256, sourcePageCount: pages,
        convertedPageCount: pages, fidelityConfirmed: true });
      await query.refetch();
      await onResolved();
      setNotice('Conversión aprobada y vinculada al original.');
      setConfirmed(false);
    } catch {
      setError(true);
      setNotice('Revisa el estado persistido antes de intentar de nuevo; no hubo reintento automático.');
      await query.refetch();
    } finally { setBusy(null); }
  }

  return <section className="panel" aria-labelledby={`conversion-${attachment.attachment_id}`}>
    <h3 id={`conversion-${attachment.attachment_id}`}>Conversión supervisada: {attachment.filename}</h3>
    <p>Original preservado · SHA-256 <code>{attachment.source_sha256}</code></p>
    <p>El formato .doc requiere conversión fuera de OSP. No habilites macros ni contenido activo. Confirma visualmente páginas, campos, tablas y texto antes de aprobar.</p>
    <button type="button" disabled={busy !== null} onClick={() => void link('source')}>
      {busy === 'source' ? 'Preparando…' : 'Preparar descarga del original'}
    </button>
    {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" download={attachment.filename}>Descargar original (60 s)</a> : null}
    <label>DOCX convertido <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      disabled={busy !== null} onChange={(event) => setSelected(event.currentTarget.files?.[0] ?? null)} /></label>
    <button type="button" disabled={busy !== null || !selected} onClick={() => void upload()}>
      {busy === 'upload' ? 'Guardando…' : 'Guardar candidato para revisión'}
    </button>
    {query.isPending ? <p role="status">Consultando conversiones guardadas…</p> : null}
    {query.isError ? <p role="alert">No se pudieron consultar los candidatos. No subas otro archivo sin verificar el estado.</p> : null}
    {candidates.length > 0 ? <div>
      <h4>Candidatos persistidos</h4>
      <ul>{candidates.map((entry) => <li key={entry.id}>
        <label><input type="radio" name={`conversion-${attachment.attachment_id}-candidate`} value={entry.id}
          checked={candidate?.id === entry.id} disabled={busy !== null}
          onChange={() => { setCandidateId(entry.id); setCandidateUrl(''); setConfirmed(false); }} />
          Versión {entry.version} · {entry.status} · SHA-256 <code>{entry.convertedSha256}</code>
          {entry.conversionId ? ' · vinculada' : ''}</label>
      </li>)}</ul>
      {candidate && !candidate.conversionId ? <>
        <button type="button" disabled={busy !== null} onClick={() => void link('candidate', candidate)}>
          {busy === 'candidate' ? 'Preparando…' : 'Preparar descarga del DOCX'}
        </button>
        {candidateUrl ? <a href={candidateUrl} target="_blank" rel="noopener noreferrer" download>Descargar DOCX (60 s)</a> : null}
        <div><label>Páginas del original <input type="number" min="1" max="1000" value={sourcePages}
          onChange={(event) => { setSourcePages(event.currentTarget.value); setConfirmed(false); }} /></label>
        <label>Páginas del DOCX <input type="number" min="1" max="1000" value={convertedPages}
          onChange={(event) => { setConvertedPages(event.currentTarget.value); setConfirmed(false); }} /></label></div>
        <label><input type="checkbox" checked={confirmed} disabled={!samePages || !sourceUrl || !candidateUrl || busy !== null}
          onChange={(event) => setConfirmed(event.currentTarget.checked)} /> Comparé ambos archivos: todas las páginas, tablas, campos y texto se conservaron legibles y completos.</label>
        <button type="button" disabled={!confirmed || !samePages || !sourceUrl || !candidateUrl || busy !== null}
          onClick={() => void review()}>{busy === 'review' ? 'Registrando revisión…' : 'Aprobar y vincular esta conversión'}</button>
      </> : null}
    </div> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {error ? <p role="alert">La operación no se confirmó. Consulta el estado antes de reintentar.</p> : null}
  </section>;
}
