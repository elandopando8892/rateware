import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProviderIntegrationIdempotencyKey,evaluateProviderIntegrationReadiness,evaluateProviderSystemMapping,fingerprintProviderIntegrationPayload,nextProviderIntegrationRetryAt } from '../src/provider-service-integration-domain.js';
test('stable fingerprint',()=>assert.equal(fingerprintProviderIntegrationPayload({b:2,a:1}),fingerprintProviderIntegrationPayload({a:1,b:2})));
test('idempotency changes with payload',()=>assert.notEqual(buildProviderIntegrationIdempotencyKey({systemCode:'fleet_rocket',providerRelationshipId:'r',actionCode:'upsert_provider',payload:{x:1}}),buildProviderIntegrationIdempotencyKey({systemCode:'fleet_rocket',providerRelationshipId:'r',actionCode:'upsert_provider',payload:{x:2}})));
test('mapping readiness',()=>{assert.equal(evaluateProviderSystemMapping({status:'active',externalReferencePresent:false}).ready,false);assert.equal(evaluateProviderSystemMapping({status:'active',externalReferencePresent:true,reconciliationStatus:'in_sync'}).ready,true);});
test('drift blocks',()=>assert.equal(evaluateProviderSystemMapping({status:'active',externalReferencePresent:true,expectedFingerprint:'a',actualFingerprint:'b'}).state,'drift'));
test('all required mappings must be ready',()=>assert.equal(evaluateProviderIntegrationReadiness([{requiredForActivation:true,status:'active',externalReferencePresent:true,reconciliationStatus:'in_sync'},{requiredForActivation:true,status:'pending'}]).ready,false));
test('retry backoff',()=>assert.equal(nextProviderIntegrationRetryAt(1,new Date('2026-08-13T20:00:00Z')).toISOString(),'2026-08-13T20:01:00.000Z'));
