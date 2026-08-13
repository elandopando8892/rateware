export const PROVIDER_COMMUNICATION_MATCH_BASES = Object.freeze([
  'existing_thread',
  'exact_email',
  'verified_contact',
  'email_domain',
  'legal_name',
  'mc',
  'dot',
  'ein',
  'rfc',
  'phone',
  'address',
]);

const AUTO_MATCH_BASES = new Set(['existing_thread', 'exact_email', 'verified_contact']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeProviderCommunicationEmail(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) throw new TypeError('Invalid communication email address.');
  return normalized;
}

export function isAutoMatchBasis(value) {
  return AUTO_MATCH_BASES.has(String(value ?? '').trim().toLowerCase());
}

export function resolveProviderCommunicationMatch(candidates) {
  const rows = Array.isArray(candidates) ? candidates : [];
  if (rows.length === 0) return Object.freeze({ decision: 'unmatched', providerRelationshipId: null });

  const normalized = rows
    .filter((row) => row && row.providerRelationshipId)
    .map((row) => ({
      providerRelationshipId: String(row.providerRelationshipId),
      basis: String(row.basis ?? '').trim().toLowerCase(),
      confidence: Number(row.confidence ?? 0),
    }));

  const deterministic = normalized.filter(
    (row) => isAutoMatchBasis(row.basis) && row.confidence === 1,
  );
  const deterministicIds = [...new Set(deterministic.map((row) => row.providerRelationshipId))];

  if (deterministicIds.length === 1) {
    return Object.freeze({
      decision: 'auto_match',
      providerRelationshipId: deterministicIds[0],
      bases: Object.freeze([...new Set(deterministic.filter((row) => row.providerRelationshipId === deterministicIds[0]).map((row) => row.basis))]),
    });
  }

  return Object.freeze({
    decision: 'needs_review',
    providerRelationshipId: null,
    candidateCount: normalized.length,
  });
}

export function communicationThreadNeedsReply(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const inbound = input.lastInboundAt ? new Date(input.lastInboundAt) : null;
  const outbound = input.lastOutboundAt ? new Date(input.lastOutboundAt) : null;
  if (!inbound || Number.isNaN(inbound.getTime())) return false;
  if (!outbound || Number.isNaN(outbound.getTime())) return true;
  return inbound > outbound;
}

export function validateProviderCommunicationMessageDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Communication message draft must be an object.');
  }

  const externalMessageId = String(input.externalMessageId ?? '').trim();
  const mailboxReference = String(input.mailboxReference ?? '').trim();
  const direction = String(input.direction ?? '').trim().toLowerCase();
  const messageAt = new Date(input.messageAt);

  if (!externalMessageId) throw new TypeError('External message ID is required.');
  if (!mailboxReference) throw new TypeError('Mailbox reference is required.');
  if (!['inbound', 'outbound', 'internal'].includes(direction)) {
    throw new RangeError(`Unsupported message direction: ${direction}`);
  }
  if (Number.isNaN(messageAt.getTime())) throw new TypeError('Message timestamp is required.');

  return Object.freeze({ externalMessageId, mailboxReference, direction, messageAt: messageAt.toISOString() });
}
