const text=(value)=>value==null?'':String(value).trim();
const number=(value)=>Number.isFinite(Number(value))?Number(value):0;
export const ONBOARDING_QUEUES=Object.freeze(['all','draft','evidence_collection','blocked','ready_for_approval','closed','overdue']);
export function normalizeOnboardingQueue(value){const queue=text(value).toLowerCase()||'all';return ONBOARDING_QUEUES.includes(queue)?queue:'all';}
export function onboardingStage(row={}){return text(row.case_status).toLowerCase()||'draft';}
export function onboardingOutputStage(row={}){
  if(row.latest_message_status)return `delivery:${text(row.latest_message_status).toLowerCase()}`;
  if(row.latest_assembly_status)return `assembly:${text(row.latest_assembly_status).toLowerCase()}`;
  if(row.latest_package_status)return `package:${text(row.latest_package_status).toLowerCase()}`;
  return 'not_started';
}
export function onboardingAttention(row={}){
  if(number(row.overdue_task_count)>0)return 'critical';
  if(onboardingStage(row)==='blocked'||number(row.blocking_task_count)>0)return 'attention';
  if(onboardingStage(row)==='ready_for_approval')return 'approval';
  return 'normal';
}
export function approvalProgress(row={}){const required=number(row.required_approval_count);return Object.freeze({approved:number(row.approval_count),required,complete:required>0&&number(row.approval_count)>=required});}
export function summarizeOnboarding(rows=[],server=null){
  if(server&&typeof server==='object')return Object.freeze({total:number(server.total),blocked:number(server.blocked),approval:number(server.approval),overdue:number(server.overdue)});
  const list=Array.isArray(rows)?rows:[];
  return Object.freeze({total:list.length,blocked:list.filter(r=>onboardingStage(r)==='blocked').length,approval:list.filter(r=>onboardingStage(r)==='ready_for_approval').length,overdue:list.filter(r=>number(r.overdue_task_count)>0).length});
}
export function safeCaseLabel(row={}){const program=text(row.program_code).replaceAll('_',' ');const jurisdiction=text(row.jurisdiction_code);return [program,jurisdiction].filter(Boolean).join(' · ')||'Onboarding case';}

// --- Pipeline -------------------------------------------------------------
// The brief's 15 stages span three tracked dimensions: the case status, the
// controlled-output status, and delivery. A case occupies exactly one pipeline
// stage; the later stages are derived from the output chain rather than from
// case_status, which stops advancing once the package exists.
export const PIPELINE_STAGES=Object.freeze([
  Object.freeze({code:'received',label:'Received',group:'intake'}),
  Object.freeze({code:'matched',label:'Matched',group:'intake'}),
  Object.freeze({code:'evidence_collection',label:'Evidence collection',group:'intake'}),
  Object.freeze({code:'field_review',label:'Field review',group:'review'}),
  Object.freeze({code:'ready_for_approval',label:'Ready for approval',group:'review'}),
  Object.freeze({code:'package_approved',label:'Package approved',group:'release'}),
  Object.freeze({code:'signature_pending',label:'Signature pending',group:'release'}),
  Object.freeze({code:'assembly_ready',label:'Assembly ready',group:'release'}),
  Object.freeze({code:'ready_to_send',label:'Ready to send',group:'delivery'}),
  Object.freeze({code:'sent',label:'Sent',group:'delivery'}),
  Object.freeze({code:'waiting_provider',label:'Waiting provider',group:'delivery'}),
  Object.freeze({code:'additional_information',label:'Additional information',group:'delivery'}),
  Object.freeze({code:'activated',label:'Activated',group:'closed'}),
  Object.freeze({code:'closed',label:'Closed',group:'closed'}),
  Object.freeze({code:'blocked',label:'Blocked',group:'exception'}),
  Object.freeze({code:'cancelled',label:'Cancelled',group:'exception'}),
]);
const STAGE_CODES=new Set(PIPELINE_STAGES.map(stage=>stage.code));

/**
 * Resolves the single pipeline stage a case occupies.
 * Terminal and exception states win over progress; delivery beats assembly,
 * assembly beats package, and the case status is the fallback.
 */
export function pipelineStage(row={}){
  const status=onboardingStage(row);
  if(status==='cancelled')return 'cancelled';
  if(status==='blocked')return 'blocked';
  if(status==='activated')return 'activated';
  if(status==='closed')return 'closed';

  const message=text(row.latest_message_status).toLowerCase();
  if(message){
    if(message==='awaiting_reply'||message==='sent')return 'waiting_provider';
    if(message==='information_requested')return 'additional_information';
    if(message==='draft'||message==='approved')return 'ready_to_send';
    if(message==='delivered')return 'sent';
  }
  const assembly=text(row.latest_assembly_status).toLowerCase();
  if(assembly==='assembled')return 'assembly_ready';
  if(assembly==='queued'||assembly==='assembling')return 'signature_pending';

  const pkg=text(row.latest_package_status).toLowerCase();
  if(pkg==='approved')return 'package_approved';
  if(pkg==='draft'||pkg==='requested')return 'ready_for_approval';

  if(status==='ready_for_approval')return 'ready_for_approval';
  if(status==='field_review')return 'field_review';
  if(status==='evidence_collection')return 'evidence_collection';
  if(status==='matched')return 'matched';
  return 'received';
}

/** Counts cases per pipeline stage. Stages with no cases are retained at zero. */
export function pipelineCounts(rows=[]){
  const counts=Object.fromEntries(PIPELINE_STAGES.map(stage=>[stage.code,0]));
  for(const row of Array.isArray(rows)?rows:[]){
    const stage=pipelineStage(row);
    if(STAGE_CODES.has(stage))counts[stage]+=1;
  }
  return Object.freeze(counts);
}

// --- Case workspace -------------------------------------------------------

/** True when a case has nothing outstanding that a human must resolve. */
export function caseIsClear(row={}){
  return number(row.blocking_task_count)===0&&number(row.overdue_task_count)===0;
}

/**
 * Summarizes the controlled-output chain for the case workspace.
 * Each step reports whether it is done, pending, or not yet reachable, so the
 * operator sees which gate is actually next rather than a flat status list.
 */
export function outputChain(detail={}){
  const packages=Array.isArray(detail.packages)?detail.packages:[];
  const assemblies=Array.isArray(detail.assemblies)?detail.assemblies:[];
  const messages=Array.isArray(detail.messages)?detail.messages:[];
  const latestPackage=packages[0]||null;
  const latestAssembly=assemblies[0]||null;
  const latestMessage=messages[0]||null;
  const approvals=latestPackage?approvalProgress({approval_count:latestPackage.approval_count,required_approval_count:latestPackage.required_approval_count}):approvalProgress({});

  const step=(code,label,state,detailText)=>Object.freeze({code,label,state,detail:detailText});
  const packageState=!latestPackage?'unreachable':text(latestPackage.package_status).toLowerCase()==='revoked'?'revoked':approvals.complete?'done':'pending';
  const assemblyState=!latestAssembly?(packageState==='done'?'pending':'unreachable')
    :text(latestAssembly.assembly_status).toLowerCase()==='assembled'?'done'
    :text(latestAssembly.assembly_status).toLowerCase()==='failed'?'failed':'pending';
  const deliveryState=!latestMessage?(assemblyState==='done'?'pending':'unreachable')
    :['delivered','sent'].includes(text(latestMessage.message_status).toLowerCase())?'done'
    :text(latestMessage.message_status).toLowerCase()==='failed'?'failed':'pending';

  return Object.freeze([
    step('package','Release package',packageState,latestPackage?`${approvals.approved}/${approvals.required} approvals`:'No package requested'),
    step('assembly','Private assembly',assemblyState,latestAssembly?text(latestAssembly.assembly_status)||'—':'Not requested'),
    step('delivery','Gmail delivery',deliveryState,latestMessage?text(latestMessage.message_status)||'—':'Not prepared'),
  ]);
}

/** The next gate an operator must clear, or null when the chain is complete. */
export function nextGate(detail={}){
  const blocked=number(detail?.case?.blocking_task_count)>0;
  if(blocked)return Object.freeze({code:'tasks',label:'Resolve blocking work'});
  const pending=outputChain(detail).find(step=>step.state==='pending'||step.state==='failed');
  return pending?Object.freeze({code:pending.code,label:pending.label}):null;
}

/** Groups case tasks into blocking, overdue and routine buckets for My Work. */
export function groupTasks(tasks=[],now=Date.now()){
  const list=Array.isArray(tasks)?tasks:[];
  const overdue=[],blocking=[],routine=[];
  for(const task of list){
    const due=Date.parse(text(task.due_at));
    if(Number.isFinite(due)&&due<now)overdue.push(task);
    else if(task.blocking===true)blocking.push(task);
    else routine.push(task);
  }
  return Object.freeze({overdue:Object.freeze(overdue),blocking:Object.freeze(blocking),routine:Object.freeze(routine)});
}
