import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {statementShapes,auditImport,EXCLUDED_IMPORT} from '../tools/audit-local-import-exclusion.mjs';
test('literal semicolons and escaped quotes cannot hide statement boundaries',()=>{
 assert.deepEqual(statementShapes("-- comment\ninsert into public.vendors values ('a; b''c'); delete from public.vendors where id='x';"),['insert into','delete from']);
 assert.throws(()=>statementShapes("insert into public.vendors values ('a'); create table x(id int);"));
 assert.throws(()=>statementShapes("do $$ begin end $$;"));
 assert.throws(()=>statementShapes("insert into public.vendors values ('unclosed);"));
});
test('exact import is excluded, never marked applied',()=>{
 const report=auditImport(readFileSync(new URL(`../supabase/migrations/${EXCLUDED_IMPORT}`,import.meta.url)));
 assert.equal(report.applied,false);
 assert.ok(report.statement_count>0);
 assert.throws(()=>auditImport(Buffer.from('changed')),/hash changed/);
});
