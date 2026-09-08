import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { incrementalSql, NEXT, THIRD, FOURTH, batchPlan, migrationSql } from '../tools/advance-rateware-local-migrations.mjs';
const read = name => readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url));
test('incremental batch verifies exact predecessor and rolls back by default',()=>{
 const sql = incrementalSql(read,false);
 assert.equal(NEXT.length,8);
 assert.match(sql,/LEFT JOIN/);
 assert.match(sql,/LOCK TABLE/);
 assert.match(sql,/auth.users/);
 assert.match(sql,/ROLLBACK;$/);
 assert.doesNotMatch(sql,/cron\.schedule|net\.http_post/);
 assert.match(incrementalSql(read,true),/COMMIT;$/);
});
test('changed next migration fails before execution',()=>{
 assert.throws(()=>incrementalSql(name=>name===NEXT[0][0]?Buffer.from('select 1'):read(name),true),/Review invalidated/);
});
test('third batch pins nine files and requires all twenty predecessors',()=>{
 assert.equal(THIRD.length,9);
 const sql=incrementalSql(read,false,true);
 assert.match(sql, /<> 20/);
 assert.match(sql, /ROLLBACK;$/);
 assert.doesNotMatch(sql,/import_sourcing_base_google_sheet/);
 assert.throws(()=>incrementalSql(name=>name===NEXT[0][0]?Buffer.from('changed'):read(name),false,true),/Review invalidated/);
});
test('fourth batch separates the excluded import from applied migration rows',()=>{
 const sql=incrementalSql(read,false,false,true);
 assert.equal(FOURTH.length,7);
 assert.match(sql,/<> 29/);
 assert.match(sql,/CREATE TABLE rateware_local_control.exclusions/);
 assert.match(sql,/EXCLUDED_LOCAL_BUSINESS_DATA/);
 assert.match(sql,/ROLLBACK;$/);
 assert.doesNotMatch(sql,/delete from public.vendors/i);
 assert.throws(()=>incrementalSql(name=>name===FOURTH[1][0]?Buffer.from('changed'):read(name),true,false,true));
});
test('fifth batch requires exact applied and excluded histories without scheduling communications',()=>{
 const sql=incrementalSql(read,false,false,false,true);
 assert.match(sql,/<> 36/);
 assert.match(sql,/Exclusion ledger mismatch/);
 assert.match(sql,/RFx data must remain empty/);
 assert.match(sql,/ROLLBACK;$/);
 assert.doesNotMatch(sql,/cron\.schedule|net\.http_post/);
});
test('declarative plans preserve historical SQL and reject unreviewed batches',()=>{
 for(const value of [0,1,7,NaN,2.5]) assert.throws(()=>batchPlan(value));
 assert.deepEqual([2,3,4,5].map(n=>batchPlan(n).predecessor.length),[12,20,29,36]);
 assert.equal(migrationSql(read,false,5),incrementalSql(read,false,false,false,true));
 assert.throws(()=>incrementalSql(read,false,true,true));
});
test('sixth batch requires all 41 predecessors and limits catalog reconstruction targets',()=>{
 assert.equal(batchPlan(6).predecessor.length,41);
 const sql=migrationSql(read,false,6);
 assert.match(sql,/<> 41/);
 assert.match(sql,/Exclusion ledger mismatch/);
 assert.match(sql,/ROLLBACK;$/);
});
