import test from 'node:test';import assert from 'node:assert/strict';import{deriveProviderHealthDimensions,evaluateProviderHealth,providerHealthPriority}from'../src/provider-service-health-domain.js';
const p={activation_weight:20,documents_weight:15,cases_weight:15,communications_weight:10,compliance_weight:25,integrations_weight:15,critical_max:49,at_risk_max:69,watch_max:84,hard_blocker_cap:25};
test('healthy',()=>assert.equal(evaluateProviderHealth({activation_status:'activated',compliance_status:'compliant'},p).state,'healthy'));
test('hard blocker',()=>{const r=evaluateProviderHealth({activation_status:'activated',compliance_status:'non_compliant'},p);assert.equal(r.state,'critical');assert.ok(r.score<=25);});
test('dimensions',()=>{const d=deriveProviderHealthDimensions({document_attention_count:2,needs_reply_count:2,required_integration_count:4,ready_integration_count:3});assert.equal(d.documents,50);assert.equal(d.communications,60);assert.equal(d.integrations,75);});
test('weights',()=>assert.throws(()=>evaluateProviderHealth({},{}),/total 100/));
test('priority',()=>{assert.equal(providerHealthPriority({state:'critical'}),1);assert.equal(providerHealthPriority({state:'healthy'}),5);});
