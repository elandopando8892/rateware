import assert from "node:assert/strict";
import { sourceFileClaims, SOURCE_FILE_ACTIONS } from "../supabase/functions/_shared/source-file-access.ts";

// Real handlers and Supabase SDK, synthetic transport ONLY. No network permission.
for (const [key,value] of Object.entries({
  SUPABASE_URL:"https://fixture.invalid", SUPABASE_ANON_KEY:"fixture-anon",
  RATEWARE_SUPABASE_SERVICE_ROLE_KEY:"fixture-service", OPENAI_API_KEY:"fixture-only",
  OPENAI_MODEL:"fixture-only", RATEWARE_TENANT_ENFORCEMENT:"disabled"
})) Deno.env.set(key,value);
type Handler = (req: Request) => Promise<Response>;
const handlers: Handler[] = [];
const originalServe = Deno.serve;
Object.defineProperty(Deno,"serve",{configurable:true,value:(handler: Handler)=>{handlers.push(handler);return {};}});
try {
  await import("../supabase/functions/create-raw-upload/index.ts");
  await import("../supabase/functions/interpret-upload/index.ts");
  await import("../supabase/functions/rateware-api/index.ts");
  await import("../supabase/functions/rateware-storage-api/index.ts");
} finally { Object.defineProperty(Deno,"serve",{configurable:true,value:originalServe}); }
const [upload, interpret, api, storage] = handlers;
assert.equal(handlers.length,4);
const calls: { path:string; method:string }[]=[];
let revoked = false;
let missing = false;
let stubStorage = false;
const forwarded: unknown[] = [];
const oracleFile = "44444444-4444-4444-8444-444444444444";
const tenant = "11111111-1111-4111-8111-111111111111";
const tenantB = "33333333-3333-4333-8333-333333333333";
const identity = "22222222-2222-4222-8222-222222222222";
const originalFetch = globalThis.fetch;
const json = (body: unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const req = new Request(input,init); const u=new URL(req.url);
  assert.equal(u.hostname,"fixture.invalid","no external calls permitted");
  calls.push({path:u.pathname,method:req.method});
  if (u.pathname === "/functions/v1/rateware-storage-api") {
    if (stubStorage) { forwarded.push(await req.clone().json()); return json({ removed: { id: oracleFile } }); }
    return storage(req);
  }
  if(u.pathname==="/auth/v1/user") {
    const token=req.headers.get("authorization")?.replace("Bearer ","");
    if(token==="invalid") return json({},401);
    return json({id:token,email:`${token}@example.invalid`,email_confirmed_at:token==="unverified"?null:"2026-01-01",
      app_metadata:token==="carrier"?{}:token==="generic"?{organization_id:"org-a"}:{rateware_organization_id:token==="b"?"org-b":"org-a"},
      user_metadata:{rateware_organization_id:"org-a",organization_id:"org-a"}});
  }
  if(u.pathname.endsWith("/external_identities")) return json(missing?[]:[{id:identity,status:revoked?"revoked":"active"}]);
  if(u.pathname.endsWith("/external_organization_links")) return json([{organization_id:u.searchParams.get("external_organization_id")==="eq.org-b"?tenantB:tenant,status:"active"}]);
  if(u.pathname.endsWith("/workspace_registry")) {
    const org=u.searchParams.get("organization_id")?.replace("eq.","");
    return json([{organization_uuid:org==="org-b"?tenantB:tenant,canonical_owner_key:`org:${org}`}]);
  }
  if(u.pathname.endsWith("/raw_uploads")) {
    if(req.method==="POST") return json(await req.json(),201);
    if(u.searchParams.get("owner_email")!=="eq.org:org-a") return json({code:"PGRST116",message:"missing"},406);
    if(req.method==="DELETE") return json({id:u.searchParams.get("id")?.replace("eq.","")});
    const oracle=u.searchParams.get("id")===`eq.${oracleFile}`;
    return json({id:oracle?oracleFile:"file-a",owner_email:"org:org-a",storage_provider:oracle?"oracle_s3":"supabase",storage_bucket:"raw-uploads",storage_path:"fixture-a",original_filename:"a.pdf"});
  }
  if(u.pathname.startsWith("/storage/v1/object/sign/")) return json({signedURL:"/object/sign/raw-uploads/fixture-a?token=fixture-only"});
  if(u.pathname.startsWith("/storage/v1/object/raw-uploads/") && req.method==="POST") return json({Key:"fixture-upload",Id:"fixture-upload"});
  if(u.pathname==="/storage/v1/object/raw-uploads" && req.method==="DELETE") return json([{name:"fixture-a"}]);
  if(u.pathname.endsWith("/saas_audit_log")) return json(null,201);
  throw new Error(`Unexpected downstream call: ${req.method} ${u.pathname}`);
}
function request(token:string, body:unknown, multipart=false) {
  const form = new FormData(); if(multipart) {form.set("file",new File(["synthetic"],"test.pdf",{type:"application/pdf"}));form.set("document_type","pdf");}
  return new Request("https://fixture.invalid/functions/v1/test",{method:"POST",headers:{Authorization:`Bearer ${token}`,...(!multipart?{"Content-Type":"application/json"}:{})},body:multipart?form:JSON.stringify(body)});
}
async function scenario(fn:()=>Promise<void>) {
  calls.length=0;forwarded.length=0;revoked=false;missing=false;stubStorage=false;globalThis.fetch=fakeFetch;
  try { await fn(); } finally {globalThis.fetch=originalFetch;revoked=false;stubStorage=false;}
}

for(const token of ["carrier","generic","unverified"]) Deno.test(`all file entrypoints reject ${token} before effects`,()=>scenario(async()=>{
  for(const [handler,body,multipart] of [[upload,{},true],[interpret,{raw_upload_id:"file-a"},false]] as const) {
    const response=await handler(request(token,body,multipart)); assert.equal(response.status,403);
  }
  assert.equal((await storage(request(token,{action:"get_upload_source_url",id:"11111111-1111-4111-8111-111111111111"}))).status,403);
  assert.ok(calls.every(c=>c.path==="/auth/v1/user"));
  // An Oracle-stored source is only signed by the storage service, which requires reviewed access.
  calls.length=0;
  const oracle=await api(request(token,{action:"get_upload_source_url",id:oracleFile}));
  assert.notEqual(oracle.status,200);
  if(token!=="carrier") assert.equal(oracle.status,403);
  assert.ok(!calls.some(c=>c.path.startsWith("/storage/")));
}));
Deno.test("a Supabase-stored source keeps today's workspace rules in rateware-api",()=>scenario(async()=>{
  // Same company through generic organization metadata: signed in-process, as before the Oracle layer.
  const generic=await api(request("generic",{action:"get_upload_source_url",id:"11111111-1111-4111-8111-111111111111"}));
  assert.equal(generic.status,200,await generic.clone().text());
  assert.ok(calls.some(c=>c.path.startsWith("/storage/v1/object/sign/")));
  assert.ok(!calls.some(c=>c.path==="/functions/v1/rateware-storage-api"));
  // No company: the source is not in that user's workspace, so nothing is signed.
  calls.length=0;
  assert.notEqual((await api(request("carrier",{action:"get_upload_source_url",id:"11111111-1111-4111-8111-111111111111"}))).status,200);
  assert.ok(!calls.some(c=>c.path.startsWith("/storage/")));
}));
Deno.test("revoked reviewed identity is denied even when global enforcement is disabled",()=>scenario(async()=>{
  revoked=true; assert.equal((await upload(request("a",{},true))).status,403);
  assert.ok(calls.every(c=>c.method==="GET"));
}));
Deno.test("authorized company can upload through the unchanged server path",()=>scenario(async()=>{
  const response=await upload(request("a",{},true)); assert.equal(response.status,200,await response.clone().text());
  const result=await response.json(); assert.equal(result.raw_upload.owner_email,"org:org-a");
  assert.equal(result.raw_upload.organization_id,"org-a");
}));
Deno.test("source URL signs only the authorized company's source",()=>scenario(async()=>{
  assert.equal((await api(request("a",{action:"get_upload_source_url",id:"11111111-1111-4111-8111-111111111111"}))).status,200);
  calls.length=0;
  const denied=await api(request("b",{action:"get_upload_source_url",id:"11111111-1111-4111-8111-111111111111"}));
  assert.notEqual(denied.status,200);
  assert.ok(!calls.some(c=>c.path.startsWith("/storage/")));
}));
Deno.test("foreign interpretation creates no job, downloads nothing, calls no model",()=>scenario(async()=>{
  assert.equal((await interpret(request("b",{raw_upload_id:"file-a"}))).status,404);
  assert.ok(calls.every(c=>c.method==="GET"));
  assert.ok(!calls.some(c=>c.path.includes("interpretation_jobs")||c.path.startsWith("/storage/")));
}));
Deno.test("conflicting claims do not choose one organization silently",()=>{
  assert.throws(()=>sourceFileClaims({auth_provider:"supabase",email_confirmed:true,rateware_organization_id:"org-a",organization_id:"org-b"}),/Conflicting/);
});
Deno.test("storage-backed source actions deny carrier even with forged body claims",()=>scenario(async()=>{
  const forged={owner_email:"org:org-a",rateware_organization_id:"org-a",email_confirmed:true,confirmed:true,confirmation_action:"remove_upload"};
  for(const action of ["get_upload_source_url","remove_upload"]) {
    assert.ok(SOURCE_FILE_ACTIONS.has(action));
    assert.equal((await storage(request("carrier",{action,id:oracleFile,...forged}))).status,403);
  }
  assert.ok(calls.every(c=>c.path==="/auth/v1/user"));
  calls.length=0;
  assert.notEqual((await api(request("carrier",{action:"get_upload_source_url",id:oracleFile,...forged}))).status,200);
  assert.equal((await api(request("generic",{action:"get_upload_source_url",id:oracleFile,...forged}))).status,403);
  assert.ok(!calls.some(c=>c.path.startsWith("/storage/")));
}));
Deno.test("an Oracle-stored upload is removed by the storage service, never from Supabase Storage",()=>scenario(async()=>{
  stubStorage=true;
  const response=await api(request("a",{action:"remove_upload",id:oracleFile,confirmed:true,confirmation_action:"remove_upload"}));
  assert.equal(response.status,200,await response.clone().text());
  assert.deepEqual((await response.json()).removed,{id:oracleFile});
  assert.deepEqual(forwarded,[{action:"remove_upload",id:oracleFile,confirmed:true,confirmation_action:"remove_upload"}]);
  assert.ok(!calls.some(c=>c.path.startsWith("/storage/")));
  assert.ok(!calls.some(c=>c.path.endsWith("/raw_uploads")&&c.method==="DELETE"));
}));
Deno.test("a Supabase-stored upload keeps the existing removal path",()=>scenario(async()=>{
  const response=await api(request("a",{action:"remove_upload",id:"11111111-1111-4111-8111-111111111111",confirmed:true,confirmation_action:"remove_upload"}));
  assert.equal(response.status,200,await response.clone().text());
  assert.ok(!calls.some(c=>c.path==="/functions/v1/rateware-storage-api"));
  assert.ok(calls.some(c=>c.path==="/storage/v1/object/raw-uploads"&&c.method==="DELETE"));
}));
Deno.test("invalid bearer cannot reach identity lookup or storage",()=>scenario(async()=>{
  assert.equal((await upload(request("invalid",{},true))).status,401);
  assert.ok(calls.every(c=>c.path==="/auth/v1/user"));
}));
Deno.test("an explicit claim without a reviewed identity does not authorize uploads",()=>scenario(async()=>{
  missing=true; assert.equal((await upload(request("a",{},true))).status,403);
  assert.ok(calls.every(c=>c.method==="GET"));
}));
