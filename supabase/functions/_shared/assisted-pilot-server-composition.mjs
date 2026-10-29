import {createAuthenticatedAssistedPilotRuntime} from './assisted-pilot-runtime.mjs';
// Reuses Rateware's already installed SDK/client factory. Never exports a key,
// creates a different provider, or shares a privileged SDK object with Loads.
/** @param {{origin?:string,pilot?:Record<string,any>|null,getClient?:()=>any,
 * isEnabled?:()=>boolean,now?:()=>number}} [options] */
export function createAssistedPilotServerRuntime({origin,pilot,getClient,isEnabled,now=Date.now}={}){
 if(typeof getClient!=='function'||typeof isEnabled!=='function')throw Error('ASSISTED_SERVER_CONFIG');
 const client=getClient();
 const runtime=createAuthenticatedAssistedPilotRuntime({enabled:true,origin,pilot,authClient:client.auth,workspaceClient:client,
  operationClient:{rpc:(name,args)=>{if(isEnabled()!==true)throw Error('PILOT_DISABLED');return client.rpc(name,args);}},storageClient:client.storage,now});
 const current=()=>isEnabled()===true&&runtime.config().available===true;
 return Object.freeze({config:()=>({...runtime.config(),available:current()}),
  register:(...args)=>{if(!current())throw Error('PILOT_DISABLED');return runtime.register(...args);},
  recover:(...args)=>{if(!current())throw Error('PILOT_DISABLED');return runtime.recover(...args);},
  fetch:request=>current()?runtime.fetch(request):Response.json({code:'PILOT_DISABLED'},{status:503})});
}
