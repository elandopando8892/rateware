// Domain-specific dry planner. It never forwards a business mutation to PostgREST.
// Only the internal closeout implementation receives this client; browser JSON is not a plan.
type Row = Record<string, any>;
type Query = { name: string; args: any[] };
const INSERT = new Set(['raw_uploads','interpretation_jobs','rate_staging']);
const UPDATE: Record<string,string[]> = {
  raw_uploads:['interpreted_rate_rows'],
  rate_staging:['status','source_bid_status','rfx_bid_outcome','updated_at'],
  rfx_lane_vendors:['rate_staging_id','bid_rate_staging_id','rateware_closeout_at','updated_at'],
  rfx_events:['status','updated_at'],
};
const READ = new Set(['select','eq','neq','in','is','not','order','range','limit','maybeSingle','single','or','gt','gte','lt','lte','ilike','like']);
export function createHandoffPlanClient(db: any) {
  const plan: Row = {upload:null,job:null,staging_inserts:[],staging_updates:[],links:[],result:null};
  const inserted = new Map<string,Row[]>();
  const fail = (): never => {throw new Error('Unsupported handoff planning operation');};
  const client = {from(table:string) {
    const steps: Query[]=[]; let mutation: Query|null=null;let promise: Promise<any>|null=null;
    async function execute() {
      if(!mutation) {
        let q=db.from(table);for(const step of steps)q=q[step.name](...step.args);return await q;
      }
      const change=mutation as Query;const patch=change.args[0] as Row;
      if(!patch||Array.isArray(patch)||typeof patch!=='object')return fail();
      let rows: Row[]=[];
      if(change.name==='insert') {
        if(!INSERT.has(table))return fail();
        const row={id:crypto.randomUUID(),...patch};rows=[row];
        inserted.set(table,[...(inserted.get(table)||[]),row]);
        if(table==='raw_uploads'){if(plan.upload)return fail();plan.upload=row;}
        if(table==='interpretation_jobs'){if(plan.job)return fail();plan.job=row;}
        if(table==='rate_staging')plan.staging_inserts.push(row);
      } else {
        if(!UPDATE[table]||Object.keys(patch).some(k=>!UPDATE[table].includes(k)))return fail();
        const filters=steps.filter(s=>['eq','neq','in'].includes(s.name));
        if(steps.some(s=>!['eq','neq','in','select','single','maybeSingle'].includes(s.name)))return fail();
        if(!filters.length)return fail();
        const matches=(row:Row)=>filters.every(({name,args:[k,v]})=>name==='eq'?row[k]===v:name==='neq'?row[k]!==v:v.includes(row[k]));
        const local=(inserted.get(table)||[]).filter(matches);
        // Pending INSERT rows are visible in this plan, but never inserted before commit.
        let q=db.from(table).select('*');for(const f of filters)q=q[f.name](...f.args);
        const read=await q;if(read.error)return read;
        rows=[...(read.data||[]),...local].map((row:Row)=>({...row,...patch}));
        for(const row of rows) {
          const cached=(inserted.get(table)||[]).find(x=>x.id===row.id);
          if(cached){Object.assign(cached,patch);continue;}
          const destination=table==='rate_staging'?plan.staging_updates:table==='rfx_lane_vendors'?plan.links:null;
          if(destination){const existing=destination.find((x:Row)=>x.id===row.id);if(existing)Object.assign(existing,patch);else destination.push({id:row.id,...patch});}
          else if(table==='rfx_events'){if(patch.status!=='awarded')return fail();}
          else return fail();
        }
      }
      const selection=steps.find(s=>s.name==='select')?.args[0]||'*';
      if(selection!=='*')rows=rows.map(r=>Object.fromEntries(selection.split(',').map((k:string)=>[k,r[k]])));
      if(steps.some(s=>['single','maybeSingle'].includes(s.name))){if(rows.length>1||(steps.some(s=>s.name==='single')&&rows.length!==1))return {data:null,error:{code:'PGRST116'}};return {data:rows[0]||null,error:null};}
      return {data:rows,error:null};
    }
    const chain:any=new Proxy({}, {get(_target,name) {
      if(name==='then')return (ok:any,bad:any)=>(promise??=execute()).then(ok,bad);
      if(typeof name!=='string')return undefined;
      if(['insert','update'].includes(name))return (...args:any[])=>{if(mutation)return fail();mutation={name,args};return chain;};
      if(!READ.has(name))return fail();
      return (...args:any[])=>{steps.push({name,args});return chain;};
    }});return chain;
  }};
  return {client,finish(result:Row){plan.result=result;return plan;}};
}
