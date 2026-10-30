import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parse} from '@babel/parser';
import {discoverSelectorSurfacesFromText,fingerprint} from '../tools/action-contract-lib.mjs';

test('reviewed Rateware routes resolve to the complete named handler, not an audit helper',()=>{
 const sourceFile=fileURLToPath(new URL('../supabase/functions/rateware-api/index.ts',import.meta.url));
 const source=readFileSync(sourceFile,'utf8');
 const actual=new Map(discoverSelectorSurfacesFromText('rateware-api',sourceFile,source).map(row=>[row.actionName,row]));
 const ast=parse(source,{sourceType:'module',plugins:['typescript']});
 const functions=new Map(ast.program.body.filter(node=>node.type==='FunctionDeclaration').map(node=>[node.id.name,node]));
 const routes={shipper_commercial_work:'handleShipperCommercialWork',replace_bounced_vendor_email:'handleReplaceBouncedVendorEmail',set_rfx_lane_no_award:'handleSetRfxLaneNoAward',list_outreach_campaigns:'handleListOutreachCampaigns',list_vendor_unmatched_ids:'handleListVendorUnmatchedIds',simulate_interpretation_memory:'handleSimulateInterpretationMemory'};
 for(const [action,handler] of Object.entries(routes)){
  const row=actual.get(action),node=functions.get(handler);
  assert.ok(row,action+' remains discoverable');assert.ok(node,handler+' must exist');
  assert.equal(row.handler,handler);assert.equal(row.handlerStatus,'named-existing');
  assert.equal(row.sourceFingerprint,fingerprint(source.slice(node.start,node.end)),action+' fingerprint must cover its complete business handler');
 }
});
