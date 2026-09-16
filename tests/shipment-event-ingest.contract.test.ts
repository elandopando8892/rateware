import { assert, assertEquals } from "jsr:@std/assert@1";
import { createShipmentEventIngestHandler } from "../supabase/functions/shipment-event-ingest-api/handler.ts";
import { verifyShipmentEventEnvelope } from "../supabase/functions/shipment-event-ingest-api/authorization.ts";

const secret = "test-only-shipment-event-secret-32-chars";
const keyId = "loads-preview";
const eventId = "33333333-3333-4333-8333-333333333333";
const rfxEventId = "44444444-4444-4444-8444-444444444444";
const laneId = "22222222-2222-4222-8222-222222222222";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

async function sign(unsigned: Record<string, unknown>): Promise<Record<string, unknown>> {
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(stable(unsigned))))).map(byte => byte.toString(16).padStart(2, "0")).join("");
  return { ...unsigned, signature };
}

async function envelope(overrides: Record<string, unknown> = {}) {
  const unsigned: Record<string, unknown> = {
    contractVersion: "rateware-internal-request.v1", issuer: "marksman-loads", audience: "rateware", keyId,
    requestId: "request-1", issuedAt: "2026-09-07T12:00:00.000Z", expiresAt: "2026-09-07T12:01:00.000Z",
    body: {
      action: "register_shipment_created", organizationId: "org-xbf", rfxEventId, rfxLaneId: laneId,
      receipt: {
        receiptVersion: "fleetrocket-execution-receipt.v1", receiptId: "receipt-1", idempotencyKey: "il:letter-1:r1",
        instructionLetterId: "letter-1", instructionLetterRevision: 1, mode: "executed", externalExecution: true,
        occurredAt: "2026-09-07T11:59:00.000Z", instructionTermsHash: `sha256:${"a".repeat(64)}`,
        fleetRocket: { environment: "demo", fleetRocketLoadId: "FR-9001", requestPayloadHash: `sha256:${"b".repeat(64)}` },
      },
    },
    ...overrides,
  };
  return sign(unsigned);
}

function handler(rpc: (_name: string, _args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  = async () => ({ data: [{ event_id: eventId, replayed: false }], error: null })) {
  return createShipmentEventIngestHandler({
    getClient: () => ({ rpc }),
    verify: (value) => verifyShipmentEventEnvelope(value, { sharedSecret: secret, expectedKeyId: keyId, now: () => new Date("2026-09-07T12:00:30.000Z") }),
  });
}

Deno.test("accepts one signed confirmed receipt and maps only the registration RPC", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const body = await envelope();
  assertEquals(body.signature, "c5b030766f62b599767fdf3105dbfb6969d18132a3f2863d5d0c713e428330b4", "must match the Node producer golden signature");
  const response = await handler(async (name, args) => { calls.push({ name, args }); return { data: [{ event_id: eventId, replayed: false }], error: null }; })(new Request("https://rateware.example/functions/v1/shipment-event-ingest-api", { method: "POST", headers: { "content-type": "application/json", "x-request-id": "request-1" }, body: JSON.stringify(body) }));
  assertEquals(response.status, 200);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].name, "rateware_register_shipment_created");
  assertEquals(calls[0].args.p_fleet_rocket_load_number, "FR-9001");
  const result = await response.json();
  assertEquals(result, { eventId, replayed: false, executionReceiptId: "receipt-1", idempotencyKey: "il:letter-1:r1" });
});

Deno.test("rejects tampering, expiry and rehearsal without calling the RPC", async () => {
  let calls = 0;
  const invoke = handler(async () => { calls += 1; return { data: [], error: null }; });
  const tampered = await envelope();
  (tampered.body as Record<string, unknown>).organizationId = "other-org";
  let response = await invoke(new Request("https://rateware.example", { method: "POST", body: JSON.stringify(tampered) }));
  assertEquals(response.status, 401);
  const expired = await envelope({ issuedAt: "2026-09-07T11:50:00.000Z", expiresAt: "2026-09-07T11:51:00.000Z" });
  response = await invoke(new Request("https://rateware.example", { method: "POST", body: JSON.stringify(expired) }));
  assertEquals(response.status, 401);
  const rehearsalSeed = await envelope();
  const rehearsalUnsigned = structuredClone(rehearsalSeed);
  delete rehearsalUnsigned.signature;
  const rehearsalBody = rehearsalUnsigned.body as Record<string, unknown>;
  rehearsalBody.receipt = { ...(rehearsalBody.receipt as Record<string, unknown>), mode: "rehearsal", externalExecution: false };
  const rehearsal = await sign(rehearsalUnsigned);
  response = await invoke(new Request("https://rateware.example", { method: "POST", body: JSON.stringify(rehearsal) }));
  assertEquals(response.status, 400);
  const invalidHashSeed = await envelope();
  const invalidHashUnsigned = structuredClone(invalidHashSeed);
  delete invalidHashUnsigned.signature;
  const invalidHashBody = invalidHashUnsigned.body as Record<string, unknown>;
  const invalidHashReceipt = invalidHashBody.receipt as Record<string, unknown>;
  invalidHashReceipt.fleetRocket = { ...(invalidHashReceipt.fleetRocket as Record<string, unknown>), requestPayloadHash: "not-a-sha256" };
  const invalidHash = await sign(invalidHashUnsigned);
  response = await invoke(new Request("https://rateware.example", { method: "POST", body: JSON.stringify(invalidHash) }));
  assertEquals(response.status, 400);
  assertEquals(calls, 0);
});

Deno.test("returns a deterministic conflict for changed receipt correlation", async () => {
  const response = await handler(async () => ({ data: null, error: { code: "23505", message: "not exposed" } }))(
    new Request("https://rateware.example", { method: "POST", body: JSON.stringify(await envelope()) }),
  );
  assertEquals(response.status, 409);
  assertEquals(await response.json(), {
    error: "SHIPMENT_EVENT_CORRELATION_CONFLICT",
    code: "SHIPMENT_EVENT_CORRELATION_CONFLICT",
  });
});
