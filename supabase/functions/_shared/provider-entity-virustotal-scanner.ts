// VirusTotal Private Scanning adapter for the Entity Vault document processor.
//
// Private Scanning (Enterprise) is used deliberately: uploaded files are scanned
// WITHOUT being shared with the VirusTotal community, so the company's own tax,
// bank and identity documents never leave a private boundary. The public
// /api/v3/files endpoint would redistribute them and must never be used here.
//
// It also supplies the deterministic filename classifier the processor needs, so a
// document's type and sensitivity come from the same reviewed rules the importer
// planned with — never from the model, never guessed.
import { classifyDocument } from './provider-entity-import.mjs';

const VT_BASE = 'https://www.virustotal.com/api/v3';
// Private direct upload accepts files up to 32 MB; the vault caps ingestion at
// 25 MB, so every vault document fits a direct upload.
const DIRECT_UPLOAD_LIMIT = 32 * 1024 * 1024;

type ScanResult = { status: 'clean' | 'infected' | 'error'; engine: string; reference?: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Builds the processor dependency: a scanner backed by VirusTotal Private Scanning
 * and the deterministic filename classifier. `now`/`sleep` are injectable so the
 * poll loop is testable.
 */
export function createVirusTotalProcessor(apiKey: string, options: {
  pollIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
} = {}) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('VirusTotal API key is required.');
  const pollIntervalMs = options.pollIntervalMs ?? 4000;
  const timeoutMs = options.timeoutMs ?? 100000;
  const doFetch = options.fetchImpl ?? fetch;

  async function scan(bytes: Uint8Array, context: { mimeType: string; filename: string }): Promise<ScanResult> {
    try {
      if (bytes.byteLength > DIRECT_UPLOAD_LIMIT) {
        return { status: 'error', engine: 'virustotal-private', reference: 'file_exceeds_direct_upload_limit' };
      }
      // 1. Upload for PRIVATE analysis. The private endpoint does not share the file.
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: context.mimeType || 'application/octet-stream' }), context.filename || 'document');
      const upload = await doFetch(`${VT_BASE}/private/files`, {
        method: 'POST',
        headers: { 'x-apikey': key },
        body: form,
      });
      if (!upload.ok) {
        const detail = await upload.text().catch(() => '');
        // Diagnostic only: VT upload responses carry no document content, just an
        // error envelope. Logged to locate a tier/endpoint problem, not the file.
        console.error('VT_UPLOAD_FAILED', upload.status, detail.slice(0, 200));
        return { status: 'error', engine: 'virustotal-private', reference: `upload_http_${upload.status}` };
      }
      const uploadBody = await upload.json();
      const analysisId = uploadBody?.data?.id;
      if (!analysisId) {
        console.error('VT_NO_ANALYSIS_ID', JSON.stringify(uploadBody).slice(0, 200));
        return { status: 'error', engine: 'virustotal-private', reference: 'no_analysis_id' };
      }

      // 2. Poll the private analysis until it completes or the bound elapses.
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        await sleep(pollIntervalMs);
        const analysis = await doFetch(`${VT_BASE}/private/analyses/${encodeURIComponent(analysisId)}`, {
          headers: { 'x-apikey': key },
        });
        if (!analysis.ok) continue;
        const body = await analysis.json();
        const attributes = body?.data?.attributes || {};
        if (attributes.status !== 'completed') continue;
        const stats = attributes.stats || {};
        const malicious = Number(stats.malicious || 0);
        const suspicious = Number(stats.suspicious || 0);
        // Any malicious or suspicious detection is treated as infected — the
        // processor then quarantines rather than promotes.
        if (malicious > 0 || suspicious > 0) {
          return { status: 'infected', engine: 'virustotal-private', reference: String(analysisId) };
        }
        return { status: 'clean', engine: 'virustotal-private', reference: String(analysisId) };
      }
      // A timed-out scan is an error, not a clean result: never promote on silence.
      return { status: 'error', engine: 'virustotal-private', reference: `timeout_${analysisId}` };
    } catch (error) {
      return {
        status: 'error',
        engine: 'virustotal-private',
        reference: String((error as Error)?.message || 'scan_failed').slice(0, 80),
      };
    }
  }

  async function classify(_bytes: Uint8Array, context: { mimeType: string; filename: string }) {
    const result = classifyDocument(context.filename || '');
    if (result.requires_human_classification) {
      // The processor sees needs_review and routes the document to human
      // classification instead of promoting it — the two unnamed files land here.
      return { status: 'needs_review' as const };
    }
    return {
      status: 'classified' as const,
      documentType: result.document_type,
      sensitivity: result.sensitivity,
      // The filename rules are deterministic; a match is high confidence by
      // construction, clearing the processor's 0.8 floor.
      confidence: 0.95,
    };
  }

  return { scan, classify };
}
