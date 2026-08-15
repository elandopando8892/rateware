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
