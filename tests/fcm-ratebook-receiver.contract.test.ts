function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

const { FCM_RATEBOOK_ACTION_CONTRACT_EXTENSION } = await import(
  "../supabase/functions/_shared/action-contract-fcm-ratebook.mjs"
);

Deno.test("registers the explicitly approved RateBook receiver action", () => {
  const surface = FCM_RATEBOOK_ACTION_CONTRACT_EXTENSION.surfaces[0];
  assertEquals(surface.canonicalId, "edge.fcm-ratebook-receiver.receive_fcm_ratebook");
  assertEquals(surface.decisionStatus, "explicitly_allowed");
});

async function assertRejects(run: () => Promise<unknown>, message: RegExp) {
  try {
    await run();
  } catch (error) {
    const actual = error instanceof Error ? error.message : String(error);
    if (message.test(actual)) return;
    throw new Error(`Expected rejection ${message}, received ${actual}.`);
  }
  throw new Error(`Expected rejection ${message}, but the promise resolved.`);
}

const originalServe = Deno.serve;
Object.defineProperty(Deno, "serve", {
  configurable: true,
  value: () => ({
    finished: Promise.resolve(),
    shutdown: () => Promise.resolve(),
    ref: () => {},
    unref: () => {}
  })
});

const { receiveFcmRateBook, receiverErrorStatus, validateFcmRateBookPackage } = await import(
  "../supabase/functions/fcm-ratebook-receiver/index.ts"
);
Object.defineProperty(Deno, "serve", { configurable: true, value: originalServe });

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function validRequest() {
  const payload = {
    contractVersion: "fcm.rateware-ratebook.v1",
    mode: "READ_ONLY",
    source: {
      system: "Freight Cost Model",
      organizationId: "org-fcm-1",
      rateBookId: "rb-1",
      exportedAt: "2026-08-20T12:00:00.000Z"
    },
    governance: {
      status: "PUBLISHED",
      publishedAt: "2026-08-20T11:59:00.000Z",
      publicationNote: "Approved pilot handoff."
    },
    rateBook: {
      code: "XBF-XB-PILOT-2026-08",
      name: "XBF Cross-border Pilot",
      currency: "USD",
      effectiveFrom: "2026-08-20T00:00:00.000Z",
      effectiveUntil: null
    },
    lineage: {
      costBase: {
        id: "base-1",
        code: "XBF-XB-PILOT",
        name: "XBF Cross-border Pilot",
        scope: "CROSS_BORDER",
        status: "ACTIVE"
      },
      assumptionSet: {
        id: "set-1",
        name: "Pilot assumptions",
        version: 1,
        status: "PUBLISHED"
      }
    },
    entries: [{
      sourceQuoteId: "quote-1",
      sourceQuoteVersion: 1,
      sourceProductionRouteId: "route-1",
      origin: "Monterrey, NL",
      destination: "Dallas, TX",
      operation: "D2D Export",
      service: "One Way",
      equipment: "Truck / Dry Van",
      config: "Single",
      publishedTariff: 2100,
      currency: "USD",
      sourceTariffUsd: 2100,
      sourceTariffMxn: 39900,
      fxRateUsed: 19
    }]
  };
  const payloadChecksum = await sha256Hex(JSON.stringify(payload));
  const idempotencyKey = await sha256Hex(
    `fcm.rateware-ratebook.v1:org-fcm-1:rb-1:${payloadChecksum}`
  );
  return {
    idempotencyKey,
    body: { idempotency_key: idempotencyKey, package: payload }
  };
}

const user = {
  owner_email: "org:org_dbc2fd12c76",
  owner_user_id: "kinde-user-1",
  organization_id: "org_dbc2fd12c76",
  canonical_tenant_id: "33333333-3333-4333-8333-333333333333",
  identity_id: "identity-1",
  tenant_enforcement_mode: "required" as const
};

Deno.test("maps a missing Kinde bearer token to an authentication response", () => {
  assertEquals(receiverErrorStatus(new Error("Kinde bearer token is required.")), 401);
  assertEquals(receiverErrorStatus(new Error("Unexpected receiver failure.")), 500);
});

Deno.test("accepts a tenant-bound published FCM RateBook package", async () => {
  const request = await validRequest();
  const result = await validateFcmRateBookPackage(
    user,
    request.body,
    request.idempotencyKey
  );
  assertEquals(result.sourceOrganizationId, "org-fcm-1");
  assertEquals(result.sourceRateBookId, "rb-1");
  assertEquals(result.idempotencyKey, request.idempotencyKey);
});

Deno.test("rejects RateBook payload drift under the approved idempotency key", async () => {
  const request = await validRequest();
  const payload = request.body.package as Record<string, unknown>;
  const lineage = payload.lineage as Record<string, unknown>;
  const costBase = lineage.costBase as Record<string, unknown>;
  costBase.name = "Changed after approval";

  await assertRejects(
    () => validateFcmRateBookPackage(user, request.body, request.idempotencyKey),
    /idempotency key is invalid/
  );
});

Deno.test("rejects an incomplete or non-governed RateBook", async () => {
  const request = await validRequest();
  const payload = request.body.package as Record<string, unknown>;
  const lineage = payload.lineage as Record<string, unknown>;
  const costBase = lineage.costBase as Record<string, unknown>;
  costBase.status = "ARCHIVED";

  await assertRejects(
    () => validateFcmRateBookPackage(user, request.body, request.idempotencyKey),
    /active cost base/
  );
});

function receiptStore() {
  const rows: Record<string, unknown>[] = [];
  return {
    rows,
    client: {
      from(table: string) {
        if (table !== "fcm_ratebook_receipts") {
          throw new Error(`Unexpected table ${table}.`);
        }
        const filters: Record<string, unknown> = {};
        const query = {
          select() { return query; },
          eq(field: string, value: unknown) { filters[field] = value; return query; },
          async maybeSingle() {
            return {
              data: rows.find((row) => Object.entries(filters).every(([key, value]) => row[key] === value)) || null,
              error: null
            };
          },
          insert(input: Record<string, unknown>) {
            const row = {
              id: `receipt-${rows.length + 1}`,
              created_at: "2026-08-20T13:00:00.000Z",
              ...input
            };
            rows.push(row);
            return {
              select() {
                return { async single() { return { data: row, error: null }; } };
              }
            };
          }
        };
        return query;
      }
    }
  };
}

Deno.test("persists one durable RateBook receipt and reconciles an exact retry", async () => {
  const store = receiptStore();
  const request = await validRequest();
  const first = await receiveFcmRateBook(
    store.client as never,
    user,
    request.body,
    request.idempotencyKey
  );
  const retry = await receiveFcmRateBook(
    store.client as never,
    user,
    request.body,
    request.idempotencyKey
  );

  assertEquals(first.status, 202);
  assertEquals(first.body.accepted, true);
  assertEquals(first.body.duplicate, false);
  assertEquals(first.body.receipt_id, "receipt-1");
  assertEquals(retry.status, 200);
  assertEquals(retry.body.duplicate, true);
  assertEquals(store.rows.length, 1);
  assertEquals(store.rows[0].source_ratebook_id, "rb-1");
  assertEquals(store.rows[0].status, "received");
});
