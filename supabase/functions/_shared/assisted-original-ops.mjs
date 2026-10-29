import { randomBytes } from 'node:crypto';
import { prepareAssistedOriginalLink } from './assisted-original-plan.mjs';

// LOCAL SIMULATION ONLY. No network, environment, service key or real RPC.
// Readers are trusted backend adapters. readStaff(Request) returns the Google-
// confirmed staff DTO directly; other readers use found/value (binding: absent).
// readCapability receives {opsActorId, ownerScope, scope, staff} and must return
// allowedTarget equal to the complete six-field scope. Owner-wide grants fail.
// bindOriginal({args, expected, staff}) must atomically recheck authorization,
// compare absence/full binding, and enforce unique scope + immutable reference.
// It returns {...sixFieldScope, reference:{rawUploadId,objectId,objectVersion,
// sha256,sizeBytes}, boundBy, boundAt, expiresAt, revokedAt:null, revokedBy:null}.
// expected is the full scope/reference plus boundBy, expiresAt, notBefore (ms),
// and optional boundAt on exact replay. It is server-side only. The atomic
// writer also rechecks the reservation, capability and Google staff authority.
// It returns the FULL binding DTO, not an ID/boolean. This host verifies it and
// reads the binding again. In-memory locks/tombstones never retry an invocation,
// even on another review token. They are NOT durable across process restarts;
// persistence/transactional idempotency is mandatory before any real mounting.
// Optional stateStore is request-bound/authenticated by composition (no Request
// parameter added here). Its async port is saveReview(entry) [insert only],
// getReview(reference) -> entry|null, getAttempt(scope,reservationId) ->
// {expected,state:'uncertain'|'bound'}|null, claimAttempt(entry,expected) ->
// {claimed,attempt:{expected,state},claimNonce?}. Claims persist uncertainty
// BEFORE returning, unique by invitationId+requestId across reservation aliases;
// reservation lookups must also retain conflicts when the target changes.
// Persistent bindOriginal additionally receives reviewReference and claimNonce.
// That writer validates the claim and marks bound atomically; no markBound port.
const CONTRACT = 'rateware.assisted-original-ops.v1';
const SCOPE = ['actorId', 'organizationId', 'ownerScope', 'vendorId', 'invitationId', 'requestId'];
const MAX_RECORDS = 1024, MAX_BODY = 4096;
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const canonical = v => Array.isArray(v) ? v.map(canonical) : record(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const exact = (v, keys) => record(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const opaque = v => typeof v === 'string' && /^[A-Za-z0-9_-]{16,160}$/.test(v);
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const scopeOf = v => Object.fromEntries(SCOPE.map(k => [k, v[k]]));
const freeze = v => { if (v && typeof v === 'object' && !ArrayBuffer.isView(v)) { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const copy = v => freeze(structuredClone(v));
class Block extends Error { constructor(code, status = 409) { super(code); this.code = code; this.status = status; } }
const demand = (ok, code, status) => { if (!ok) throw new Block(code, status); };
const flags = { simulationOnly: true, commercialWrites: false, submissionEnabled: false, approvalRecorded: false, offerCreated: false };
const response = (status, data) => new Response(JSON.stringify({ contractVersion: CONTRACT, ...data, ...flags }), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...(status === 405 ? { allow: 'POST' } : {}) },
});
const staffValid = s => record(s) && uuid(s.actorId) && ['organizationId', 'ownerScope'].every(k => typeof s[k] === 'string' && s[k].trim() === s[k] && s[k].length > 0 && s[k].length <= 256)
  && s.tenantVerified === true && s.provider === 'google' && s.emailVerified === true && ['admin', 'operator'].includes(s.role);

async function bodyOf(request) {
  demand(/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || ''), 'JSON_REQUIRED', 415);
  const length = request.headers.get('content-length');
  demand(length === null || /^\d+$/.test(length) && Number(length) <= MAX_BODY, 'BODY_TOO_LARGE', 413);
  demand(request.body, 'INVALID_INPUT', 400);
  const reader = request.body.getReader(); let size = 0; const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new Block('BODY_TOO_LARGE', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const bytes = new Uint8Array(size); let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { throw new Block('INVALID_INPUT', 400); }
}

/** Local, injected HTTP handler. No server is started by this factory. */
export function createAssistedOriginalOpsHost({ enabled = false, origin, readStaff, readReservation,
  readCapability, readOriginal, readBinding, bindOriginal, stateStore, now = Date.now,
  makeReference = () => randomBytes(32).toString('base64url') } = {}) {
  let localOrigin = null;
  try {
    const u = new URL(origin);
    if (u.origin === origin && u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) localOrigin = u.origin;
  } catch { /* Invalid/nonlocal host remains inert. */ }
  const reviews = new Map(), attempts = new Map(), reservationAttempts = new Map(), busy = new Set();
  const persistent = stateStore !== undefined;
  const storeCall = async (method, ...args) => {
    try { return copy(await stateStore[method](...args.map(copy))); }
    catch (error) {
      if (['STAFF_FORBIDDEN', 'REVIEW_STAFF_CHANGED', 'REVIEW_EXPIRED', 'REVIEW_EVIDENCE_CHANGED'].includes(error?.code))
        throw new Block(error.code, error.code === 'REVIEW_EXPIRED' ? 410 : error.code === 'REVIEW_EVIDENCE_CHANGED' ? 409 : 403);
      throw new Block('STATE_STORE_UNKNOWN', 503);
    }
  };
  const validAttempt = attempt => exact(attempt, ['expected', 'state'])
    && ['uncertain', 'bound'].includes(attempt.state) && record(attempt.expected)
    && SCOPE.every(k => typeof attempt.expected[k] === 'string' && attempt.expected[k].length > 0)
    && record(attempt.expected.reference) && uuid(attempt.expected.boundBy)
    && Number.isFinite(Date.parse(attempt.expected.expiresAt))
    && Number.isSafeInteger(attempt.expected.notBefore);
  const attemptFor = async (scope, reservationId) => {
    const attempt = await storeCall('getAttempt', scope, reservationId);
    // Only explicit null proves absence. Undefined/malformed/error is unknown.
    demand(attempt === null || validAttempt(attempt), 'STATE_STORE_UNKNOWN', 503);
    return attempt;
  };
  let lastTime = -Infinity;
  const clock = () => {
    const t = now();
    demand(Number.isSafeInteger(t) && t >= lastTime && Number.isFinite(new Date(t).getTime()), 'CLOCK_UNMET');
    lastTime = t; return t;
  };
  const trusted = async (fn, arg) => {
    try { return structuredClone(await fn(copy(arg))); }
    catch { throw new Block('TRUSTED_READ_UNKNOWN', 503); }
  };
  const staffFor = async request => {
    let s; try { s = copy(await readStaff(request)); } catch { throw new Block('STAFF_UNAVAILABLE', 403); }
    demand(staffValid(s), 'STAFF_FORBIDDEN', 403); return s;
  };
  const reservationFor = async (reservationId, staff) => {
    const r = await trusted(readReservation, { reservationId, staff });
    demand(exact(r, ['state', 'value']) && r.state === 'found' && record(r.value) && record(r.value.target), 'RESERVATION_UNAVAILABLE', 403);
    return copy(r.value);
  };
  const planFor = async (request, reservationId, rawUploadId, pinned) => {
    const staff = await staffFor(request);
    if (pinned) demand(same(staff, pinned.staff), 'REVIEW_STAFF_CHANGED', 403);
    const reservation = await reservationFor(reservationId, staff);
    if (pinned) demand(same(reservation, pinned.reservation), 'RESERVATION_CHANGED');
    const target = reservation.target, scope = scopeOf(target);
    let capability, originalMetadata;
    const plan = await prepareAssistedOriginalLink({ ...scope, rawUploadId }, {
      now: clock,
      readStaff: async () => {
        const current = await staffFor(request);
        demand(same(current, staff), 'STAFF_CHANGED'); return { state: 'found', value: current };
      },
      readTarget: async () => {
        const current = await reservationFor(reservationId, staff);
        demand(same(current, reservation), 'RESERVATION_CHANGED'); return { state: 'found', value: current.target };
      },
      readCapability: async args => {
        const r = await trusted(readCapability, { ...args, scope, staff });
        demand(exact(r, ['state', 'value']) && r.state === 'found'
          && exact(r.value?.allowedTarget, SCOPE) && same(r.value.allowedTarget, scope), 'CAPABILITY_TARGET_UNMET');
        capability = copy(r.value); return r;
      },
      readOriginal: async args => {
        const r = await trusted(readOriginal, args);
        if (record(r?.value)) { const { bytes: _bytes, ...metadata } = r.value; originalMetadata = copy(metadata); }
        return r;
      },
      readBinding: args => trusted(readBinding, args),
    });
    demand(plan.state !== 'blocked', plan.code || 'PLAN_BLOCKED');
    const evidence = copy({ staff, reservation, capability, originalMetadata });
    if (pinned) {
      demand(same(evidence, pinned.evidence), 'REVIEW_EVIDENCE_CHANGED');
      demand(same(plan.scope, pinned.plan.scope) && same(plan.reference, pinned.plan.reference), 'REVIEW_REFERENCE_CHANGED');
      demand(Date.parse(plan.expiresAt) >= Date.parse(pinned.plan.expiresAt), 'REVIEW_WINDOW_CHANGED');
      demand(clock() < pinned.deadline, 'REVIEW_EXPIRED', 410);
    }
    return { plan, evidence, staff, reservation };
  };
  const publicReview = (entry, state) => ({ state, reviewReference: entry.reference,
    summary: { requestId: entry.plan.scope.requestId, invitationId: entry.plan.scope.invitationId,
      organizationId: entry.plan.scope.organizationId, vendorId: entry.plan.scope.vendorId,
      originalFilename: entry.evidence.originalMetadata.originalFilename, sha256: entry.plan.reference.sha256,
      sizeBytes: entry.plan.reference.sizeBytes, expiresAt: entry.plan.expiresAt },
    needsHumanConfirmation: state === 'planned', metadataWrites: state === 'bound',
  });
  const matchesBinding = (b, expected) => record(b) && SCOPE.every(k => b[k] === expected[k])
    && same(b.reference, expected.reference) && b.boundBy === expected.boundBy
    && b.expiresAt === expected.expiresAt && b.revokedAt === null && b.revokedBy === null
    && Number.isFinite(Date.parse(b.boundAt)) && Date.parse(b.boundAt) <= clock()
    && Date.parse(b.boundAt) < Date.parse(b.expiresAt) && Date.parse(b.expiresAt) > clock()
    && (expected.boundAt ? b.boundAt === expected.boundAt : Date.parse(b.boundAt) >= expected.notBefore);

  const verify = async (request, entry, expected, receipt) => {
    // Full planner rerun hashes bytes, checks live membership/capability, and
    // repeats reads. A final read compares the entire binding, not just raw ID.
    const current = await planFor(request, entry.reservationId, entry.rawUploadId, entry);
    const r = await trusted(readBinding, entry.plan.scope);
    const staff = await staffFor(request);
    demand(same(staff, entry.staff), 'REVIEW_STAFF_CHANGED', 403);
    const reservation = await reservationFor(entry.reservationId, staff);
    demand(same(reservation, entry.reservation), 'RESERVATION_CHANGED');
    const cap = await trusted(readCapability, { opsActorId: staff.actorId, ownerScope: entry.plan.scope.ownerScope,
      scope: entry.plan.scope, staff });
    demand(exact(cap, ['state', 'value']) && cap.state === 'found' && same(cap.value, entry.evidence.capability), 'REVIEW_CAPABILITY_CHANGED');
    // Reauthorization above awaits trusted reads: the earlier binding can be
    // revoked/replaced meanwhile. Compare the complete final snapshot, including
    // boundAt/by, expiry, revocation and all immutable reference fields. There
    // must be no await after this read before deciding the result. This is an
    // observation, not a lease preventing changes after the final snapshot.
    const finalBinding = await trusted(readBinding, entry.plan.scope);
    demand(same(finalBinding, r), 'BINDING_VERIFICATION_UNMET');
    demand(clock() < entry.deadline, 'REVIEW_EXPIRED', 410);
    if (exact(finalBinding, ['state']) && finalBinding.state === 'absent' && current.plan.state === 'planned') return 'not_found';
    demand(exact(finalBinding, ['state', 'value']) && finalBinding.state === 'found' && current.plan.state === 'unchanged'
      && matchesBinding(finalBinding.value, expected), 'BINDING_VERIFICATION_UNMET');
    if (receipt) demand(matchesBinding(receipt, expected) && same(receipt, finalBinding.value), 'BINDING_RECEIPT_MISMATCH');
    return 'bound';
  };

  return Object.freeze({ async fetch(request) {
    let action;
    try {
      if (enabled !== true || !localOrigin) return response(404, { state: 'disabled', code: 'LOCAL_SIMULATION_DISABLED' });
      demand([readStaff, readReservation, readCapability, readOriginal, readBinding].every(f => typeof f === 'function')
        && typeof now === 'function' && typeof makeReference === 'function', 'LOCAL_ADAPTERS_UNMET', 503);
      demand(!persistent || stateStore !== null && ['saveReview', 'getReview', 'getAttempt', 'claimAttempt']
        .every(k => typeof stateStore[k] === 'function'), 'LOCAL_STATE_STORE_UNMET', 503);
      demand(new URL(request.url).origin === localOrigin && request.headers.get('origin') === localOrigin
        && (!request.headers.has('sec-fetch-site') || request.headers.get('sec-fetch-site') === 'same-origin'), 'ORIGIN_REJECTED', 403);
      demand(request.method === 'POST', 'METHOD_NOT_ALLOWED', 405);
      const input = await bodyOf(request);
      demand(record(input), 'INVALID_INPUT', 400);
      action = input.action;
      if (input.action === 'plan') {
        demand(exact(input, ['action', 'reservationId', 'rawUploadId']) && opaque(input.reservationId) && uuid(input.rawUploadId), 'INVALID_INPUT', 400);
        const observed = await planFor(request, input.reservationId, input.rawUploadId);
        demand(persistent || reviews.size < MAX_RECORDS, 'LOCAL_CAPACITY_REACHED', 503);
        const reference = makeReference();
        demand(opaque(reference) && reference.length >= 24 && !reviews.has(reference), 'REVIEW_REFERENCE_UNMET', 503);
        const key = JSON.stringify(SCOPE.map(k => observed.plan.scope[k]));
        const previous = persistent ? await attemptFor(observed.plan.scope, input.reservationId)
          : attempts.get(key) || reservationAttempts.get(input.reservationId);
        if (previous) {
          demand(same(observed.plan.scope, scopeOf(previous.expected)) && same(observed.plan.reference, previous.expected.reference), 'BINDING_CONFLICT');
          demand(clock() < Date.parse(previous.expected.expiresAt), 'REVIEW_EXPIRED', 410);
          observed.plan = copy({ ...observed.plan, expiresAt: previous.expected.expiresAt });
        }
        const entry = { ...observed, reference, reservationId: input.reservationId, rawUploadId: input.rawUploadId,
          deadline: Date.parse(observed.plan.expiresAt) };
        entry.key = key;
        if (persistent) await storeCall('saveReview', entry);
        else reviews.set(reference, entry);
        return response(200, publicReview(entry, previous && (previous.state !== 'bound' || observed.plan.state !== 'unchanged') ? 'uncertain' : entry.plan.state));
      }
      const isBind = input.action === 'bind', isRecover = input.action === 'recover';
      demand((isBind && exact(input, ['action', 'reviewReference', 'humanConfirmed']) && input.humanConfirmed === true
        || isRecover && exact(input, ['action', 'reviewReference'])) && opaque(input.reviewReference), 'INVALID_INPUT', 400);
      const entry = persistent ? await storeCall('getReview', input.reviewReference) : reviews.get(input.reviewReference);
      if (persistent) demand(entry === null || record(entry) && entry.reference === input.reviewReference, 'STATE_STORE_UNKNOWN', 503);
      demand(entry, 'REVIEW_UNAVAILABLE', 404);
      demand(clock() < entry.deadline, 'REVIEW_EXPIRED', 410);
      const current = await planFor(request, entry.reservationId, entry.rawUploadId, entry);
      const prior = persistent ? await attemptFor(entry.plan.scope, entry.reservationId)
        : attempts.get(entry.key) || reservationAttempts.get(entry.reservationId);
      if (prior) demand(same(entry.plan.scope, scopeOf(prior.expected)) && same(entry.plan.reference, prior.expected.reference), 'BINDING_CONFLICT');
      const expected = prior?.expected || copy({ ...entry.plan.scope, reference: entry.plan.reference,
        boundBy: entry.plan.boundBy || entry.staff.actorId, boundAt: entry.plan.boundAt,
        expiresAt: entry.plan.expiresAt, notBefore: clock() });
      if (isRecover || prior || current.plan.state === 'unchanged' || busy.has(entry.key)) {
        // Concurrent/in-flight writes cannot be classified as safely absent.
        if (busy.has(entry.key)) return response(202, { ...publicReview(entry, 'uncertain'), code: 'BINDING_IN_PROGRESS' });
        const state = await verify(request, entry, expected);
        if (!persistent && prior && state === 'bound') prior.state = 'bound';
        if (prior && state === 'not_found' && isBind) return response(202, { ...publicReview(entry, 'uncertain'), code: 'READ_ONLY_RECOVERY_REQUIRED' });
        // Only the authoritative attempt lookup can prove that a review was
        // never consumed. Reauthorize its evidence, then require confirmation
        // again; binding absence alone never reopens an uncertain attempt.
        if (isRecover && !prior && state === 'not_found') return response(200, publicReview(entry, 'planned'));
        return response(200, publicReview(entry, state));
      }
      demand(typeof bindOriginal === 'function', 'LOCAL_WRITER_UNMET', 503);
      if (persistent) {
        try {
          const claim = await storeCall('claimAttempt', entry, expected);
          // Neither a rejected claim nor an unknown/malformed acknowledgment
          // authorizes invocation, even if our preceding read returned null.
          demand(record(claim) && claim.claimed === true && validAttempt(claim.attempt)
            && claim.attempt.state === 'uncertain' && same(claim.attempt.expected, expected)
            && typeof claim.claimNonce === 'string' && claim.claimNonce.length > 0, 'CLAIM_NOT_CONFIRMED');
          // Claiming awaited storage: revalidate identity, capability, bytes and
          // review expiry again. The writer must still check them atomically.
          const claimedCurrent = await planFor(request, entry.reservationId, entry.rawUploadId, entry);
          if (claimedCurrent.plan.state === 'unchanged') {
            const state = await verify(request, entry, expected);
            demand(state === 'bound', 'BINDING_NOT_OBSERVED');
            return response(200, publicReview(entry, 'bound'));
          }
          const args = copy({ ...claimedCurrent.plan.rpc.args, p_expires_at: entry.plan.expiresAt });
          const receipt = copy(await bindOriginal(copy({ args, expected, staff: entry.staff,
            reviewReference: entry.reference, claimNonce: claim.claimNonce })));
          demand(matchesBinding(receipt, expected), 'BINDING_RECEIPT_MISMATCH');
          const state = await verify(request, entry, expected, receipt);
          demand(state === 'bound', 'BINDING_NOT_OBSERVED');
          return response(200, publicReview(entry, 'bound'));
        } catch {
          return response(202, { ...publicReview(entry, 'uncertain'), code: 'READ_ONLY_RECOVERY_REQUIRED', metadataWrites: false });
        }
      }
      demand(attempts.size < MAX_RECORDS, 'LOCAL_CAPACITY_REACHED', 503);
      // No await between checking and recording invocation intent. All tokens
      // for the same target share this tombstone, including failures/throws.
      busy.add(entry.key);
      const attempt = { expected, state: 'uncertain' };
      attempts.set(entry.key, attempt); reservationAttempts.set(entry.reservationId, attempt);
      try {
        const args = copy({ ...current.plan.rpc.args, p_expires_at: entry.plan.expiresAt });
        const receipt = copy(await bindOriginal(copy({ args, expected, staff: entry.staff })));
        demand(matchesBinding(receipt, expected), 'BINDING_RECEIPT_MISMATCH');
        const state = await verify(request, entry, expected, receipt);
        demand(state === 'bound', 'BINDING_NOT_OBSERVED');
        attempts.get(entry.key).state = 'bound';
        return response(200, publicReview(entry, 'bound'));
      } catch {
        return response(202, { ...publicReview(entry, 'uncertain'), code: 'READ_ONLY_RECOVERY_REQUIRED', metadataWrites: false });
      } finally { busy.delete(entry.key); }
    } catch (error) {
      if ((action === 'bind' || action === 'recover') && error instanceof Block && error.code === 'STATE_STORE_UNKNOWN') {
        return response(202, { state: 'uncertain', code: 'READ_ONLY_RECOVERY_REQUIRED', metadataWrites: false });
      }
      if (action === 'recover' && (!(error instanceof Block) || ['TRUSTED_READ_UNKNOWN', 'PLAN_INPUT_OR_READ_UNMET', 'BINDING_VERIFICATION_UNMET', 'BINDING_RECEIPT_MISMATCH'].includes(error.code))) {
        return response(202, { state: 'uncertain', code: 'READ_ONLY_RECOVERY_REQUIRED', metadataWrites: false });
      }
      return response(error instanceof Block ? error.status : 503,
        { state: 'blocked', code: error instanceof Block ? error.code : 'LOCAL_OPERATION_UNAVAILABLE', metadataWrites: false });
    }
  } });
}
