import test from 'node:test';
import assert from 'node:assert/strict';
import { complianceEvidenceQualifies, evaluateProviderCompliance, validateComplianceRuleDraft } from '../src/provider-service-compliance-domain.js';
const NOW=new Date('2026-08-13T20:00:00Z');

test('only verified evidence qualifies',()=>{
  assert.equal(complianceEvidenceQualifies({evidenceKind:'document',status:'active',documentEffectiveState:'verified'}),true);
  assert.equal(complianceEvidenceQualifies({evidenceKind:'document',status:'active',documentEffectiveState:'needs_review'}),false);
  assert.equal(complianceEvidenceQualifies({evidenceKind:'external',status:'active',verifiedAt:'2026-08-13T19:00:00Z',verifiedByUserId:'reviewer'}),true);
});

test('blocking failure produces non-compliance and hold recommendation',()=>{
  const result=evaluateProviderCompliance([{result:'fail',isRequired:true,isBlocking:true}],NOW);
  assert.equal(result.status,'non_compliant');
  assert.equal(result.holdRecommended,true);
});

test('expired blocking evidence produces expired hold',()=>{
  const result=evaluateProviderCompliance([{result:'pass',isRequired:true,isBlocking:true,validUntil:'2026-08-13T19:00:00Z'}],NOW);
  assert.equal(result.status,'expired');
  assert.equal(result.holdRecommended,true);
});

test('a pass that requires evidence remains review-required without qualifying evidence',()=>{
  const result=evaluateProviderCompliance([{result:'pass',isRequired:true,isBlocking:true,evidenceRequired:true,evidence:[{evidenceKind:'document',status:'active',documentEffectiveState:'needs_review'}]}],NOW);
  assert.equal(result.status,'review_required');
});

test('verified evidence permits compliant result',()=>{
  const result=evaluateProviderCompliance([{result:'pass',isRequired:true,isBlocking:true,evidenceRequired:true,evidence:[{evidenceKind:'document',status:'active',documentEffectiveState:'verified'}]}],NOW);
  assert.equal(result.status,'compliant');
});

test('dynamic SQL evaluators are forbidden',()=>{
  assert.throws(()=>validateComplianceRuleDraft({ruleCode:'authority_valid',evaluatorCode:'authority_check',evaluatorSql:'select true'}),/Dynamic SQL/);
});
