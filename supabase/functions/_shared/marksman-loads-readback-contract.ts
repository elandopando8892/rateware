import {
  MARKSMAN_LOADS_PROVIDER,
  MarksmanLoadsBidContractError,
  stableStringify,
} from './marksman-loads-bid-contract.ts';

export const MARKSMAN_LOADS_READBACK_REQUEST_VERSION = 'rateware-internal-read.v1';
export const MARKSMAN_LOADS_OBSERVATION_VERSION = 'marksman-loads.private-operation-observation.v1';
const MAX_TTL_MS = 5 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;

type RecordValue = Record<string, unknown>;

function object(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}

function text(value: unknown) {
  return String(value == null ? '' : value).trim();
}

function requiredText(value: unknown, field: string, maximum = 191) {
  const normalized = text(value);
  if (!normalized || normalized.length > maximum) {
    throw new MarksmanLoadsBidContractError(`${field} is invalid.`, 'INVALID_READBACK_REQUEST');
  }
  return normalized;
}

function requiredUuid(value: unknown, field: string) {
  const normalized = text(value).toLowerCase();
  if (!UUID.test(normalized)) throw new MarksmanLoadsBidContractError(`${field} must be a UUID.`, 'INVALID_READBACK_REQUEST');
  return normalized;
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: string) {
  if (!SHA256.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  return bytes;
}

function constantTimeEqual(left: Uint8Array | null, right: Uint8Array) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < right.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function unsignedEnvelope(envelope: RecordValue) {
  const { signature: _signature, ...unsigned } = envelope;
  return unsigned;
}

async function expectedSignature(envelope: RecordValue, sharedSecret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(sharedSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(stableStringify(unsignedEnvelope(envelope)))));
}

export type VerifiedMarksmanLoadsReadbackRequest = {
  requestId: string;
  keyId: string;
  issuedAt: string;
  expiresAt: string;
  body: {
    action: 'read_operation_observation';
    organizationId: string;
    vendorId: string;
    eventId: string;
    laneId: string;
    invitationId: string;
    effect: 'fit' | 'quote';
    operationId: string;
    payloadFingerprint: string;
    segmentKey: string | null;
    queryStartedAt: string;
  };
};

export async function verifyMarksmanLoadsReadbackRequest(
  envelopeValue: unknown,
  options: { sharedSecret: string; expectedKeyId: string; now?: Date },
): Promise<VerifiedMarksmanLoadsReadbackRequest> {
  const envelope = object(envelopeValue);
  const secret = text(options.sharedSecret);
  if (secret.length < 32) throw new MarksmanLoadsBidContractError('Readback secret is not configured.', 'READBACK_NOT_CONFIGURED', 503);
  if (envelope.contractVersion !== MARKSMAN_LOADS_READBACK_REQUEST_VERSION || envelope.issuer !== 'marksman-loads' || envelope.audience !== 'rateware') {
    throw new MarksmanLoadsBidContractError('Readback request routing is invalid.', 'INVALID_READBACK_AUTHORIZATION', 401);
  }
  const keyId = requiredText(envelope.keyId, 'keyId', 96);
  if (keyId !== text(options.expectedKeyId)) throw new MarksmanLoadsBidContractError('Readback key is not accepted.', 'INVALID_READBACK_KEY', 401);
  const expected = await expectedSignature(envelope, secret);
  if (!constantTimeEqual(hexToBytes(text(envelope.signature).toLowerCase()), expected)) {
    throw new MarksmanLoadsBidContractError('Readback signature is invalid.', 'INVALID_READBACK_SIGNATURE', 401);
  }
  const now = (options.now || new Date()).getTime();
  const issued = Date.parse(text(envelope.issuedAt));
  const expires = Date.parse(text(envelope.expiresAt));
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || expires - issued > MAX_TTL_MS || issued > now + 30_000) {
    throw new MarksmanLoadsBidContractError('Readback timestamps are invalid.', 'INVALID_READBACK_TIMESTAMP', 401);
  }
  if (expires < now) throw new MarksmanLoadsBidContractError('Readback authorization expired.', 'READBACK_AUTHORIZATION_EXPIRED', 401);

  const raw = object(envelope.body);
  if (raw.action !== 'read_operation_observation') throw new MarksmanLoadsBidContractError('Readback action is invalid.', 'INVALID_READBACK_ACTION');
  const organizationId = requiredText(raw.organizationId, 'organizationId').toLowerCase();
  if (organizationId !== text(raw.organizationId)) throw new MarksmanLoadsBidContractError('organizationId must be normalized lowercase.', 'INVALID_READBACK_REQUEST');
  const effect = text(raw.effect).toLowerCase();
  if (!['fit', 'quote'].includes(effect)) throw new MarksmanLoadsBidContractError('effect must be fit or quote.', 'INVALID_READBACK_REQUEST');
  const operationId = text(raw.operationId).toLowerCase();
  const payloadFingerprint = text(raw.payloadFingerprint).toLowerCase();
  if (!SHA256.test(operationId) || !SHA256.test(payloadFingerprint)) throw new MarksmanLoadsBidContractError('Operation evidence hashes are invalid.', 'INVALID_READBACK_REQUEST');
  const segmentKey = raw.segmentKey == null ? null : requiredText(raw.segmentKey, 'segmentKey', 200);
  if ((effect === 'fit') !== Boolean(segmentKey)) throw new MarksmanLoadsBidContractError('segmentKey is required only for fit.', 'INVALID_READBACK_REQUEST');
  const queryStartedAt = requiredText(raw.queryStartedAt, 'queryStartedAt', 40);
  const queryStarted = Date.parse(queryStartedAt);
  if (!Number.isFinite(queryStarted) || queryStarted < issued - 30_000 || queryStarted > now + 30_000 || queryStarted >= expires) {
    throw new MarksmanLoadsBidContractError('queryStartedAt is outside the signed request window.', 'INVALID_READBACK_TIMESTAMP', 401);
  }
  return {
    requestId: requiredUuid(envelope.requestId, 'requestId'),
    keyId,
    issuedAt: new Date(issued).toISOString(),
    expiresAt: new Date(expires).toISOString(),
    body: {
      action: 'read_operation_observation', organizationId,
      vendorId: requiredUuid(raw.vendorId, 'vendorId'), eventId: requiredUuid(raw.eventId, 'eventId'),
      laneId: requiredUuid(raw.laneId, 'laneId'), invitationId: requiredUuid(raw.invitationId, 'invitationId'),
      effect: effect as 'fit' | 'quote', operationId, payloadFingerprint, segmentKey,
      queryStartedAt: new Date(queryStarted).toISOString(),
    },
  };
}

export function projectOperationObservation(
  verified: VerifiedMarksmanLoadsReadbackRequest,
  rowValue: unknown,
  checkedAt: string,
) {
  const row = object(rowValue);
  if (!Object.keys(row).length) {
    return { requestId: verified.requestId, status: 'not_observed', observation: null, checkedAt };
  }
  const body = verified.body;
  const scopeMatches = row.provider === MARKSMAN_LOADS_PROVIDER
    && row.external_organization_id === body.organizationId && row.vendor_id === body.vendorId
    && row.rfx_event_id === body.eventId && row.rfx_lane_id === body.laneId
    && row.rfx_lane_vendor_id === body.invitationId && row.effect === body.effect
    && row.operation_id === body.operationId && row.payload_fingerprint === body.payloadFingerprint && row.outcome === 'committed'
    && (body.effect === 'fit' ? row.segment_key === body.segmentKey : row.segment_key == null);
  if (!scopeMatches) throw new MarksmanLoadsBidContractError('Stored evidence does not match the signed scope.', 'READBACK_SCOPE_MISMATCH', 409);
  const receiptId = requiredUuid(row.id, 'receiptId');
  const recordId = requiredUuid(row.record_id, 'recordId');
  const committedTime = Date.parse(requiredText(row.committed_at, 'committedAt', 40));
  const checkedTime = Date.parse(checkedAt);
  if (!Number.isFinite(committedTime) || !Number.isFinite(checkedTime) || checkedTime < Date.parse(body.queryStartedAt) || committedTime > checkedTime) {
    throw new MarksmanLoadsBidContractError('Stored evidence timestamps are invalid.', 'READBACK_RECORD_INVALID', 409);
  }
  const committedAt = new Date(committedTime).toISOString();
  const observation: RecordValue = {
    contractVersion: MARKSMAN_LOADS_OBSERVATION_VERSION,
    effect: body.effect, operationId: body.operationId, payloadFingerprint: body.payloadFingerprint,
    scope: { organizationId: body.organizationId, vendorId: body.vendorId, eventId: body.eventId, laneId: body.laneId, invitationId: body.invitationId, ...(body.effect === 'fit' ? { segmentKey: body.segmentKey } : {}) },
    outcome: 'committed', receiptId, recordId, committedAt, checkedAt,
  };
  if (body.effect === 'quote') {
    observation.staging = { recordId: requiredUuid(row.staging_record_id, 'stagingRecordId'), operationId: body.operationId, payloadFingerprint: body.payloadFingerprint };
  }
  return { requestId: verified.requestId, status: 'observed', observation, checkedAt };
}
