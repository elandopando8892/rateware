import {assertEquals,assert} from 'jsr:@std/assert@1.0.14';
const serve=Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,value:()=>({})});
const {createRatewareApiHandler}=await import('../supabase/functions/rateware-api/index.ts');
Object.defineProperty(Deno,'serve',{configurable:true,value:serve});
Deno.test('real authenticated route uses atomic receiver; replay, role and workspace fences',async()=>{
  const old=Deno.env.get('RFX_RFI_LINK_ENCRYPTION_KEY');
  Deno.env.set('RFX_RFI_LINK_ENCRYPTION_KEY','synthetic-local-test-only');
  let role='operator',foreign=false,rpcCalls=0;
  let saved:Record<string,unknown>|null=null;
  const db={from:(table:string)=>{
    const filters:Record<string,unknown>={};
    const q:unknown=new Proxy(()=>q,{get:(_t,name)=>{
      if(name==='then')return (resolve:(v:unknown)=>void)=>resolve({data:table==='rfx_projects'&&!foreign&&filters.owner_email==='org:test'
        ?{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',owner_email:'org:test',status:'draft'}:null,error:null});
      return (...args:unknown[])=>{if(name==='eq')filters[String(args[0])]=args[1];return q;};
    }});return q;
  },rpc:async(name:string,input:Record<string,unknown>)=>{
    assertEquals(name,'issue_rfx_rfi_link_once');rpcCalls++;const reused=Boolean(saved);
    saved??={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',status:'active',expires_at:'2099-01-01T00:00:00Z',created_at:'2026-10-08T00:00:00Z',token_encrypted:input.p_token_encrypted};
    return {data:{reused,row:saved},error:null};
  }};
  const handler=createRatewareApiHandler({getClient:()=>({...db}) as never,
    authenticate:async()=>({auth_provider:'supabase',org_code:'test',sub:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',email:'operator@example.test',rateware_organization_id:'test',roles:[role]} as never),
    resolveUser:async()=>({organization_id:'test',owner_user_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',owner_email:'org:test'} as never)});
  const request=()=>new Request('https://rateware.test/functions/v1/rateware-api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create_rfx_rfi_magic_link',project_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})});
  try {
    const response=await handler(request());assertEquals(response.status,200);
    const first=await response.json();assertEquals(first.reused,false);assert(!('token' in first));
    const replay=await handler(request());assertEquals(replay.status,200);assertEquals((await replay.json()).link,first.link);
    role='viewer';assertEquals((await handler(request())).status,403);assertEquals(rpcCalls,2);
    role='operator';foreign=true;assert((await handler(request())).status>=400);assertEquals(rpcCalls,2);
  }finally{if(old===undefined)Deno.env.delete('RFX_RFI_LINK_ENCRYPTION_KEY');else Deno.env.set('RFX_RFI_LINK_ENCRYPTION_KEY',old);}
});

