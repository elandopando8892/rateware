// Pure planning for the neutral inbox envelope.
//
// Split from `provider-inbound-envelope.ts` on purpose: every rule that decides
// what gets written lives here, with no database, so it can be executed by a test
// rather than inspected as text. The `.ts` side only reads, writes and retries.
// This mirrors the split already used by `provider-agent-resolution.mjs`.

/** Jurisdiction is matched on country_code, so renaming XBFMX/XBFUS cannot break routing. */
export const ROUTING_COUNTRY = Object.freeze({
  mexico: 'MX',
  united_states: 'US',
});

/** numeric(5,4) constrained to [0,1] — clamp rather than let the insert fail. */
export function boundedConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(1, Math.max(0, Math.round(numeric * 10000) / 10000));
}

/** The table requires mailbox_reference to equal lower(btrim(...)) exactly. */
export function normalizeMailbox(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Chooses the legal entity for a routing decision from the candidates the caller
 * loaded for that jurisdiction.
 *
 * Returns null when the entity is absent or when more than one shares the country
 * code. Two entities in one jurisdiction is a genuine ambiguity, and §4 forbids
 * resolving one silently — so this declines and the envelope routes to review.
 */
export function selectLegalEntity(entities, entityKind) {
  if (!ROUTING_COUNTRY[entityKind]) return null;
  const rows = Array.isArray(entities) ? entities.filter(Boolean) : [];
  if (rows.length !== 1) return null;
  const [row] = rows;
  if (!row.id || !row.entity_code) return null;
  return { id: String(row.id), entity_code: String(row.entity_code) };
}

/**
 * Builds the envelope row and its append-only events.
 *
 * `entities` is whatever the caller found for the resolved jurisdiction; pass an
 * empty array when the entity was never resolved. `now` is injected so the plan
 * is deterministic under test.
 */
export function planInboundEnvelope(input) {
  const organizationId = String(input.organization_id ?? '').trim();
  const mailbox = normalizeMailbox(input.mailbox_reference);
  const externalMessageId = String(input.external_message_id ?? '').trim();
  if (!organizationId || !mailbox || !externalMessageId) {
    throw new Error('envelope_identity_incomplete');
  }

  const entity = input.entity || {};
  const entityKind = String(entity.entity_kind || '');
  const resolved = entity.decision === 'resolved' && Boolean(ROUTING_COUNTRY[entityKind]);
  const target = resolved ? selectLegalEntity(input.entities, entityKind) : null;
  const routed = Boolean(target);
  const now = input.now || new Date().toISOString();

  const reviewReason = routed
    ? null
    : (resolved
      ? 'legal_entity_not_resolvable_for_jurisdiction'
      : String(entity.basis || 'entity_evidence_ambiguous').slice(0, 200));

  const row = {
    organization_id: organizationId,
    source_channel: 'email',
    mailbox_reference: mailbox,
    external_thread_id: input.external_thread_id ? String(input.external_thread_id) : null,
    external_message_id: externalMessageId,
    envelope_status: routed ? 'routed' : 'needs_review',
    // The check constraint permits a legal entity only on a routed envelope.
    legal_entity_id: routed ? target.id : null,
    entity_code: routed ? target.entity_code : null,
    routing_decision: routed ? entityKind : 'needs_review',
    routing_confidence: boundedConfidence(entity.confidence),
    // Deterministic evidence rules decided this, not the model. The classifier is
    // model-assisted; the routing is not, and the audit should not blur the two.
    routed_by_type: 'rule',
    routed_at: routed ? now : null,
    review_reason: reviewReason,
    metadata: input.metadata || {},
  };

  const events = [
    { event_type: 'received', event_metadata: { source_channel: 'email' } },
    routed
      ? {
        event_type: 'routed',
        event_metadata: {
          routing_decision: entityKind,
          entity_code: target.entity_code,
          routed_by_type: 'rule',
        },
      }
      : { event_type: 'review_requested', event_metadata: { review_reason: reviewReason } },
  ];

  return { row, events, routed };
}
