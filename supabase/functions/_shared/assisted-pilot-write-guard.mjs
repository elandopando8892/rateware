const actions=new Set(['submit_bid','confirm_prepared_bid','recover_bid_confirmation','commit_prepared_bid']);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const deny=(code,status)=>Response.json({code,confirmed:false,submissionEnabled:false},{status,
 headers:{'cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});

// Restricts only the explicitly selected preparation pilot. Selection survives
// disable/expiry so a failed canary never falls through to B1/legacy submission.
// The injected token resolver MUST be read-only (legacy-token migration false).
/** @param {{configuration?:unknown,configurationPresent?:boolean,
 * resolveInvitationByToken?:(token:string)=>Promise<{id?:unknown}|null>}} [options] */
export function createAssistedPilotWriteGuard({configuration,configurationPresent=false,resolveInvitationByToken}={}){
 const config=configuration===undefined?null:structuredClone(configuration);
 return async body=>{
  if(!actions.has(body?.action)||configurationPresent===false)return null;
  if(!plain(config)||Object.keys(config).some(k=>!['enabled','installationVerified','pilot'].includes(k)))return deny('ASSISTED_SELECTION_UNAVAILABLE',503);
  if(config.pilot===null&&config.enabled===false)return null;
  if(!plain(config.pilot)||!uuid(config.pilot.invitationId))return deny('ASSISTED_SELECTION_UNAVAILABLE',503);
  const selected=config.pilot.invitationId.toLowerCase();
  if(uuid(body.invitationId)&&body.invitationId.toLowerCase()===selected)return deny('ASSISTED_PREPARATION_ONLY',409);
  if(typeof body.token!=='string'||!body.token.trim()||body.token.length>8192||typeof resolveInvitationByToken!=='function')return deny('ASSISTED_TARGET_UNAVAILABLE',403);
  try{
   const invitation=await resolveInvitationByToken(body.token);
   if(!uuid(invitation?.id))return deny('ASSISTED_TARGET_UNAVAILABLE',403);
   return invitation.id.toLowerCase()===selected?deny('ASSISTED_PREPARATION_ONLY',409):null;
  }catch{return deny('ASSISTED_TARGET_UNAVAILABLE',503);}
 };
}
