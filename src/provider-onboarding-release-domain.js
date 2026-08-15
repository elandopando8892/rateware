const text=(value)=>value==null?'':String(value).trim();
const unique=(values)=>[...new Set(Array.isArray(values)?values:[])];
export function evaluateProviderOnboardingRelease(policy={},evidence={}){
 const reasons=[];
 if(policy.release_enabled!==true)reasons.push('release_disabled');
 if(policy.pilot_mode!=='private_canary')reasons.push('pilot_mode_not_private_canary');
 if(text(evidence.ci_workflow)!==text(policy.required_ci_workflow)||text(evidence.ci_conclusion)!==text(policy.required_ci_conclusion))reasons.push('ci_not_green');
 if(evidence.production_environment_confirmed!==true)reasons.push('production_environment_unconfirmed');
 if(evidence.private_vault_confirmed!==true)reasons.push('private_vault_unconfirmed');
 if(evidence.human_pilot_owner_confirmed!==true)reasons.push('pilot_owner_unconfirmed');
 if(evidence.rollback_owner_confirmed!==true)reasons.push('rollback_owner_unconfirmed');
 const configured=new Set(unique(evidence.configured_secret_names).map(text));
 for(const name of unique(policy.required_secret_names))if(!configured.has(text(name)))reasons.push(`missing_secret:${text(name)}`);
 const observed=new Set(unique(evidence.completed_stages).map(text));
 for(const stage of unique(policy.required_pipeline_stages))if(!observed.has(text(stage)))reasons.push(`missing_stage:${text(stage)}`);
 const cases=Number(evidence.case_count||0),messages=Number(evidence.message_count||0);
 if(!Number.isInteger(cases)||cases<1||cases>Number(policy.rollout?.max_initial_cases||0))reasons.push('case_count_out_of_bounds');
 if(!Number.isInteger(messages)||messages<0||messages>Number(policy.rollout?.max_initial_messages||0))reasons.push('message_count_out_of_bounds');
 if(evidence.automatic_followups===true||policy.rollout?.automatic_followups!==false)reasons.push('automatic_followups_not_disabled');
 return Object.freeze({ready:reasons.length===0,reasons:Object.freeze(reasons),evaluated_at:evidence.evaluated_at||null});
}
export function assertSyntheticPilotFixture(fixture={}){
 const serialized=JSON.stringify(fixture);
 const reasons=[];
 if(fixture.synthetic!==true)reasons.push('fixture_not_synthetic');
 if(!text(fixture.mailbox).endsWith('.invalid')||!text(fixture.recipient).endsWith('.invalid'))reasons.push('non_reserved_email_domain');
 if(!/^[0-9a-f]{64}$/.test(text(fixture.document_sha256))||!/^[0-9a-f]{64}$/.test(text(fixture.manifest_sha256)))reasons.push('invalid_hash_shape');
 if(/xbfreight|gonzalez|perales|jagp|carriers@|@[a-z0-9.-]+\\.(com|mx|us)/i.test(serialized))reasons.push('sensitive_marker_detected');
 return Object.freeze({valid:reasons.length===0,reasons:Object.freeze(reasons)});
}
