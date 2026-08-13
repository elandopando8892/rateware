import { createHash } from 'node:crypto';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

export function fingerprintProviderIntegrationPayload(payload) {
  const canonical=JSON.stringify(canonicalize(payload ?? {}));
  return createHash('sha256').update(canonical,'utf8').digest('hex');
}

export function buildProviderIntegrationIdempotencyKey(input) {
  if (!input || typeof input!=='object') throw new TypeError('Integration command input is required.');
  const systemCode=String(input.systemCode ?? '').trim().toLowerCase();
  const relationshipId=String(input.providerRelationshipId ?? '').trim();
  const actionCode=String(input.actionCode ?? '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(systemCode)) throw new TypeError('Invalid integration system code.');
  if (!relationshipId) throw new TypeError('providerRelationshipId is required.');
  if (!/^[a-z][a-z0-9_]{1,127}$/.test(actionCode)) throw new TypeError('Invalid integration action code.');
  const payloadHash=fingerprintProviderIntegrationPayload(input.payload ?? {});
  return createHash('sha256').update(`${systemCode}|${relationshipId}|${actionCode}|${payloadHash}`,'utf8').digest('hex');
}

export function evaluateProviderSystemMapping(input) {
  if (!input || typeof input!=='object') return Object.freeze({state:'not_configured',ready:false});
  const status=String(input.status ?? 'not_configured').trim().toLowerCase();
  if (status!=='active') return Object.freeze({state:status,ready:false});
  if (!input.externalReferencePresent) return Object.freeze({state:'incomplete',ready:false});
  if (input.expectedFingerprint && input.actualFingerprint && input.expectedFingerprint!==input.actualFingerprint) {
    return Object.freeze({state:'drift',ready:false});
  }
  if (input.reconciliationStatus && input.reconciliationStatus!=='in_sync') {
    return Object.freeze({state:String(input.reconciliationStatus),ready:false});
  }
  return Object.freeze({state:'ready',ready:true});
}

export function evaluateProviderIntegrationReadiness(mappings) {
  const rows=Array.isArray(mappings)?mappings:[];
  const required=rows.filter(row=>row.requiredForActivation===true);
  if (required.length===0) return Object.freeze({state:'not_configured',ready:false,requiredCount:0,readyCount:0});
  const states=required.map(evaluateProviderSystemMapping);
  const readyCount=states.filter(row=>row.ready).length;
  const state=readyCount===required.length?'ready':states.some(row=>row.state==='error')?'error':states.some(row=>row.state==='drift')?'drift':'in_progress';
  return Object.freeze({state,ready:state==='ready',requiredCount:required.length,readyCount});
}

export function nextProviderIntegrationRetryAt(attemptCount, now=new Date()) {
  const attempt=Number(attemptCount);
  if (!Number.isSafeInteger(attempt)||attempt<1) throw new TypeError('attemptCount must be a positive integer.');
  const current=now instanceof Date?now:new Date(now);
  const delayMinutes=Math.min(60,2**Math.min(attempt-1,5));
  return new Date(current.getTime()+delayMinutes*60_000);
}
