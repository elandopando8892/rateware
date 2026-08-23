import { requirePrivatePage } from './auth.js';
import { callRatewareFunction } from './rateware-api.js';
import { updatePlatform55Shell } from './platform55-shell.js';
import { approvalProgress,normalizeOnboardingQueue,onboardingAttention,onboardingOutputStage,safeCaseLabel,summarizeOnboarding } from './provider-onboarding-domain.js';

const escapeHtml=(value)=>String(value??'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const label=(value)=>String(value||'—').replaceAll('_',' ').replaceAll(':',' · ').replace(/\b\w/g,(c)=>c.toUpperCase());
const date=(value)=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat(undefined,{dateStyle:'medium'}).format(d);};
const state={queue:'all',search:'',limit:40,offset:0,total:0,rows:[],metrics:{},requestId:0,selectedId:null};
const rowsNode=document.getElementById('onboarding-rows'),detailNode=document.getElementById('onboarding-detail'),caption=document.getElementById('onboarding-caption');
const prev=document.getElementById('onboarding-prev'),next=document.getElementById('onboarding-next'),search=document.getElementById('onboarding-search');
const queueButtons=[...document.querySelectorAll('[data-onboarding-queue]')];
function updateProviderOnboardingShell(status,busy=false){updatePlatform55Shell({ pageState: {title:'Provider Onboarding',subtitle:'Evidence collection, approval readiness, and controlled delivery status.',breadcrumbs:['Service','Provider Onboarding'],status,busy} });}
function metric(id,value){const node=document.getElementById(id);if(node)node.textContent=String(value??0);}
function renderMetrics(){const m=summarizeOnboarding(state.rows,state.metrics);metric('metric-total',m.total);metric('metric-blocked',m.blocked);metric('metric-approval',m.approval);metric('metric-overdue',m.overdue);}
function renderPagination(){const start=state.total?state.offset+1:0,end=Math.min(state.offset+state.rows.length,state.total);if(caption)caption.textContent=`${start}–${end} of ${state.total}`;if(prev)prev.disabled=state.offset<=0;if(next)next.disabled=state.offset+state.limit>=state.total;}
function renderRows(){
 if(!rowsNode)return;
 if(!state.rows.length){rowsNode.innerHTML='<article class="ui-state"><strong>No cases in this queue</strong><p>Try another stage or search term.</p></article>';return;}
 rowsNode.innerHTML=state.rows.map(row=>{const approvals=approvalProgress(row);return `<button type="button" class="onboarding-row onboarding-row--${escapeHtml(onboardingAttention(row))} ${state.selectedId===row.id?'is-selected':''}" data-case-id="${escapeHtml(row.id)}">
 <span><strong>${escapeHtml(safeCaseLabel(row))}</strong><small>${escapeHtml(row.legal_entity_kind||'legal entity')} · ${escapeHtml(String(row.id).slice(0,8))}</small></span>
 <span><b>${escapeHtml(label(row.case_status))}</b><small>Updated ${escapeHtml(date(row.updated_at))}</small></span>
 <span><b>${Number(row.open_task_count||0)} open · ${Number(row.blocking_task_count||0)} blocking</b><small>${Number(row.overdue_task_count||0)} overdue · Due ${escapeHtml(date(row.due_at))}</small></span>
 <span><b>${escapeHtml(label(onboardingOutputStage(row)))}</b><small>${approvals.required?`${approvals.approved}/${approvals.required} approvals`:'No package approval'}</small></span></button>`;}).join('');
 rowsNode.querySelectorAll('[data-case-id]').forEach(button=>button.addEventListener('click',()=>selectCase(button.dataset.caseId)));
}
function renderDetail(data={}){
 const c=data.case||{},tasks=Array.isArray(data.tasks)?data.tasks:[],packages=Array.isArray(data.packages)?data.packages:[],assemblies=Array.isArray(data.assemblies)?data.assemblies:[],messages=Array.isArray(data.messages)?data.messages:[],events=Array.isArray(data.events)?data.events:[];
 const item=(title,status,meta='')=>`<li><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(meta)}</small></span><b>${escapeHtml(label(status))}</b></li>`;
 detailNode.innerHTML=`<div class="onboarding-detail-head"><p class="eyebrow">Case ${escapeHtml(String(c.id||'').slice(0,8))}</p><h2>${escapeHtml(safeCaseLabel(c))}</h2><div class="onboarding-pills"><span>${escapeHtml(label(c.case_status))}</span><span>${Number(c.blocking_task_count||0)} blockers</span><span>Revision ${Number(c.revision||0)}</span></div></div>
 <section><h3>My Work</h3><ul class="onboarding-detail-list">${tasks.length?tasks.map(t=>item(t.task_type,t.task_status,[t.requirement_code,t.blocking?'blocking':null,date(t.due_at)].filter(Boolean).join(' · '))).join(''):'<li><span><strong>No active work</strong><small>The case has no open task.</small></span></li>'}</ul></section>
 <section><h3>Approval & assembly</h3><ul class="onboarding-detail-list">${packages.map(p=>item('Release package',p.package_status,`${p.approval_count||0}/${p.required_approval_count||0} approvals`)).join('')||'<li><span><strong>No release package</strong><small>Readiness does not authorize release.</small></span></li>'}${assemblies.map(a=>item('Private form assembly',a.assembly_status,date(a.requested_at))).join('')}</ul></section>
 <section><h3>Delivery</h3><ul class="onboarding-detail-list">${messages.map(m=>item(`Message ${Number(m.followup_number||0)?'follow-up':'submission'}`,m.message_status,m.next_followup_at?`Next follow-up ${date(m.next_followup_at)}`:date(m.sent_at))).join('')||'<li><span><strong>No outbound delivery</strong><small>Human approval remains required.</small></span></li>'}</ul></section>
 <section><h3>Audit timeline</h3><ul class="onboarding-timeline">${events.map(e=>item(e.event_type,'',date(e.occurred_at))).join('')||'<li>No recorded event.</li>'}</ul></section>
 <div class="onboarding-guard"><strong>Controlled-action boundary</strong><p>This read-only workspace cannot approve, sign, assemble, send, or submit. Those commands remain separate, scoped, audited operations.</p></div>`;
}
async function selectCase(id){if(!id||!detailNode)return;state.selectedId=id;renderRows();detailNode.innerHTML='<div class="onboarding-empty">Loading case workspace…</div>';try{const response=await callRatewareFunction('shipper-directory-api','get_provider_onboarding_case',{case_id:id});if(state.selectedId!==id)return;renderDetail(response?.data||{});}catch(error){if(state.selectedId!==id)return;detailNode.innerHTML=`<div class="ui-state ui-state-error"><strong>Case could not load</strong><p>${escapeHtml(error?.message||'Request failed.')}</p></div>`;}}
async function loadCases({preserve=false}={}){
 const requestId=++state.requestId;
 updateProviderOnboardingShell('Loading provider onboarding readiness',true);
 rowsNode.innerHTML='<article class="ui-state ui-state-loading"><strong>Loading onboarding</strong><p>Resolving cases and controlled outputs.</p></article>';
 try{
  const response=await callRatewareFunction('shipper-directory-api','list_provider_onboarding_workspace',{queue:state.queue,search:state.search||undefined,limit:state.limit,offset:state.offset});
  if(requestId!==state.requestId)return;
  const data=response?.data||{};
  state.rows=Array.isArray(data.rows)?data.rows:[];state.total=Number(data.total||0);state.metrics=data.metrics||{};
  renderMetrics();renderRows();renderPagination();
  updateProviderOnboardingShell(`${state.total.toLocaleString()} onboarding case(s) loaded`);
  if(!preserve&&state.rows[0])selectCase(state.rows[0].id);else if(state.selectedId&&!state.rows.some(r=>r.id===state.selectedId)){state.selectedId=null;detailNode.innerHTML='<div class="onboarding-empty"><strong>Select a case</strong><p>Inspect its controlled workflow.</p></div>';}
 }
 catch(error){
  if(requestId!==state.requestId)return;
  state.rows=[];state.total=0;rowsNode.innerHTML=`<article class="ui-state ui-state-error"><strong>Onboarding could not load</strong><p>${escapeHtml(error?.message||'Request failed.')}</p></article>`;
  renderMetrics();renderPagination();
  updateProviderOnboardingShell('Provider onboarding readiness could not load');
 }
}
queueButtons.forEach(button=>button.addEventListener('click',()=>{state.queue=normalizeOnboardingQueue(button.dataset.onboardingQueue);state.offset=0;queueButtons.forEach(b=>b.classList.toggle('is-active',b.dataset.onboardingQueue===state.queue));loadCases({preserve:true});}));
let timer;search?.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{state.search=search.value.trim();state.offset=0;loadCases({preserve:true});},250);});
prev?.addEventListener('click',()=>{state.offset=Math.max(0,state.offset-state.limit);loadCases({preserve:true});});next?.addEventListener('click',()=>{if(state.offset+state.limit<state.total){state.offset+=state.limit;loadCases({preserve:true});}});
await requirePrivatePage();await loadCases();
