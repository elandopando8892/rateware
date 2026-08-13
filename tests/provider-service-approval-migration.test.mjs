import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const core=readFileSync(new URL('../supabase/migrations/20260813180000_provider_service_approvals.sql',import.meta.url),'utf8');
const commands=readFileSync(new URL('../supabase/migrations/20260813180050_provider_service_approval_commands.sql',import.meta.url),'utf8');
test('approval IDs and specialized modes are explicit',()=>{assert.match(core,/APR-' \|\| legal_entity_code/);assert.match(core,/human','finance','legal','executive/);});
test('requester cannot self-approve',()=>{assert.match(core,/provider_approval_requests_separation_check/);assert.match(commands,/Requester cannot decide the same approval/);});
test('expired approvals cannot be consumed',()=>{assert.match(commands,/Approval request has expired/);assert.match(commands,/Only approved requests can be consumed/);});
