import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quotaPause} from '../supabase/functions/rateware-api/gmail-send-guard.mjs';
test('a structured dailyLimitExceeded rejection pauses sends even when provider text has no quota keyword',()=>{
 const now=1000000;
 const result=quotaPause(403,{error:{errors:[{reason:'dailyLimitExceeded'}],message:'Daily Limit Exceeded'}},null,now);
 assert.equal(Date.parse(result),now+300000);
});
test('a daily-limit rejection honors a later retry-after without presuming quota is restored',()=>{
 const now=1000000;
 const result=quotaPause(403,{error:{errors:[{reason:'dailyLimitExceeded'}]}},'3600',now);
 assert.equal(Date.parse(result),now+3600000);
});
test('non-quota precondition and domain policy failures do not become quota pauses',()=>{
 for(const reason of ['failedPrecondition','domainPolicy','insufficientPermissions']) assert.equal(quotaPause(403,{error:{errors:[{reason}]}},null,1000000),null);
});
