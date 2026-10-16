import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverGovernableSurfaces,validateActionContract} from '../tools/action-contract-lib.mjs';
import {ACTION_CONTRACT} from '../tools/effective-action-contract.mjs';

test('Radar link issuance and its two SQL guards have explicit reviewed contracts',()=>{
  const ids=new Set(['edge.rateware-api.create_rfx_rfi_magic_link',
    'rpc.public.guard_rfx_radar_origin()',
    'rpc.public.issue_rfx_rfi_link_once(uuid,text,text,text,text,integer,jsonb)']);
  const actual=discoverGovernableSurfaces(process.cwd()).filter(s=>ids.has(s.canonicalId));
  const contract={...ACTION_CONTRACT,surfaces:ACTION_CONTRACT.surfaces.filter(s=>ids.has(s.canonicalId)),
    nonGovernableDeclarations:[],expectedCounts:{governable:3,edge:1,postgres:2,ratewareApi:1}};
  assert.equal(actual.length,3);
  const result=validateActionContract(contract,actual,{repoRoot:process.cwd()});
  assert.deepEqual(result.issues.filter(i=>i.level==='error'),[]);
  for(const s of contract.surfaces.filter(s=>s.sourceKind==='postgres-function'))
    assert.equal(s.exposure,'internal/service-role');
});
