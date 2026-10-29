import {createHash, randomBytes} from 'node:crypto';

// Server-only, request-bound ports. Does not create a client, read environment,
// retry RPCs, expose service credentials or start a network listener.
const hash = v => createHash('sha256').update(v).digest('hex');
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const canon = v => Array.isArray(v) ? v.map(canon) : object(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])) : v;
const same = (a,b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const exact = (v,keys) => object(v) && Object.keys(v).length === keys.length && keys.every(k=>Object.hasOwn(v,k));
const demand = (ok,code='OPS_STORE_UNKNOWN') => {if(!ok) throw Object.assign(Error(code),{code});};
const opaque = v => typeof v==='string' && /^[A-Za-z0-9_-]{24,160}$/.test(v);
const scopeKeys = ['actorId','organizationId','ownerScope','vendorId','invitationId','requestId'];
const scopeOf = s => Object.fromEntries(scopeKeys.map(k=>[k,s[k]]));
const noBytes = v => {
  if(v instanceof Uint8Array || v instanceof ArrayBuffer) return false;
  if(Array.isArray(v)) return v.every(noBytes);
  return !object(v) || Object.entries(v).every(([k,x])=>!['bytes','authorization','access_token','refresh_token','token','secret'].includes(k.toLowerCase()) && noBytes(x));
};

export function createAssistedOpsStore({request,readStaff,rpc,makeNonce=()=>randomBytes(32).toString('hex')}={}) {
  demand(request instanceof Request && [readStaff,rpc,makeNonce].every(f=>typeof f==='function'),'OPS_STORE_CONFIG');
  async function call(action,input,expectedStaff) {
    let staff;try{staff=await readStaff(request);}catch{throw Object.assign(Error('STAFF_FORBIDDEN'),{code:'STAFF_FORBIDDEN'});}
    if(expectedStaff) demand(same(staff,expectedStaff),'REVIEW_STAFF_CHANGED');
    let result;
    try { result=await rpc('rateware_assisted_ops_state_local_v1',{p_staff:staff,p_action:action,p_input:input}); }
    catch { throw Object.assign(Error('OPS_STORE_UNKNOWN'),{code:'OPS_STORE_UNKNOWN'}); }
    if(result?.error?.code==='P0001'){
      const known={OPS_STAFF_FORBIDDEN:'STAFF_FORBIDDEN',OPS_TARGET_FORBIDDEN:'STAFF_FORBIDDEN',OPS_CAPABILITY_FORBIDDEN:'STAFF_FORBIDDEN',
        OPS_ATTEMPT_FORBIDDEN:'STAFF_FORBIDDEN',OPS_REVIEW_EXPIRED:'REVIEW_EXPIRED',OPS_TARGET_EXPIRED:'REVIEW_EXPIRED',
        OPS_TARGET_CHANGED:'REVIEW_EVIDENCE_CHANGED',OPS_TARGET_CLOSED:'REVIEW_EVIDENCE_CHANGED'};
      const code=known[result.error.message];if(code)throw Object.assign(Error(code),{code});
    }
    demand(object(result) && result.error===null && object(result.data));return result.data;
  }
  function found(result) {
    if(exact(result,['state']) && result.state==='absent') return null;
    demand(exact(result,['state','value']) && result.state==='found' && object(result.value));return result.value;
  }
  return Object.freeze({
    async saveReview(entry) {
      demand(opaque(entry?.reference) && noBytes(entry),'OPS_REVIEW_INVALID');
      const {reference,...stored}=structuredClone(entry);
      demand(new TextEncoder().encode(JSON.stringify(stored)).byteLength<=32768,'OPS_REVIEW_INVALID');
      const r=await call('save_review',{referenceHash:hash(reference),entry:stored},entry.staff);
      demand(exact(r,['saved']) && r.saved===true);
    },
    async getReview(reference) {
      demand(opaque(reference),'OPS_REVIEW_INVALID');
      const v=found(await call('get_review',{referenceHash:hash(reference)}));
      if(!v) return null;
      demand(!Object.hasOwn(v,'reference') && noBytes(v));
      return {...v,reference};
    },
    async getAttempt(scope,reservationId) {
      demand(exact(scope,scopeKeys) && opaque(reservationId),'OPS_ATTEMPT_INVALID');
      const v=found(await call('get_attempt',{scope,reservationId}));
      if(v) demand(exact(v,['expected','state']) && object(v.expected) && ['uncertain','bound'].includes(v.state)
        && same(scopeOf(v.expected),scope));
      return v;
    },
    async claimAttempt(entry,expected) {
      demand(opaque(entry?.reference) && same(entry.plan.scope,scopeOf(expected))
        && Number.isSafeInteger(expected.notBefore),'OPS_ATTEMPT_INVALID');
      const nonce=makeNonce();demand(typeof nonce==='string' && /^[a-f0-9]{64}$/.test(nonce),'OPS_ATTEMPT_INVALID');
      const r=await call('claim_attempt',{referenceHash:hash(entry.reference),expected,claimNonce:nonce},entry.staff);
      demand(exact(r,r.claimed===true?['claimed','attempt','claimNonce']:['claimed','attempt']) && typeof r.claimed==='boolean'
        && exact(r.attempt,['expected','state']) && ['uncertain','bound'].includes(r.attempt.state)
        && same(scopeOf(r.attempt.expected),entry.plan.scope)
        && same(r.attempt.expected.reference,expected.reference)
        && r.attempt.expected.boundBy===expected.boundBy && r.attempt.expected.expiresAt===expected.expiresAt
        && (!r.claimed || r.claimNonce===nonce));
      return r;
    }
  });
}

export function createAssistedOpsWriter({request,readStaff,rpc}={}) {
  demand(request instanceof Request && [readStaff,rpc].every(f=>typeof f==='function'),'OPS_STORE_CONFIG');
  return async ({reviewReference,claimNonce,staff}) => {
    demand(opaque(reviewReference) && /^[a-f0-9]{64}$/.test(claimNonce),'OPS_CLAIM_REQUIRED');
    const current=await readStaff(request);demand(same(current,staff),'REVIEW_STAFF_CHANGED');
    let r;
    try { r=await rpc('rateware_assisted_ops_bind_local_v1',{p_staff:current,p_review_hash:hash(reviewReference),p_claim_nonce:claimNonce}); }
    catch {throw Object.assign(Error('OPS_BIND_UNKNOWN'),{code:'OPS_BIND_UNKNOWN'});}
    demand(object(r)&&r.error===null&&object(r.data));return r.data;
  };
}

// Only the portal's trusted, revalidated reservation resolver may supply this
// DTO. Browser handoffs cannot be passed directly here. No identity grant.
export function createAssistedReservationWriter({verifyCarrierReservation,rpc}={}) {
  demand([verifyCarrierReservation,rpc].every(f=>typeof f==='function'),'OPS_STORE_CONFIG');
  return async (request,reference) => {
    demand(request instanceof Request && opaque(reference),'OPS_RESERVATION_INVALID');
    const v=await verifyCarrierReservation(request,reference);
    demand(exact(v,['privateDeliveryVerified','reservation']) && v.privateDeliveryVerified===true
      && exact(v.reservation,['id',...scopeKeys,'descriptor','sourceSignature','sourceUpdatedAt','inputDigest','verifiedAt','expiresAt'])
      && noBytes(v.reservation),'OPS_RESERVATION_INVALID');
    const r=await rpc('rateware_assisted_reserve_local_v1',{p_reservation:v.reservation});
    demand(object(r)&&r.error===null&&exact(r.data,['state','reservationId'])
      && ['reserved','unchanged'].includes(r.data.state)&&r.data.reservationId===v.reservation.id);
    return r.data;
  };
}
