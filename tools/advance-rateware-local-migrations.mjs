import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REVIEWED, reviewedSql, parseMode } from './probe-rateware-local-migrations.mjs';
import { REQUIRED, assessContainers } from './check-rateware-local.mjs';
import { auditImport, EXCLUDED_IMPORT, EXCLUDED_HASH, statementShapes } from './audit-local-import-exclusion.mjs';
export const NEXT = [
 ['20260608224500_seed_mx_fuel_fx_defaults.sql','314d8188fb167854ab29ff0208187b01ea4583f198d6d4a2900ccf651d47be58'],
 ['20260608230000_seed_base_rateware_catalog.sql','b49d872bf7a7ba4e1eea58a2de06c33849c6bb695bd6a5cb0fb2eb132fdc8a9f'],
 ['20260609001000_normalize_rateware_seed_aliases.sql','c13ee3b42215037534d1dee175f411d0e8c5ca0da734ce5395a25d3146c5105f'],
 ['20260609002000_fix_crossborder_import_export_direction.sql','0a233dea0b6de8701c18d3d992efff3d77d837ebc379e067b0d8d0e617ccb72f'],
 ['20260609003000_apply_mexico_perspective_operations.sql','dcfc8be66e7863a161cd99b679a4bc494a6d418b033548b12b39dbcec727fd71'],
 ['20260609004000_archive_raw_upload_versions.sql','a8b91b9fd31650181881d81241a72a073755454b93b4c4c3662e4f1ed3b2d6be'],
 ['20260609004100_rebuild_raw_upload_status_constraint.sql','c3682a1f3e092ba7092a33faf6f1fc021f0903853be9b4e89dce07b3a81f87e5'],
 ['20260609005000_fix_service_from_quote_markers.sql','e20fe65dbc0a623e8bb53146eae8f8a1cc6d62eec78974d2b0fb05ab2d4a9109'],
];
export const THIRD = [
 ['20260609006000_archive_rate_staging_rows.sql','0d88917d20e080507f9f256053fd86ac660e50ac99987b770e66f0197b7f96fe'],
 ['20260609103000_fix_mexican_location_catalog.sql','fff9f6b29f97cb796f125b5aa1ae9c4734b027c944a42067009158aaed9656d4'],
 ['20260609110000_seed_core_lane_location_aliases.sql','eaa26ce463ac1e2a709018eeca1fa25a38f6484c1988f2bfc67c501d7e907b07'],
 ['20260609113000_add_staging_special_trailer_flags.sql','76a25a8123224b591d31feeb5678be011b3a28264bbbfa59f1f6f411b695804f'],
 ['20260609115000_fix_false_roundtrip_staging_rows.sql','c49e6f1a7cf70c23ad101c0f0a4edccc1cda11a827b62989b99bd6772cd68472'],
 ['20260609120500_fix_all_false_roundtrip_staging_rows.sql','cb44ce10b6256e0b2dd4060caa2b25157fcc85cacc32a4c4c1b5f0790c6a3ea3'],
 ['20260609122000_clean_service_and_rate_text.sql','ac8966b46acf9480c89c03f8257bb6351553a617dd517e9061a018791f2d6ea3'],
 ['20260609123500_enforce_roundtrip_requires_marker.sql','ef34a423ac99c8149cc741cf00dffa557de5773e483372cc8b638eeeffc5839b'],
 ['20260609130000_sourcing_procurement_vendor_base.sql','e193cc58e44aee8f1e5c985f3b3a57e66dad6f087cfc7eb4195e559ad520528a'],
];
export const FOURTH = [
 ['20260617162000_scope_vendors_by_user.sql','80c57fad61a3f9266994e81dd819935d25f218482ab54698918c46642d21525a'],
 ['20260618010000_expand_reference_location_catalog.sql','d6a639dbf0785614e83918a63b279956385f7f6b6dedbc822d3d6782675e2030'],
 ['20260618120000_rateware_book_versions.sql','c0aa1213ab0665d917fd088df16e2110e9877b268a19260a224103f020950202'],
 ['20260618143000_upload_interpretation_audit.sql','db258670ce53e94e7c597a10514edf032c58f7e320627f562276e63c177c78eb'],
 ['20260618152000_lane_location_match_sources.sql','e48be85653c91b3dc83b925d64d87191675a161ccc8499d825e41841d549324c'],
 ['20260618153500_clean_existing_mx_staging_location_zips.sql','42a85f8f231052da856a39af51210e81b42446809b72cb3b9cbdf3594573286b'],
 ['20260618165000_rfx_spot_book.sql','9c908fc2e8d41d1c57d5c589790a0b9724d403c537f77489022f7e5aaf81c5e9'],
];
export const FIFTH = [
 ['20260618173000_outreach_engine.sql','497e4cfe98a8f0308310a2ca0016d6e93716a9332c0009bd44920a5b6348015a'],
 ['20260618180000_admin_saas_control.sql','3bba591a6f6c48198b3a0d2f15bfec443dee0fa4a8a2cd95a8ab80cc660b8391'],
 ['20260622123000_upload_correction_notes.sql','05a434b2fb2a97c857719f9142f6564c61bdf695659e11729bb01a8d7bf7a03d'],
 ['20260622143000_interpretation_memory.sql','0494fdfcbb501f2f8e8b0556e3ece2123f25b94d652301eb39a6ef3c037f463b'],
 ['20260623013000_vendor_funnel.sql','ba28af0de0285f909066322109119c75540c36394020c6378a26ed134a22f05a'],
];
export const SIXTH = [
 ['20260623153000_add_mexico_location_postal_aliases.sql','548c7f4513a8a570b3800d0e54a4fca64e0c8f5d560e04c8b6c34c06e439156c'],
 ['20260623164000_treat_mx_as_estado_de_mexico_state.sql','c47a0e66bccd1576eb9721fbb96c2adc9c1c719c969a728fb5eeb5e637ccee2a'],
 ['20260623193000_rebuild_location_catalog_from_user_lists.sql','de7adadacfd6b1a8c5fd29e3be168dd7265ef08a967c639bf346a688c435581b'],
];
export const BATCHES = [REVIEWED, NEXT, THIRD, FOURTH, FIFTH, SIXTH];
export function batchPlan(number) {
 if (!Number.isInteger(number) || number < 2 || number > BATCHES.length) throw new Error('Unknown reviewed batch');
 return { batch: BATCHES[number-1], predecessor: BATCHES.slice(0,number-1).flat(), createExclusion: number===4, verifyExclusion: number>=5, auditExclusion: number>=4 };
}
// Compatibility for the already documented batch APIs.
export function incrementalSql(read, apply, third = false, fourth = false, fifth = false) {
 if ([third,fourth,fifth].filter(Boolean).length > 1) throw new Error('Conflicting batch selection');
 return migrationSql(read,apply,fifth?5:fourth?4:third?3:2);
}
export function migrationSql(read, apply, number) {
 reviewedSql(read); // predecessor files must also remain unchanged
 const {batch,predecessor,createExclusion,verifyExclusion,auditExclusion}=batchPlan(number);
 if(auditExclusion) {
   auditImport(read(EXCLUDED_IMPORT));
   statementShapes(read(FOURTH[1][0]).toString('utf8'),['public.rateware_locations','public.rateware_lane_mileage']);
 }
 if(number>=6) statementShapes(read(SIXTH[2][0]).toString('utf8'),['public.rateware_locations','public.rateware_lane_mileage'],true);
 for (const [name,hash] of predecessor) {
   if(createHash('sha256').update(read(name)).digest('hex') !== hash) throw new Error(`Review invalidated: ${name}`);
 }
 const body = batch.map(([name, hash]) => {
   const bytes = read(name);
   if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error(`Review invalidated: ${name}`);
   return bytes.toString('utf8');
 }).join('\n');
 const values = rows => rows.map(([name,hash]) => `('${name}','${hash}')`).join(',');
 return `BEGIN; SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(56432,1);
LOCK TABLE rateware_local_control.migration_batches IN EXCLUSIVE MODE;
DO $$ BEGIN
IF (SELECT count(*) FROM rateware_local_control.migration_batches) <> ${predecessor.length} OR EXISTS (
 SELECT 1 FROM (VALUES ${values(predecessor)}) AS expected(name,sha256)
 LEFT JOIN rateware_local_control.migration_batches actual USING(name,sha256) WHERE actual.name IS NULL
) THEN RAISE EXCEPTION 'Predecessor ledger mismatch'; END IF;
IF EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM public.vendors) OR EXISTS(SELECT 1 FROM public.rate_staging) OR EXISTS(SELECT 1 FROM public.raw_uploads)
THEN RAISE EXCEPTION 'Local business data must remain empty'; END IF;
END $$;
${verifyExclusion ? `DO $$ BEGIN
IF (SELECT count(*) FROM rateware_local_control.exclusions) <> 1 OR NOT EXISTS
(SELECT 1 FROM rateware_local_control.exclusions WHERE name='${EXCLUDED_IMPORT}' AND sha256='${EXCLUDED_HASH}' AND disposition='EXCLUDED_LOCAL_BUSINESS_DATA')
THEN RAISE EXCEPTION 'Exclusion ledger mismatch'; END IF;
IF EXISTS(SELECT 1 FROM public.rfx_events) THEN RAISE EXCEPTION 'RFx data must remain empty'; END IF;
END $$;` : ''}
${body}
${createExclusion ? `CREATE TABLE rateware_local_control.exclusions(name text primary key, sha256 text not null, disposition text not null);
INSERT INTO rateware_local_control.exclusions VALUES ('${EXCLUDED_IMPORT}','${EXCLUDED_HASH}','EXCLUDED_LOCAL_BUSINESS_DATA');` : ''}
INSERT INTO rateware_local_control.migration_batches(name,sha256) VALUES ${values(batch)};
${apply ? 'COMMIT' : 'ROLLBACK'};`;
}
function main() {
 const args=process.argv.slice(2);
 const aliases={'--batch-three':3,'--batch-four':4,'--batch-five':5};
 let number=2;
 if(args[0]==='--batch') { args.shift(); number=Number(args.shift()); }
 else if(aliases[args[0]]) number=aliases[args.shift()];
 const plan=batchPlan(number);
 const apply = parseMode(args);
 if(plan.auditExclusion) {
   const manifest=JSON.parse(readFileSync(resolve(import.meta.dirname,'..','config','local-migration-exclusions.json'),'utf8'));
   if(manifest.exclusions.length!==1 || manifest.exclusions[0].name!==EXCLUDED_IMPORT || manifest.exclusions[0].sha256!==EXCLUDED_HASH || manifest.exclusions[0].applied!==false || manifest.exclusions[0].disposition!=='EXCLUDED_LOCAL_BUSINESS_DATA') throw new Error('Exclusion manifest mismatch');
 }
 const inspection = spawnSync('docker',['inspect',...REQUIRED],{encoding:'utf8'});
 if (inspection.status !== 0 || assessContainers(JSON.parse(inspection.stdout)).status !== 'PASS') throw new Error('Local infrastructure gate failed');
 const input = migrationSql(name => readFileSync(resolve(import.meta.dirname,'..','supabase','migrations',name)),apply,number);
 const result = spawnSync('docker',['exec','-i','supabase_db_rateware-carrier-local-v1','psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',timeout:90000});
 console.log(JSON.stringify({status:result.status === 0 ? 'PASS':'FAIL',applied:apply && result.status === 0, batch_size:plan.batch.length, errors:(result.stderr || '').split('\n').filter(line=>/ERROR:/.test(line)),process_error:result.error?.code || null},null,2));
 process.exitCode = result.status === 0 ? 0:1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
 try {main();} catch(error) { console.error(error.message); process.exitCode=1; }
}
