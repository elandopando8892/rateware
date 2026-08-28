export type ScheduledGmailPollReceipt = Readonly<{
  discovered: number;
  insertedMessages: number;
  duplicates: number;
  attachmentMetadataRows: number;
  ospEnqueued: number;
  ospProcessed: number;
}>;

export type ScheduledGmailPollHandlerOptions = Readonly<{
  expectedToken: string;
  claim(): Promise<Readonly<{ status: 'claimed'; leaseId: string }> | Readonly<{ status: 'disabled' | 'busy' }>>;
  poll(): Promise<ScheduledGmailPollReceipt>;
  complete(receipt: ScheduledGmailPollReceipt, leaseId: string): Promise<void>;
  fail(leaseId: string): Promise<void>;
  incidentId?: () => string;
}>;

const MAX_BODY_BYTES = 96;
const NO_STORE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  pragma: 'no-cache',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: NO_STORE_HEADERS });
}

function exactToken(actual: string, expected: string): boolean {
  const left = new TextEncoder().encode(actual);
  const right = new TextEncoder().encode(expected);
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return mismatch === 0;
}

async function strictBody(request: Request): Promise<void> {
  if (request.headers.get('transfer-encoding')) throw new Error('INVALID_REQUEST');
  const encoding = request.headers.get('content-encoding');
  if (encoding && encoding.trim().toLowerCase() !== 'identity') throw new Error('INVALID_REQUEST');
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw new Error('INVALID_REQUEST');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('INVALID_REQUEST');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('INVALID_REQUEST');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_REQUEST');
  const record = body as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(',') !== 'action,version' ||
    record.version !== 1 || record.action !== 'poll_connected_provider_mailbox'
  ) throw new Error('INVALID_REQUEST');
}

function safeReceipt(receipt: ScheduledGmailPollReceipt): ScheduledGmailPollReceipt {
  for (const value of Object.values(receipt)) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 100_000) throw new Error('INVALID_RECEIPT');
  }
  return receipt;
}

export function createScheduledGmailPollHandler(options: ScheduledGmailPollHandlerOptions) {
  const incidentId = options.incidentId ?? (() => crypto.randomUUID());
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED', incident_id: incidentId() } }, 405);
      const match = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/);
      if (!match || !exactToken(match[1], options.expectedToken)) {
        return json({ error: { code: 'UNAUTHORIZED', incident_id: incidentId() } }, 401);
      }
      await strictBody(request);
      const claim = await options.claim();
      if (claim.status !== 'claimed') {
        return json({
          version: 1,
          data: { status: 'skipped', reason: claim.status, outbound_enabled: false },
        }, 200);
      }
      try {
        const receipt = safeReceipt(await options.poll());
        await options.complete(receipt, claim.leaseId);
        return json({
          version: 1,
          data: {
            status: 'completed',
            discovered: receipt.discovered,
            inserted_messages: receipt.insertedMessages,
            duplicates: receipt.duplicates,
            attachment_metadata_rows: receipt.attachmentMetadataRows,
            osp_enqueued: receipt.ospEnqueued,
            osp_processed: receipt.ospProcessed,
            outbound_enabled: false,
          },
        }, 200);
      } catch {
        await options.fail(claim.leaseId).catch(() => undefined);
        return json({ error: { code: 'DEPENDENCY_UNAVAILABLE', incident_id: incidentId() } }, 503);
      }
    } catch {
      return json({ error: { code: 'INVALID_REQUEST', incident_id: incidentId() } }, 400);
    }
  };
}
