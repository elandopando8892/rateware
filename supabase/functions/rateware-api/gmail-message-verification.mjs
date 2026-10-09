import { gmailFailureEvidence } from './gmail-delivery-evidence.mjs';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const receiptId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const scopes = new Set(['https://mail.google.com/','https://www.googleapis.com/auth/gmail.modify','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.metadata']);
export async function verifyOutreachGmailMessage({client,user,sender,messageId,eventId,resolveToken,fetchImpl=fetch,timeoutMs=8000}) {
  const result=(state,extra={})=>({state,checked_at:new Date().toISOString(),http_status:null,reason_codes:[],...extra});
  if(!user?.owner_email||!uuid(messageId)||!uuid(eventId))return result('missing');
  let message,connection;
  try {
    const event=await client.from('rfx_events').select('id,owner_email').eq('owner_email',user.owner_email).eq('id',eventId).abortSignal(AbortSignal.timeout(2000)).maybeSingle();
    if(event.error)return result('unavailable');
    if(!event.data||event.data.id!==eventId||event.data.owner_email!==user.owner_email)return result('missing');
    const read=await client.from('outreach_messages').select('id,owner_email,rfx_event_id,channel,provider,provider_message_id').eq('owner_email',user.owner_email).eq('rfx_event_id',eventId).eq('id',messageId).abortSignal(AbortSignal.timeout(2000)).maybeSingle();
    if(read.error)return result('unavailable');message=read.data;
    if(!message||message.owner_email!==user.owner_email||message.id!==messageId||message.rfx_event_id!==eventId)return result('missing');
    if(message.channel!=='email'||(message.provider&&message.provider!=='gmail')||!receiptId(message.provider_message_id))return result('no_receipt');
    const mailbox=await client.from('gmail_mailbox_connections').select('owner_email,mailbox_email,status,scopes').eq('owner_email',user.owner_email).eq('mailbox_email',sender).abortSignal(AbortSignal.timeout(2000)).maybeSingle();
    if(mailbox.error)return result('unavailable');connection=mailbox.data;
    if(!connection||connection.owner_email!==user.owner_email||connection.mailbox_email!==sender||connection.status!=='connected')return result('not_connected');
    if(!Array.isArray(connection.scopes)||!connection.scopes.some(scope=>scopes.has(scope)))return result('scope_missing');
  }catch{return result('unavailable');}
  let token,timer;
  try{token=await Promise.race([resolveToken(client,user,sender),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Credential timeout')),timeoutMs);})]);if(typeof token!=='string'||!token.trim())return result('credentials_unavailable');}
  catch{return result('credentials_unavailable');}finally{clearTimeout(timer);}
  try {
    const url=new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+encodeURIComponent(message.provider_message_id));url.searchParams.set('format','minimal');
    const response=await fetchImpl(url.toString(),{method:'GET',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(timeoutMs),redirect:'error'});
    let data;try{data=await response.json();}catch{data=null;}
    const evidence=gmailFailureEvidence(response.status,data),extra={http_status:evidence.http_status,reason_codes:evidence.provider_reason_codes};
    if(!response.ok||response.status!==200)return result(response.status===404?'not_found':'provider_rejected',extra);
    if(data?.id!==message.provider_message_id||!Array.isArray(data.labelIds)||!data.labelIds.every(label=>typeof label==='string'))return result('unavailable',extra);
    return result(data.labelIds.includes('SENT')?'found_sent':'found_not_sent',extra);
  }catch{return result('unavailable');}
}
