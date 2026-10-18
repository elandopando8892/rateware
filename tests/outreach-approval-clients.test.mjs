import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
import { freezeOutreachVersions } from '../src/outreach-approval.js';

const stamp='2026-10-17T10:00:00.123456+00:00';
async function service(file) {
  const bundle=await build({entryPoints:[file],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'api-boundary',setup(b){
    b.onResolve({filter:/rateware-api\.js$/},()=>({path:'api',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const callRatewareApi=(a,p)=>globalThis.approvalApi(a,p);',loader:'js'}));
  }}]});
  return import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
}
const outreach=await service('src/outreach-service.js'),ratebook=await service('src/ratebook-service.js');

test('Rateware services preserve approved microsecond versions at the API boundary',async()=>{
  const calls=[];globalThis.approvalApi=async(action,input)=>{calls.push({action,input});return{};};
  const approved=[{id:'m',updated_at:stamp}];
  await outreach.sendOutreachMessages(['m'],{expectedVersions:approved});
  await ratebook.sendRatebookDistribution('book',['m'],approved);
  assert.deepEqual(calls.map(c=>c.input.expected_versions),[approved,approved]);
  assert.deepEqual(calls.map(c=>c.action),['send_outreach_messages','send_ratebook_distribution']);
});

test('freeze requires the actual known draft version and never aliases mutable rows',()=>{
  const rows=[{id:'m',updated_at:stamp}],v=freezeOutreachVersions(['m'],rows);
  rows[0].updated_at='changed';assert.equal(v[0].updated_at,stamp);
  assert.throws(()=>freezeOutreachVersions(['unknown'],rows),/Refresh the queue/);
  assert.throws(()=>freezeOutreachVersions(['m'],[rows[0],{id:'m',updated_at:stamp}]),/Refresh the queue/);
});

const rfx=fs.readFileSync('src/rfx-events.js','utf8');
const chunk=(source,from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
test('RFx batch wrapper transmits frozen versions and stops on unknown result',async()=>{
  const source=chunk(rfx,'async function sendDraftEmailIds(','async function sendSelectedDraftEmails(');
  const calls=[],v=[{id:'a',updated_at:stamp},{id:'b',updated_at:stamp}];
  const fn=new Function('chunkRows','setStatus','formatNumber','APPROVED_GMAIL_SENDER','OUTREACH_SEND_BATCH_SIZE','rfxOutreachStatus','sendOutreachMessages',source+';return sendDraftEmailIds;')(
    ids=>ids.map(id=>[id]),()=>{},String,'sender',1,{},async(ids,options)=>{calls.push({ids,options});return{sent:0,delivery_unknown:1};});
  const result=await fn(['a','b'],{},v);
  assert.equal(calls.length,1);assert.deepEqual(calls[0].options.expectedVersions,[v[0]]);
  assert.equal(result.delivery_unknown,1);
});

test('award notice approval binds the version before the confirmation dialog',async()=>{
  const source=chunk(rfx,'async function sendAwardNoticeDrafts(','async function sendDraftEmailIds(');
  const row={id:'m',updated_at:stamp},calls=[];
  const globals={awardMutationRunning:false,selectedEventId:'event',blockIfAwardPreflightFails:()=>false,sendableAwardNoticeIds:()=>['m'],awardNoticeDraftRows:()=>[row],selectedAwardNoticeIds:()=>['m'],setStatus:()=>{},rfxAwardStatus:{},freezeOutreachVersions,humanizeError:e=>e.message,window:{confirm:()=>{row.updated_at='changed';return true;}},rfxSendAwardNoticesButton:null,formatNumber:String,sendOutreachMessages:async(ids,options)=>{calls.push({ids,options});return{sent:1};},APPROVED_GMAIL_SENDER:'sender',awardNoticeSelectedIds:new Set(),refreshOutreachStateForEvent:async()=>false,updateAwardNoticeControls:()=>{}};
  await new Function(...Object.keys(globals),source+';return sendAwardNoticeDrafts;')(...Object.values(globals))();
  assert.deepEqual(calls[0].options.expectedVersions,[{id:'m',updated_at:stamp}]);
});

test('Ratebook confirmation cannot swap selected IDs or versions after approval snapshot',async()=>{
  const source=chunk(fs.readFileSync('src/ratebook.js','utf8'),'async function sendRatebookDistributionDrafts(','async function selectRatebook(');
  const state={activeRatebookId:'book',distributionMessageIds:['m'],distributionVersions:[{id:'m',updated_at:stamp}]},calls=[];
  const globals={state,ratebookDistributionRunning:false,freezeOutreachVersions,elements:{shareStatus:{},sendDistribution:{textContent:'Send',disabled:false,classList:{add(){}}}},setStatus:()=>{},humanizeError:e=>e.message,window:{confirm:()=>{state.distributionMessageIds.push('other');state.distributionVersions[0].updated_at='changed';return true;}},sendRatebookDistribution:async(...args)=>{calls.push(args);return{sent:1};},number:String,selectRatebook:async()=>{}};
  await new Function(...Object.keys(globals),source+';return sendRatebookDistributionDrafts;')(...Object.values(globals))();
  assert.deepEqual(calls,[['book',['m'],[{id:'m',updated_at:stamp}]]]);
});
