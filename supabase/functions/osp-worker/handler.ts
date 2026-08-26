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

export function createOspWorkerHandler(deps: {
  expectedToken: string;
  enqueue(limit: number): Promise<number>;
  run(limit: number): Promise<number>;
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
    if (
      body.action !== "drain_rateware_gmail" ||
      keys.some((key) => !["action", "limit"].includes(key))
    ) return json(400, { error: "INVALID_REQUEST" });

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
  };
}
