import { TrackingError } from './tracking-domain.mjs';

// Explicit pilot identity. Never inherit the default sender or accept caller-supplied IDs.
export const TRACKING_SENDER = Object.freeze({ phoneId:'1439801719206638', wabaId:'1129150979798861', appId:'1683194069554099', businessId:'4415222892057201', phone:'+19569556779', graphVersion:'v25.0' });
const fail = (status,message) => { throw new TrackingError(status,message); };
export async function encryptTrackingSecret(value, encryptionKey) {
  if (!value || !encryptionKey) fail(503,'Falta configuraciÃ³n segura del servidor.');
  const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(encryptionKey));
  const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value)));
  const b64=bytes=>btoa(String.fromCharCode(...bytes));
  return `v1:${b64(iv)}:${b64(encrypted)}`;
}
export function createTrackingSenderService({store,env,fetchImpl=fetch,now=()=>new Date()}) {
  const target=TRACKING_SENDER;
  return async ({authorization,body}) => {
    if (!['sender_status','connect_sender'].includes(body?.operation) || Object.keys(body).some(k=>k!=='operation')) fail(400,'OperaciÃ³n de emisor no permitida.');
    const token=/^Bearer ([A-Za-z0-9._~-]{32,8192})$/.exec(authorization||'')?.[1];
    if(!token) fail(401,'Inicia sesiÃ³n para configurar el emisor.');
    const user=await store.user(token);
    if(!user?.id) fail(401,'SesiÃ³n no vÃ¡lida.');
    const context=await store.context(user.id);
    if(!context?.authorized) fail(403,'Esta cuenta no puede configurar el emisor de tracking.');
    if(body.operation==='sender_status') return {sender:context.sender||null,latestEvent:context.latestEvent||null,canConnect:true,execution:'not_sent'};
    for(const name of ['WHATSAPP_ACCESS_TOKEN','WHATSAPP_APP_SECRET','WHATSAPP_TOKEN_ENCRYPTION_KEY']) if(!env[name]?.trim()) fail(503,'Falta la credencial existente del servidor; no se cambiÃ³ ninguna conexiÃ³n.');
    const get=async path=>{
      let response,data;
      try {response=await fetchImpl(`https://graph.facebook.com/${target.graphVersion}/${path}`,{headers:{authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`},redirect:'error',signal:AbortSignal.timeout(10000)});data=await response.json();}
      catch {fail(503,'No se pudo comprobar Meta; no se guardÃ³ el emisor.');}
      if(!response.ok) fail(403,'La credencial del servidor no pudo leer la cuenta nueva en Meta. No se cambiÃ³ la conexiÃ³n actual.');
      return data;
    };
    const phone=await get(`${target.phoneId}?fields=id,display_phone_number,status,platform_type,name_status`);
    if(phone.id!==target.phoneId || String(phone.display_phone_number).replace(/\D/g,'')!==target.phone.replace(/\D/g,'') || phone.status!=='CONNECTED' || phone.platform_type!=='CLOUD_API') fail(409,'El nÃºmero nuevo no coincide o aÃºn no estÃ¡ conectado a Cloud API.');
    const phones=await get(`${target.wabaId}/phone_numbers?fields=id&limit=100`);
    if(!phones.data?.some(p=>p.id===target.phoneId)) fail(409,'No se confirmÃ³ el vÃ­nculo entre nÃºmero y cuenta de mensajes.');
    const apps=await get(`${target.wabaId}/subscribed_apps`);
    if(!apps.data?.some(p=>p.whatsapp_business_api_data?.id===target.appId)) fail(409,'Falta la suscripciÃ³n de la cuenta nueva a Rateware.');
    const result=await store.save(user.id,{
      phone_id:target.phoneId,waba_id:target.wabaId,app_id:target.appId,business_id:target.businessId,graph_version:target.graphVersion,
      access_token_encrypted:await encryptTrackingSecret(env.WHATSAPP_ACCESS_TOKEN,env.WHATSAPP_TOKEN_ENCRYPTION_KEY),
      app_secret_encrypted:await encryptTrackingSecret(env.WHATSAPP_APP_SECRET,env.WHATSAPP_TOKEN_ENCRYPTION_KEY),
      name_status:phone.name_status||'UNKNOWN',validated_at:now().toISOString()
    });
    return {sender:result,execution:'not_sent',message:'Emisor separado guardado. Falta acreditar recepciÃ³n real; envÃ­os desactivados.'};
  };
}

// Minimal event receipt: no message body, sender phone, contacts or media stored.
export async function trackingEventReceipts(value,{phoneNumberId,wabaId}) {
  if(phoneNumberId!==TRACKING_SENDER.phoneId || wabaId!==TRACKING_SENDER.wabaId) fail(403,'Evento fuera del emisor de tracking.');
  const events=[];
  for(const [kind,items] of [['inbound',value.messages],['status',value.statuses]]) {
    for(const e of Array.isArray(items)?items:[]) {
      if(typeof e.id!=='string'||!e.id||e.id.length>300||!/^\d{1,12}$/.test(String(e.timestamp||''))) fail(400,'Evento de tracking no vÃ¡lido.');
      const status=kind==='status'?String(e.status||'unknown'):'received';
      if(!['received','sent','delivered','read','failed','unknown'].includes(status)) fail(400,'Estado de evento no reconocido.');
      const raw=JSON.stringify([phoneNumberId,wabaId,e.id,kind,status,String(e.timestamp)]);
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
      events.push({event_key:hash,kind,status,provider_message_id:e.id,provider_timestamp:String(e.timestamp)});
    }
  }
  return events;
}

