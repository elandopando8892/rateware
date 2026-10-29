import {createHash} from 'node:crypto';

const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const keys=['verified','actorId','tokenHash','expiresAt'];

// Called ONLY after auth.getUser has accepted this exact bearer. The private
// ledger is issued by Loads after the trusted Google exchange, read by the
// existing Rateware server client. No linked-provider or JWT-decode fallback.
// A refreshed/different bearer needs its own Google proof; B1 is unchanged.
export function createGoogleSessionVerifier({rpc,now=Date.now}={}){
  if(typeof rpc!=='function'||typeof now!=='function')throw Error('GOOGLE_SESSION_CONFIG');
  return async(token,actorId)=>{
    try{
      if(typeof token!=='string'||token.length===0||token.length>8192||!uuid(actorId))return false;
      const tokenHash=createHash('sha256').update(token).digest('hex');
      const result=await rpc('loads_google_production_session_read_v1',{p_token_hash:tokenHash,p_actor_id:actorId});
      const value=result?.data;
      return record(result)&&result.error===null&&record(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k))
        &&value.verified===true&&value.actorId===actorId&&value.tokenHash===tokenHash
        &&typeof value.expiresAt==='string'&&Number.isFinite(Date.parse(value.expiresAt))&&Date.parse(value.expiresAt)>now();
    }catch{return false;} // No retry, injected errors/tokens never escape.
  };
}
