import { ShipmentEventAuthorizationError } from "./authorization.ts";

type Row = Record<string, unknown>;
type RpcClient = { rpc: (name: string, args: Row) => Promise<{ data: unknown; error: unknown }> };
type Dependencies<T extends RpcClient> = {
  getClient: () => T;
  verify: (envelope: Row) => Promise<Row>;
};

class IngestError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^sha256:[a-f0-9]{64}$/;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const exact = (value: Row, fields: string[]) => Object.keys(value).sort().join() === [...fields].sort().join();
const invalid = (): never => { throw new IngestError(400, "INVALID_SHIPMENT_EVENT"); };

function uuid(value: unknown, nullable = false) {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return (value as string).toLowerCase();
}

function parseBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const body = value as Row;
  if (!exact(body, ["action", "organizationId", "rfxEventId", "rfxLaneId", "receipt"])
    || body.action !== "register_shipment_created" || !text(body.organizationId)) invalid();
  if (!body.receipt || typeof body.receipt !== "object" || Array.isArray(body.receipt)) invalid();
  const receipt = body.receipt as Row;
  if (!exact(receipt, ["receiptVersion", "receiptId", "idempotencyKey", "instructionLetterId", "instructionLetterRevision", "mode", "externalExecution", "occurredAt", "fleetRocket", "instructionTermsHash"])) invalid();
  if (!receipt.fleetRocket || typeof receipt.fleetRocket !== "object" || Array.isArray(receipt.fleetRocket)) invalid();
  const fleetRocket = receipt.fleetRocket as Row;
  if (!exact(fleetRocket, ["environment", "fleetRocketLoadId", "requestPayloadHash"])
    || receipt.receiptVersion !== "fleetrocket-execution-receipt.v1"
    || receipt.mode !== "executed" || receipt.externalExecution !== true
    || !text(receipt.receiptId) || text(receipt.idempotencyKey).length < 8
    || !text(receipt.instructionLetterId)
    || !Number.isInteger(receipt.instructionLetterRevision) || Number(receipt.instructionLetterRevision) < 1
    || !Number.isFinite(Date.parse(text(receipt.occurredAt)))
    || !["demo", "prod"].includes(text(fleetRocket.environment))
    || !text(fleetRocket.fleetRocketLoadId) || !HASH.test(text(fleetRocket.requestPayloadHash))
    || !HASH.test(text(receipt.instructionTermsHash))) invalid();
  return { body, receipt, fleetRocket, rfxEventId: uuid(body.rfxEventId), rfxLaneId: uuid(body.rfxLaneId, true) };
}

export function createShipmentEventIngestHandler<T extends RpcClient>(dependencies: Dependencies<T>) {
  return async (request: Request) => {
    const requestId = text(request.headers.get("x-request-id"));
    const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json", "cache-control": "private, no-store, max-age=0", ...(requestId ? { "x-request-id": requestId } : {}) },
    });
    try {
      if (request.method !== "POST") throw new IngestError(405, "METHOD_NOT_ALLOWED");
      const raw = await request.text();
      if (!raw || raw.length > 16_384) invalid();
      let envelope: Row = {};
      try { envelope = JSON.parse(raw); } catch { invalid(); }
      let verified: Row;
      try { verified = await dependencies.verify(envelope); }
      catch (error) {
        if (error instanceof ShipmentEventAuthorizationError) throw new IngestError(error.code.includes("NOT_CONFIGURED") ? 503 : 401, error.code);
        throw new IngestError(401, "INVALID_INTERNAL_AUTHORIZATION");
      }
      if (requestId && requestId !== text(verified.requestId)) throw new IngestError(400, "REQUEST_ID_MISMATCH");
      const { body, receipt, fleetRocket, rfxEventId, rfxLaneId } = parseBody(verified.body);
      const result = await dependencies.getClient().rpc("rateware_register_shipment_created", {
        p_organization_id: body.organizationId,
        p_receipt_version: receipt.receiptVersion,
        p_execution_receipt_id: receipt.receiptId,
        p_idempotency_key: receipt.idempotencyKey,
        p_rfx_event_id: rfxEventId,
        p_rfx_lane_id: rfxLaneId,
        p_instruction_letter_id: receipt.instructionLetterId,
        p_instruction_letter_revision: receipt.instructionLetterRevision,
        p_receipt_mode: receipt.mode,
        p_external_execution: receipt.externalExecution,
        p_occurred_at: receipt.occurredAt,
        p_fleet_rocket_environment: fleetRocket.environment,
        p_fleet_rocket_load_number: fleetRocket.fleetRocketLoadId,
        p_request_payload_hash: fleetRocket.requestPayloadHash,
        p_instruction_terms_hash: receipt.instructionTermsHash,
      });
      if (result.error) {
        const rpcError = result.error as Row;
        if (text(rpcError?.code) === "23505") throw new IngestError(409, "SHIPMENT_EVENT_CORRELATION_CONFLICT");
        throw new IngestError(503, "SHIPMENT_EVENT_UNAVAILABLE");
      }
      if (!Array.isArray(result.data) || result.data.length !== 1) throw new IngestError(503, "SHIPMENT_EVENT_UNAVAILABLE");
      const row = result.data[0] as Row;
      if (!UUID.test(text(row.event_id)) || typeof row.replayed !== "boolean") throw new IngestError(503, "SHIPMENT_EVENT_UNAVAILABLE");
      return reply({ eventId: text(row.event_id).toLowerCase(), replayed: row.replayed, executionReceiptId: receipt.receiptId, idempotencyKey: receipt.idempotencyKey });
    } catch (error) {
      const safe = error instanceof IngestError ? error : new IngestError(503, "SHIPMENT_EVENT_UNAVAILABLE");
      return reply({ error: safe.code, code: safe.code }, safe.status);
    }
  };
}
