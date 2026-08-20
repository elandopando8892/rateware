function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
}

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

const {
  reconcileFcmCustomerQuoteEmailReceipt,
  validateFcmCustomerQuoteEmailPackage
} = await import(
  "../supabase/functions/rateware-api/index.ts"
);
Object.defineProperty(Deno, "serve", { configurable: true, value: originalServe });

const oauthReturnPolicy = await import(
  "../supabase/functions/_shared/oauth-return-policy.ts"
).catch(() => ({} as Record<string, unknown>));

function oauthReturnResolver() {
  const resolver = (oauthReturnPolicy as Record<string, unknown>).resolveOAuthReturnTarget;
  if (typeof resolver !== "function") throw new Error("OAuth return policy must expose resolveOAuthReturnTarget.");
  return resolver as (
    value: string | null | undefined,
    options: { defaultOrigin: string; configuredOrigins?: string | null; fallbackPath?: string }
  ) => string;
}

Deno.test("OAuth return policy accepts only an exact configured origin", () => {
  const resolve = oauthReturnResolver();
  assertEquals(
    resolve("https://freight-cost.example/settings?gmail=connected", {
      defaultOrigin: "https://rateware.example",
      configuredOrigins: "https://freight-cost.example"
    }),
    "https://freight-cost.example/settings?gmail=connected"
  );
});

Deno.test("OAuth return policy rejects an unconfigured or lookalike origin", async () => {
  const resolve = oauthReturnResolver();
  await assertRejects(
    async () => resolve("https://freight-cost.example.attacker.test/settings", {
      defaultOrigin: "https://rateware.example",
      configuredOrigins: "https://freight-cost.example"
    }),
    /OAuth return origin is not allowed/
  );
});

Deno.test("OAuth return policy rejects credentialed and non-HTTP targets", async () => {
  const resolve = oauthReturnResolver();
  for (const target of ["https://user:pass@rateware.example/settings", "javascript:alert(1)"]) {
    await assertRejects(
      async () => resolve(target, {
        defaultOrigin: "https://rateware.example",
        configuredOrigins: "https://freight-cost.example"
      }),
      /OAuth return URL is not allowed/
    );
  }
});

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function validRequest() {
  const sourceOrganizationId = "org-fcm-1";
  const emailDraftId = "draft-1";
  const message = {
    subject: "Cotizacion CQ-1",
    html: "<p>Quote</p>",
    text: "Quote"
  };
  const payloadChecksum = await sha256Hex(JSON.stringify({
    toEmail: "buyer@example.com",
    ...message
  }));
  const idempotencyKey = await sha256Hex(
    `fcm.rateware-gmail-send.v1:${sourceOrganizationId}:${emailDraftId}:${payloadChecksum}`
  );
  return {
    idempotencyKey,
    body: {
      idempotency_key: idempotencyKey,
      package: {
        contractVersion: "fcm.rateware-gmail-send.v1",
        mode: "DELIVER",
        idempotencyKey,
        sourceOrganizationId,
        authorization: {
          actorUserId: "admin-1",
          confirmation: "EXPLICIT_QUOTE_DESK_SEND"
        },
        prepared: {
          contractVersion: "fcm.rateware-gmail-draft.v1",
          mode: "READ_ONLY",
          source: {
            system: "Freight Cost Model",
            emailDraftId,
            customerQuoteId: "quote-1",
            folio: "CQ-1",
            preparedAt: "2026-08-14T12:00:00.000Z"
          },
          governance: {
            status: "PREPARED",
            delivery: "NOT_SENT",
            payloadChecksum,
            template: { id: "template-1", name: "Propuesta" }
          },
          recipient: { email: "buyer@example.com" },
          message,
          preparedBy: { email: "sales@heymarksman.com" }
        }
      }
    }
  };
}

const user = {
  owner_email: "sales@heymarksman.com",
  owner_user_id: "kinde-user-1",
  organization_id: "11111111-1111-4111-8111-111111111111"
};

function tenantGmailConnection(ownerEmail: string | null) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    owner_email: ownerEmail,
    mailbox_email: "sales@heymarksman.com",
    provider: "gmail",
    status: "connected"
  };
}

function validateRequest(
  workspaceUser: typeof user,
  input: Record<string, unknown>,
  idempotencyKey: string,
  gmailConnection: Record<string, unknown> | null = tenantGmailConnection(workspaceUser.owner_email)
) {
  return (validateFcmCustomerQuoteEmailPackage as unknown as (
    user: typeof workspaceUser,
    input: Record<string, unknown>,
    headerIdempotencyKey: string,
    identity: { gmailConnection: Record<string, unknown> | null }
  ) => Promise<Record<string, unknown>>)(workspaceUser, input, idempotencyKey, { gmailConnection });
}

Deno.test("accepts the exact tenant-bound FCM quote email contract", async () => {
  const request = await validRequest();
  const result = await validateRequest(
    user,
    request.body,
    request.idempotencyKey
  );
  assertEquals(result.sourceOrganizationId, "org-fcm-1");
  assertEquals(result.recipientEmail, "buyer@example.com");
  assertEquals(result.idempotencyKey, request.idempotencyKey);
});

Deno.test("accepts the allowed Gmail mailbox through a canonical organization owner key", async () => {
  const request = await validRequest();
  const canonicalUser = {
    ...user,
    owner_email: "org:org_dbc2fd12c76",
    organization_id: "org_dbc2fd12c76",
    canonical_tenant_id: "33333333-3333-4333-8333-333333333333"
  };
  const result = await validateRequest(
    canonicalUser,
    request.body,
    request.idempotencyKey,
    tenantGmailConnection(canonicalUser.owner_email)
  );
  assertEquals(result.ownerEmail, "org:org_dbc2fd12c76");
  assertEquals(result.preparedByEmail, "sales@heymarksman.com");
  assertEquals(result.receiptOrganizationId, "33333333-3333-4333-8333-333333333333");
});

Deno.test("rejects a canonical tenant without its connected allowed Gmail mailbox", async () => {
  const request = await validRequest();
  const canonicalUser = { ...user, owner_email: "org:org_dbc2fd12c76" };
  await assertRejects(
    () => validateRequest(canonicalUser, request.body, request.idempotencyKey, null),
    /connected sales@heymarksman.com Gmail mailbox for this tenant is required/
  );
});

Deno.test("allows receipt-only reconciliation after the Gmail connection is revoked", async () => {
  const request = await validRequest();
  const canonicalUser = { ...user, owner_email: "org:org_dbc2fd12c76" };
  const result = await (validateFcmCustomerQuoteEmailPackage as unknown as (
    user: typeof canonicalUser,
    input: Record<string, unknown>,
    headerIdempotencyKey: string,
    identity: {
      gmailConnection: Record<string, unknown> | null;
      requireConnectedMailbox: boolean;
    }
  ) => Promise<Record<string, unknown>>)(
    canonicalUser,
    request.body,
    request.idempotencyKey,
    { gmailConnection: null, requireConnectedMailbox: false }
  );
  assertEquals(result.ownerEmail, canonicalUser.owner_email);
});

Deno.test("rejects a mismatched idempotency header", async () => {
  const request = await validRequest();
  await assertRejects(
    () => validateRequest(user, request.body, "b".repeat(64)),
    /idempotency keys do not match/
  );
});

Deno.test("rejects prepared content changed after checksum", async () => {
  const request = await validRequest();
  const prepared = (request.body.package as Record<string, unknown>).prepared as Record<string, unknown>;
  (prepared.message as Record<string, unknown>).subject = "Altered quote";
  await assertRejects(
    () => validateRequest(user, request.body, request.idempotencyKey),
    /payload checksum does not match/
  );
});

Deno.test("rejects an organization substitution under the original key", async () => {
  const request = await validRequest();
  (request.body.package as Record<string, unknown>).sourceOrganizationId = "org-fcm-2";
  await assertRejects(
    () => validateRequest(user, request.body, request.idempotencyKey),
    /idempotency key is invalid/
  );
});

Deno.test("rejects a Gmail connection owned by a different tenant", async () => {
  const request = await validRequest();
  const canonicalUser = { ...user, owner_email: "org:org_dbc2fd12c76" };
  await assertRejects(
    () => validateRequest(
      canonicalUser,
      request.body,
      request.idempotencyKey,
      tenantGmailConnection("org:another-tenant")
    ),
    /connected sales@heymarksman.com Gmail mailbox for this tenant is required/
  );
});

Deno.test("rejects a prepared-by identity different from the authenticated owner", async () => {
  const request = await validRequest();
  const prepared = (request.body.package as Record<string, unknown>).prepared as Record<string, unknown>;
  (prepared.preparedBy as Record<string, unknown>).email = "other@example.com";
  await assertRejects(
    () => validateRequest(user, request.body, request.idempotencyKey),
    /must use the authorized Gmail sender/
  );
});

Deno.test("reconciliation proves no Gmail attempt when no durable receipt exists", () => {
  assertEquals(
    JSON.stringify(reconcileFcmCustomerQuoteEmailReceipt(null)),
    JSON.stringify({
      reconciled: true,
      outcome: "NOT_ATTEMPTED",
      retryable: true,
      receipt_id: null,
      provider_message_id: null,
      provider_thread_id: null,
      sent_at: null,
      error: null
    })
  );
});

Deno.test("reconciliation returns the durable Gmail receipt without another send", () => {
  assertEquals(
    JSON.stringify(reconcileFcmCustomerQuoteEmailReceipt({
      id: "receipt-1",
      status: "sent",
      provider_message_id: "gmail-1",
      provider_thread_id: "thread-1",
      sent_at: "2026-08-20T09:11:55.384Z",
      error: null
    })),
    JSON.stringify({
      reconciled: true,
      outcome: "SENT",
      retryable: false,
      receipt_id: "receipt-1",
      provider_message_id: "gmail-1",
      provider_thread_id: "thread-1",
      sent_at: "2026-08-20T09:11:55.384Z",
      error: null
    })
  );
});

Deno.test("reconciliation keeps an ambiguous provider outcome locked", () => {
  const result = reconcileFcmCustomerQuoteEmailReceipt({
    id: "receipt-2",
    status: "delivery_unknown",
    provider_message_id: null,
    provider_thread_id: null,
    sent_at: null,
    error: "Network timeout"
  });
  assertEquals(result.outcome, "DELIVERY_UNKNOWN");
  assertEquals(result.retryable, false);
});
