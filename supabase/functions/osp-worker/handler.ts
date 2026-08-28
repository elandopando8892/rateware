function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

async function safeEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([
    sha256(left),
    sha256(right),
  ]);
  let difference = 0;
  for (let index = 0; index < leftHash.length; index += 1) {
    difference |= leftHash[index] ^ rightHash[index];
  }
  return difference === 0;
}

async function authorized(
  request: Request,
  expectedToken: string,
): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]{32,4096})$/.exec(header);
  return match !== null && await safeEqual(match[1], expectedToken);
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;

type XlsxDocumentExtractCanary = {
  organizationId: string;
  caseId: string;
  jobId: string;
  documentVersionId: string;
  sourceSha256: string;
};

export function createOspWorkerHandler(deps: {
  expectedToken: string;
  enqueue(limit: number): Promise<number>;
  run(limit: number): Promise<number>;
  runXlsxDocumentExtractCanary?: (
    input: XlsxDocumentExtractCanary,
  ) => Promise<number>;
}): (request: Request) => Promise<Response> {
  if (deps.expectedToken.length < 32) {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return json(405, { error: "POST_REQUIRED" });
    if (!await authorized(request, deps.expectedToken)) {
      return json(401, { error: "UNAUTHORIZED" });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return json(400, { error: "INVALID_REQUEST" });
    }
    const keys = Object.keys(body).sort();
    if (body.action === "drain_rateware_gmail") {
      if (keys.some((key) => !["action", "limit"].includes(key))) {
        return json(400, { error: "INVALID_REQUEST" });
      }
      const limit = body.limit === undefined ? 10 : Number(body.limit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) {
        return json(400, { error: "INVALID_LIMIT" });
      }
      try {
        const enqueued = await deps.enqueue(limit);
        let processed = 0;
        let batches = 0;
        while (batches < 3) {
          const current = await deps.run(limit);
          processed += current;
          batches += 1;
          if (current < limit) break;
        }
        return json(200, { enqueued, processed, batches });
      } catch {
        return json(503, { error: "WORKER_UNAVAILABLE" });
      }
    }

    const canaryKeys = [
      "action",
      "caseId",
      "documentVersionId",
      "jobId",
      "organizationId",
      "sourceSha256",
    ];
    if (
      body.action !== "run_xlsx_document_extract_canary" ||
      keys.length !== canaryKeys.length ||
      keys.some((key, index) => key !== canaryKeys[index]) ||
      typeof body.organizationId !== "string" ||
      typeof body.caseId !== "string" ||
      typeof body.jobId !== "string" ||
      typeof body.documentVersionId !== "string" ||
      typeof body.sourceSha256 !== "string" ||
      !UUID.test(body.organizationId) ||
      !UUID.test(body.caseId) ||
      !UUID.test(body.jobId) ||
      !UUID.test(body.documentVersionId) ||
      !SHA256.test(body.sourceSha256)
    ) return json(400, { error: "INVALID_REQUEST" });
    if (!deps.runXlsxDocumentExtractCanary) {
      return json(409, { error: "CANARY_DISABLED" });
    }
    try {
      const processed = await deps.runXlsxDocumentExtractCanary({
        organizationId: body.organizationId,
        caseId: body.caseId,
        jobId: body.jobId,
        documentVersionId: body.documentVersionId,
        sourceSha256: body.sourceSha256,
      });
      return processed === 1
        ? json(200, { processed })
        : json(409, { error: "CANARY_NOT_READY" });
    } catch {
      return json(503, { error: "WORKER_UNAVAILABLE" });
    }
  };
}
