import type { EvidenceItem, EvidenceLocator } from '../_shared/osp/extraction-contracts.ts';

const API_VERSION = '2024-11-30';
const MODEL_ID = 'prebuilt-layout';
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const MAX_POLLS = 20;
const MAX_PAGES = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']);

type RequestPort = (input: string | URL, init?: RequestInit) => Promise<Response>;
type SourceSafety = 'safe' | 'pending' | 'unsafe';
type Classification = { documentType: string; confidence: number; pageRanges: Array<{ firstPage: number; lastPage: number }> };
type PdfEvidence = EvidenceItem & { locator: Extract<EvidenceLocator, { kind: 'pdf_region' }> };

export type AzureAnalysis = {
  modelVersion: 'prebuilt-layout@2024-11-30';
  evidence: PdfEvidence[];
  classifications: Classification[];
};

function record(value: unknown, code = 'AZURE_INVALID_RESPONSE'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function string(value: unknown, code = 'AZURE_INVALID_RESPONSE'): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > 100_000) throw new Error(code);
  return value;
}

function finite(value: unknown, code = 'AZURE_INVALID_RESPONSE'): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(code);
  return value;
}

function polygon(value: unknown): number[] {
  if (!Array.isArray(value) || value.length < 8 || value.length % 2 !== 0 || value.length > 64) throw new Error('AZURE_INVALID_RESPONSE');
  const result = value.map((coordinate) => finite(coordinate));
  if (result.some((coordinate) => coordinate < 0)) throw new Error('AZURE_INVALID_RESPONSE');
  return result;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function endpointUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (value.trim() !== value || url.protocol !== 'https:' || !url.hostname.endsWith('.cognitiveservices.azure.com') ||
      url.hostname === 'cognitiveservices.azure.com' || url.username || url.password || url.port || url.search || url.hash ||
      (url.pathname !== '/' && url.pathname !== '')) throw new Error('AZURE_CONFIGURATION_INVALID');
    return url;
  } catch {
    throw new Error('AZURE_CONFIGURATION_INVALID');
  }
}

function requireApiKey(value: string): string {
  if (value.trim() !== value || value.length < 1 || value.length > 512 || /[\r\n]/.test(value)) throw new Error('AZURE_CONFIGURATION_INVALID');
  return value;
}

function providerError(response: Response): Error {
  return response.status === 429 || response.status >= 500 ? new Error('AZURE_TEMPORARY') : new Error('AZURE_INVALID_RESPONSE');
}

function operationUrl(value: string | null, endpoint: URL): URL {
  if (!value) throw new Error('AZURE_OPERATION_INVALID');
  try {
    const url = new URL(value);
    if (url.origin !== endpoint.origin) throw new Error('AZURE_OPERATION_ORIGIN_INVALID');
    if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
      !url.pathname.startsWith('/documentintelligence/documentModels/') || url.searchParams.get('api-version') !== API_VERSION ||
      [...url.searchParams.keys()].some((key) => key !== 'api-version')) throw new Error('AZURE_OPERATION_INVALID');
    return url;
  } catch (error) {
    if (error instanceof Error && error.message === 'AZURE_OPERATION_ORIGIN_INVALID') throw error;
    throw new Error('AZURE_OPERATION_INVALID');
  }
}

async function normalize(value: unknown, sourceVersionId: string): Promise<AzureAnalysis> {
  const envelope = record(value);
  if (envelope.status !== 'succeeded') throw new Error('AZURE_INVALID_RESPONSE');
  const result = record(envelope.analyzeResult);
  if (result.apiVersion !== API_VERSION || result.modelId !== MODEL_ID) throw new Error('AZURE_INVALID_RESPONSE');
  if (!Array.isArray(result.pages) || result.pages.length < 1 || result.pages.length > MAX_PAGES) throw new Error('AZURE_INVALID_RESPONSE');
  const evidence: PdfEvidence[] = [];
  for (const pageValue of result.pages) {
    const page = record(pageValue);
    const pageNumber = finite(page.pageNumber);
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) throw new Error('AZURE_INVALID_RESPONSE');
    if (!Array.isArray(page.lines) || page.lines.length > 50_000) throw new Error('AZURE_INVALID_RESPONSE');
    for (let index = 0; index < page.lines.length; index += 1) {
      const line = record(page.lines[index]);
      const content = string(line.content);
      const contentSha256 = await sha256(content);
      evidence.push({
        id: `pdf:p${pageNumber}:l${index + 1}`,
        locator: { kind: 'pdf_region', sourceVersionId, page: pageNumber, polygon: polygon(line.polygon), rawEvidenceHash: contentSha256 },
        content,
        contentSha256,
      });
    }
  }
  const classifications: Classification[] = [];
  if (result.documents !== undefined) {
    if (!Array.isArray(result.documents) || result.documents.length > 1_000) throw new Error('AZURE_INVALID_RESPONSE');
    for (const documentValue of result.documents) {
      const document = record(documentValue);
      const documentType = string(document.docType);
      if (!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(documentType)) throw new Error('AZURE_INVALID_RESPONSE');
      const confidence = finite(document.confidence);
      if (confidence < 0 || confidence > 1 || !Array.isArray(document.boundingRegions) || document.boundingRegions.length < 1) throw new Error('AZURE_INVALID_RESPONSE');
      const pages = document.boundingRegions.map((region) => {
        const pageNumber = finite(record(region).pageNumber);
        if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) throw new Error('AZURE_INVALID_RESPONSE');
        return pageNumber;
      });
      classifications.push({ documentType, confidence, pageRanges: [{ firstPage: Math.min(...pages), lastPage: Math.max(...pages) }] });
    }
  }
  return { modelVersion: 'prebuilt-layout@2024-11-30', evidence, classifications };
}

export function createAzureDocumentIntelligence(options: { endpoint: string; apiKey: string; request: RequestPort; sleep?: (milliseconds: number) => Promise<void> }) {
  const endpoint = endpointUrl(options.endpoint);
  const apiKey = requireApiKey(options.apiKey);
  if (typeof options.request !== 'function') throw new Error('AZURE_CONFIGURATION_INVALID');
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  return Object.freeze({
    async analyze(input: { sourceVersionId: string; sourceSafety: SourceSafety; contentType: string; bytes: Uint8Array }): Promise<AzureAnalysis> {
      if (!UUID_PATTERN.test(input.sourceVersionId)) throw new Error('SOURCE_VERSION_ID_INVALID');
      if (input.sourceSafety !== 'safe') throw new Error('SOURCE_NOT_SAFE');
      if (!CONTENT_TYPES.has(input.contentType)) throw new Error('DOCUMENT_CONTENT_TYPE_INVALID');
      if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error('DOCUMENT_SIZE_INVALID');
      const analyzeUrl = new URL(`/documentintelligence/documentModels/${MODEL_ID}:analyze`, endpoint);
      analyzeUrl.searchParams.set('api-version', API_VERSION);
      const submitted = await options.request(analyzeUrl, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { 'Ocp-Apim-Subscription-Key': apiKey, 'Content-Type': input.contentType }, body: input.bytes as unknown as BodyInit,
      });
      if (submitted.status !== 202) throw providerError(submitted);
      const pollUrl = operationUrl(submitted.headers.get('operation-location'), endpoint);
      for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
        const polled = await options.request(pollUrl, {
          method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000),
          headers: { 'Ocp-Apim-Subscription-Key': apiKey },
        });
        if (!polled.ok) throw providerError(polled);
        let payload: unknown;
        try { payload = await polled.json(); } catch { throw new Error('AZURE_INVALID_RESPONSE'); }
        const status = record(payload).status;
        if (status === 'succeeded') return await normalize(payload, input.sourceVersionId);
        if (status === 'failed') throw new Error('AZURE_ANALYSIS_FAILED');
        if (status !== 'running' && status !== 'notStarted') throw new Error('AZURE_INVALID_RESPONSE');
        await sleep(250);
      }
      throw new Error('AZURE_TEMPORARY');
    },
  });
}
