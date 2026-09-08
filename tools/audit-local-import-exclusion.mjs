import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export const EXCLUDED_IMPORT = '20260617150000_import_sourcing_base_google_sheet.sql';
export const EXCLUDED_HASH = '1b280bf887570c639e548f5068f61a44215b1618562d3dc43b28d8675955b695';

// Narrow lexer for this hash-pinned generated import, not a general SQL safety
// validator. Assumes standard_conforming_strings=on (verified locally).
// Unsupported dollar strings, quoted identifiers and E strings fail.
export function statementShapes(sql, table = 'public.vendors', allowUpdate = false) {
 let clean=''; let i=0;
 while(i<sql.length) {
   if(sql.startsWith('--',i)) { const end=sql.indexOf('\n',i); i=end<0?sql.length:end+1; clean+=' '; continue; }
   if(sql[i]==='"'||sql[i]==='$'||sql.startsWith('/*',i)|| /[eE]/.test(sql[i])&&sql[i+1]==="'") throw new Error('Unsupported SQL lexical form');
   if(sql[i]==="'") {
     i++; let closed=false;
     while(i<sql.length) {
       if(sql[i]==="'") { if(sql[i+1]==="'"){i+=2;continue;} i++;closed=true;break; }
       i++;
     }
     if(!closed) throw new Error('Unterminated literal');
     clean+=' ? ';continue;
   }
   clean+=sql[i++];
 }
 return clean.split(';').map(s=>s.trim()).filter(Boolean).map(s=>{
   const match=s.match(/^(delete\s+from|insert\s+into|update)\s+(public\.[a-z_]+)\b/i);
   if(match?.[1].toLowerCase()==='update' && !allowUpdate) throw new Error('UPDATE requires explicit review');
   if(!match || !(Array.isArray(table)?table:[table]).includes(match[2].toLowerCase())) throw new Error('Unexpected DML target requires review');
   if(/\b(create|alter|drop|truncate|execute|copy|call|grant|revoke)\b/i.test(s)) throw new Error('Unexpected structural token');
   return match[1].toLowerCase().replace(/\s+/g,' ');
 });
}
export function auditImport(bytes) {
 if(createHash('sha256').update(bytes).digest('hex')!==EXCLUDED_HASH) throw new Error('Import hash changed');
 const shapes=statementShapes(bytes.toString('utf8'));
 return {file:EXCLUDED_IMPORT,sha256:EXCLUDED_HASH,disposition:'EXCLUDED_LOCAL_BUSINESS_DATA',applied:false,
   statement_count:shapes.length,statement_types:[...new Set(shapes)],
   scope:'narrow lexical structure check; not SQL semantic or production certification'};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 try {console.log(JSON.stringify(auditImport(readFileSync(resolve(import.meta.dirname,'..','supabase','migrations',EXCLUDED_IMPORT))),null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
