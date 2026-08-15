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

const { validateFcmCustomerQuoteEmailPackage } = await import(
  "../supabase/functions/rateware-api/index.ts"
);
Object.defineProperty(Deno, "serve", { configurable: true, value: originalServe });

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

Deno.test("accepts the exact tenant-bound FCM quote email contract", async () => {
  const request = await validRequest();
  const result = await validateFcmCustomerQuoteEmailPackage(
    user as never,
    request.body,
    request.idempotencyKey
  );
  assertEquals(result.sourceOrganizationId, "org-fcm-1");
  assertEquals(result.recipientEmail, "buyer@example.com");
  assertEquals(result.idempotencyKey, request.idempotencyKey);
});

Deno.test("rejects a mismatched idempotency header", async () => {
  const request = await validRequest();
  await assertRejects(
    () => validateFcmCustomerQuoteEmailPackage(user as never, request.body, "b".repeat(64)),
    /idempotency keys do not match/
  );
});

Deno.test("rejects prepared content changed after checksum", async () => {
  const request = await validRequest();
  const prepared = (request.body.package as Record<string, unknown>).prepared as Record<string, unknown>;
  (prepared.message as Record<string, unknown>).subject = "Altered quote";
  await assertRejects(
    () => validateFcmCustomerQuoteEmailPackage(user as never, request.body, request.idempotencyKey),
    /payload checksum does not match/
  );
});

Deno.test("rejects an organization substitution under the original key", async () => {
  const request = await validRequest();
  (request.body.package as Record<string, unknown>).sourceOrganizationId = "org-fcm-2";
  await assertRejects(
    () => validateFcmCustomerQuoteEmailPackage(user as never, request.body, request.idempotencyKey),
    /idempotency key is invalid/
  );
});

Deno.test("rejects any Rateware owner other than the authorized Gmail mailbox", async () => {
  const request = await validRequest();
  await assertRejects(
    () => validateFcmCustomerQuoteEmailPackage(
      { ...user, owner_email: "other@example.com" } as never,
      request.body,
      request.idempotencyKey
    ),
    /Only sales@heymarksman.com is allowed/
  );
});

Deno.test("rejects a prepared-by identity different from the authenticated owner", async () => {
  const request = await validRequest();
  const prepared = (request.body.package as Record<string, unknown>).prepared as Record<string, unknown>;
  (prepared.preparedBy as Record<string, unknown>).email = "other@example.com";
  await assertRejects(
    () => validateFcmCustomerQuoteEmailPackage(user as never, request.body, request.idempotencyKey),
    /must match the FCM prepared-by email/
  );
});
