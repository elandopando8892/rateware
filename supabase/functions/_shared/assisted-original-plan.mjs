import { createHash } from 'node:crypto';

// PROPOSAL ONLY. No database, network, storage writer, capability grant or apply.
const MAX_BYTES = 25 * 1024 * 1024;
const PILOT_MS = 30 * 60 * 1000;
const REF_KEYS = ['rawUploadId', 'objectId', 'objectVersion', 'sha256', 'sizeBytes'];
const SCOPE_KEYS = ['actorId', 'organizationId', 'ownerScope', 'vendorId', 'invitationId', 'requestId'];
const HINT_KEYS = [...SCOPE_KEYS, ...REF_KEYS];
const READERS = ['readStaff', 'readTarget', 'readCapability', 'readOriginal', 'readBinding'];
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const text = v => typeof v === 'string' && v.length > 0 && v.length <= 256 && v.trim() === v;
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const stamp = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/.test(v) ? Date.parse(v) : NaN;
const exact = (v, keys) => record(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const canonical = v => Array.isArray(v) ? v.map(canonical) : record(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const frozen = v => {
  if (v && typeof v === 'object') { Object.values(v).forEach(frozen); Object.freeze(v); }
  return v;
};
const fail = code => { throw new PlanBlock(code); };
class PlanBlock extends Error { constructor(code) { super(code); this.code = code; } }
const check = (condition, code) => { if (!condition) fail(code); };
const flags = { needsExplicitApply: true, approvalRecorded: false, offerCreated: false, capabilityGranted: false, executionAuthorized: false };

function validReference(ref) {
  return exact(ref, REF_KEYS) && uuid(ref.rawUploadId) && uuid(ref.objectId) && hash(ref.sha256)
    && typeof ref.objectVersion === 'string' && /^[A-Za-z0-9._:-]{1,160}$/.test(ref.objectVersion)
    && Number.isSafeInteger(ref.sizeBytes) && ref.sizeBytes > 0 && ref.sizeBytes <= MAX_BYTES;
}

function validateStaff(staff) {
  check(record(staff) && uuid(staff.actorId) && text(staff.organizationId) && text(staff.ownerScope)
    && staff.tenantVerified === true, 'STAFF_IDENTITY_UNMET');
  check(staff.provider === 'google' && staff.emailVerified === true, 'STAFF_GOOGLE_VERIFICATION_UNMET');
  check(['admin', 'operator'].includes(staff.role), 'STAFF_ROLE_FORBIDDEN');
}

function validateTarget(target, staff, now) {
  check(record(target) && uuid(target.actorId) && uuid(target.vendorId) && uuid(target.invitationId)
    && uuid(target.eventId) && text(target.organizationId) && text(target.ownerScope)
    && typeof target.requestId === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(target.requestId), 'TARGET_SCOPE_UNMET');
  check(target.ownerScope === staff.ownerScope, 'STAFF_OWNER_SCOPE_MISMATCH');
  const m = target.membership, c = target.carrier;
  check(target.activeMembershipCount === 1 && record(m) && m.actorId === target.actorId
    && m.organizationId === target.organizationId && m.status === 'active'
    && ['admin', 'operator', 'viewer'].includes(m.role), 'CARRIER_MEMBERSHIP_UNMET');
  check(record(c) && c.organizationId === target.organizationId && c.vendorId === target.vendorId
    && c.status === 'active' && c.bridgeActive === true, 'CARRIER_BRIDGE_UNMET');
  check(target.eventStatus === 'open' && Number.isFinite(stamp(target.eventExpiresAt))
    && stamp(target.eventExpiresAt) > now, 'EVENT_CLOSED_OR_EXPIRED');
  check(['invited', 'viewed', 'responded', 'quoted', 'bid_submitted'].includes(target.invitationStatus)
    && target.awardRole === null && target.noAward === false && target.privateDeliveryVerified === true,
  'INVITATION_ACCESS_UNMET');
  check(target.reservationState === 'reserved', 'RESERVATION_UNMET');
  check(Number.isFinite(stamp(target.accessExpiresAt)) && stamp(target.accessExpiresAt) > now, 'ACCESS_EXPIRED_OR_UNKNOWN');
  const d = target.carrierDescriptor;
  check(exact(d, ['sha256', 'sizeBytes']) && hash(d.sha256)
    && Number.isSafeInteger(d.sizeBytes) && d.sizeBytes > 0 && d.sizeBytes <= MAX_BYTES, 'CARRIER_DESCRIPTOR_UNMET');
}

function validateCapability(cap, staff, target, now) {
  check(record(cap) && cap.opsActorId === staff.actorId && cap.ownerScope === target.ownerScope
    && cap.enabled === true && Number.isFinite(stamp(cap.grantedAt)) && stamp(cap.grantedAt) <= now
    && Number.isFinite(stamp(cap.expiresAt)) && stamp(cap.expiresAt) > now
    && stamp(cap.expiresAt) > stamp(cap.grantedAt), 'OPS_CAPABILITY_UNMET');
}

function validateOriginal(original, target) {
  check(record(original) && validReference(original.reference), 'ORIGINAL_REFERENCE_UNMET');
  const ref = original.reference, object = original.objectMetadata;
  check(original.ownerScope === target.ownerScope && original.vendorId === target.vendorId, 'ORIGINAL_SCOPE_MISMATCH');
  check(original.storageProvider === 'supabase' && original.bucket === 'raw-uploads'
    && ['uploaded', 'staged'].includes(original.status) && original.archivedAt === null, 'ORIGINAL_UNSUPPORTED');
  check(typeof original.path === 'string' && /^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(original.path)
    && !original.path.split('/').some(p => p === '.' || p === '..'), 'ORIGINAL_UNSUPPORTED');
  const mime = original.documentType === 'pdf' ? 'application/pdf'
    : original.documentType === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : null;
  check(mime && original.mimeType === mime && text(original.originalFilename)
    && original.originalFilename.length <= 240 && !/[\\/\r\n]/.test(original.originalFilename)
    && original.originalFilename.toLowerCase().endsWith(`.${original.documentType}`), 'ORIGINAL_UNSUPPORTED');
  // objectMetadata must come from a backend storage.objects reader, never a HEAD/etag guess.
  check(record(object) && object.id === ref.objectId && object.version === ref.objectVersion
    && object.bucket === original.bucket && object.path === original.path && object.sizeBytes === ref.sizeBytes,
  'IMMUTABLE_OBJECT_METADATA_UNMET');
  check(original.bytes instanceof Uint8Array && original.bytes.byteLength === ref.sizeBytes, 'ORIGINAL_SIZE_MISMATCH');
  check(createHash('sha256').update(original.bytes).digest('hex') === ref.sha256, 'ORIGINAL_HASH_MISMATCH');
  check(target.carrierDescriptor.sha256 === ref.sha256
    && target.carrierDescriptor.sizeBytes === ref.sizeBytes, 'CARRIER_DESCRIPTOR_MISMATCH');
}

function validateBinding(binding, target, reference, now) {
  if (binding.state === 'absent') return;
  const b = binding.value;
  check(record(b) && b.revokedAt === null && b.revokedBy === null, 'BINDING_REVOKED_OR_UNKNOWN');
  check(Number.isFinite(stamp(b.boundAt)) && stamp(b.boundAt) <= now && Number.isFinite(stamp(b.expiresAt))
    && stamp(b.expiresAt) > now && stamp(b.expiresAt) > stamp(b.boundAt), 'BINDING_EXPIRED_OR_UNKNOWN');
  check(SCOPE_KEYS.every(k => b[k] === target[k]) && same(b.reference, reference) && uuid(b.boundBy), 'BINDING_CONFLICT');
}

function validateAll(observed, hints, now) {
  const { staff, target, capability, original, binding } = observed;
  validateStaff(staff); validateTarget(target, staff, now); validateCapability(capability, staff, target, now);
  validateOriginal(original, target); validateBinding(binding, target, original.reference, now);
  check(original.reference.rawUploadId === hints.rawUploadId, 'CALLER_HINT_MISMATCH');
  const expected = { ...Object.fromEntries(SCOPE_KEYS.map(k => [k, target[k]])), ...original.reference };
  check(Object.keys(hints).every(k => hints[k] === expected[k]), 'CALLER_HINT_MISMATCH');
}

// Each callback is an injected trusted read. No retries; a second complete pass is
// revalidation, not recovery of an unknown read. Reads return found/value or (binding only) absent.
export async function prepareAssistedOriginalLink(input, dependencies) {
  try {
    const hints = frozen(structuredClone(input)); // Before the first await: callers cannot retarget an in-flight plan.
    check(record(hints) && Object.keys(hints).every(k => HINT_KEYS.includes(k))
      && uuid(hints.invitationId) && uuid(hints.rawUploadId)
      && typeof hints.requestId === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(hints.requestId), 'CALLER_HINT_INVALID');
    const readers = Object.fromEntries(READERS.map(k => [k, dependencies?.[k]]));
    check(READERS.every(k => typeof readers[k] === 'function') && typeof dependencies?.now === 'function', 'TRUSTED_READERS_UNMET');
    const clock = dependencies.now;
    let lastNow = -Infinity;
    const now = () => {
      const value = clock();
      check(Number.isSafeInteger(value) && value >= lastNow && Number.isFinite(new Date(value).getTime()), 'CLOCK_UNMET');
      lastNow = value; return value;
    };
    const startedAt = now();
    const read = async (name, args, allowAbsent = false) => {
      let value;
      try { value = structuredClone(await readers[name](frozen(structuredClone(args)))); }
      catch { fail('TRUSTED_READ_UNKNOWN'); }
      check(exact(value, ['state', 'value']) && value.state === 'found' && record(value.value)
        || allowAbsent && exact(value, ['state']) && value.state === 'absent', 'TRUSTED_READ_UNKNOWN');
      return allowAbsent ? value : value.value;
    };
    const observe = async () => {
      const staff = await read('readStaff', {});
      validateStaff(staff);
      const target = await read('readTarget', hints);
      validateTarget(target, staff, now());
      check(SCOPE_KEYS.every(k => !Object.hasOwn(hints, k) || hints[k] === target[k]), 'CALLER_HINT_MISMATCH');
      const scope = Object.fromEntries(SCOPE_KEYS.map(k => [k, target[k]]));
      const capability = await read('readCapability', { opsActorId: staff.actorId, ownerScope: target.ownerScope });
      validateCapability(capability, staff, target, now());
      const original = await read('readOriginal', { scope, rawUploadId: hints.rawUploadId });
      validateOriginal(original, target);
      const binding = await read('readBinding', scope, true);
      return { staff, target, capability, original, binding };
    };
    const first = await observe();
    validateAll(first, hints, now());
    const second = await observe();
    // Recheck authorization after the final asynchronous file/binding reads.
    // This is still a proposal, not an atomic authorization for a later apply.
    const finalStaff = await read('readStaff', {});
    validateStaff(finalStaff);
    const finalTarget = await read('readTarget', hints);
    validateTarget(finalTarget, finalStaff, now());
    const finalCapability = await read('readCapability', { opsActorId: finalStaff.actorId, ownerScope: finalTarget.ownerScope });
    check(same(finalStaff, second.staff) && same(finalTarget, second.target)
      && same(finalCapability, second.capability), 'OBSERVATION_CHANGED');
    const checkedAt = now();
    validateAll(second, hints, checkedAt);
    // Both byte reads were hashed. Compare stable DTOs without carrying file bytes into the plan.
    const comparable = ({ original, ...rest }) => {
      const { bytes: _bytes, ...metadata } = original;
      return { ...rest, original: metadata };
    };
    check(same(comparable(first), comparable(second)), 'OBSERVATION_CHANGED');
    const { staff, target, capability, original, binding } = second;
    const expiresAtMs = Math.min(startedAt + PILOT_MS, stamp(capability.expiresAt), stamp(target.eventExpiresAt), stamp(target.accessExpiresAt));
    check(expiresAtMs > checkedAt, 'PLAN_WINDOW_EXPIRED');
    const scope = Object.fromEntries(SCOPE_KEYS.map(k => [k, target[k]]));
    const common = { contractVersion: 'rateware.assisted-original-link-plan.v1', ...flags,
      checkedAt: new Date(checkedAt).toISOString(), scope, reference: original.reference };
    if (binding.state === 'found') {
      check(stamp(binding.value.expiresAt) <= Math.min(stamp(capability.expiresAt), stamp(target.eventExpiresAt), stamp(target.accessExpiresAt)), 'REPLAY_EXPIRY_OUT_OF_SCOPE');
      return frozen({ ...common, state: 'unchanged', wouldChange: false, expiresAt: binding.value.expiresAt,
        boundAt: binding.value.boundAt, boundBy: binding.value.boundBy, rpc: null });
    }
    const expiresAt = new Date(expiresAtMs).toISOString();
    return frozen({ ...common, state: 'planned', wouldChange: true, expiresAt,
      rpc: { name: 'rateware_bind_bid_original_local_v1', args: {
        p_ops_actor_id: staff.actorId, p_actor_id: target.actorId, p_organization_id: target.organizationId,
        p_invitation_id: target.invitationId, p_request_id: target.requestId,
        p_reference: original.reference, p_expires_at: expiresAt,
      } } });
  } catch (error) {
    const code = error instanceof PlanBlock ? error.code : 'PLAN_INPUT_OR_READ_UNMET';
    return frozen({ contractVersion: 'rateware.assisted-original-link-plan.v1', ...flags,
      state: 'blocked', wouldChange: false, rpc: null, code, unmet: [code] });
  }
}
