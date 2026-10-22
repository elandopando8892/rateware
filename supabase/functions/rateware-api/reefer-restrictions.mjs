/** Approved historical RFQ scope. Pure and shared byte-for-byte with Rateware.
 * No price, availability, credentials, profile updates or invitation actions.
 * Unknown requirements never count as a match. Prose is not a policy source.
 */
export const REEFER_POLICY = Object.freeze({
  id: 'd2d-reefer-us-border-20261022',
  templateId: '71aa36b3-0f36-4771-9728-e0e82d9f9561',
  organizationId: 'org_dbc2fd12c76',
  evidence: 'bidware-reefer-preselection-approved-20261022',
});
const rules = {
  '578217e1-2dd4-4ab2-9303-1b3e03e83029': {origin:'queretaro', destinations:['laredo:tx','pharr:tx','nogales:az'], products:['tomato','pine'], refs:['19f9620b96fd0360','19f964aaac530253','19faa14d0d6e80a5']},
  '5f2af3ef-b32a-4098-9a45-25650e5ffc4e': {origin:'queretaro', destinations:['pharr:tx'], products:['tomato'], refs:['19fa9b2069c7ae58','6aea6f5b-e82f-413f-9c15-15abd8fc12ca']},
  'ea86bbed-5d35-41c9-86ec-15a8d00397d5': {origin:'el marques', destinations:['laredo:tx'], products:['pine'], weightBelowKg:20000, refs:['19ff33d9cb6a73d7','19fecb5e98a845ab','19fecfb8f0c18705']},
  'c99998e0-8a41-44e9-86ad-b35e233da2b5': {origin:'queretaro', destinations:['laredo:tx'], products:['tomato'], evidenceConflict:true, refs:['f2c1ccb2-9c86-4ea2-baac-5280565adce7','79129503-8f73-4c12-8d95-aab5cb4bfd74']},
  '4988e190-c942-4fac-b2af-981e8a8891b1': {origin:'queretaro', destinations:['laredo:tx','pharr:tx'], products:['tomato'], grossMaxKg:20000, handling:true, refs:['19f9653f64d15555','19fab280844fb753','19f961c81b78e60a']},
  '43d03561-afa1-4f3c-959f-452415bcc31f': {origin:'queretaro', destinations:['laredo:tx','pharr:tx'], products:['tomato'], refs:['19f96239971ff22a','19faa19555fcb0b6']},
};
const fold = value => typeof value === 'string' ? value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ') : '';
const canon = (value, aliases) => aliases[fold(value)] ?? fold(value);
const country = value => canon(value, {mex:'mx',mexico:'mx',usa:'us','united states':'us','estados unidos':'us'});
const state = value => canon(value, {qro:'qe',queretaro:'qe',texas:'tx',arizona:'az'});
const city = value => canon(value, {'santiago de queretaro':'queretaro'});
const labels = {
  producto:'product', mercancia:'product', commodity:'product', product:'product',
  peso:'weight', weight:'weight', 'peso bruto':'grossWeight', 'gross weight':'grossWeight',
  temperatura:'temperature', temperature:'temperature', 'set point':'temperature',
  tarimas:'palletized', paletizado:'palletized', palletized:'palletized',
  preenfriado:'precooled', precooled:'precooled',
  'despacho aduanal a cargo del carrier':'customsByCarrier', 'customs brokerage by carrier':'customsByCarrier',
  'seguro de carga a cargo del carrier':'insuranceByCarrier', 'cargo insurance by carrier':'insuranceByCarrier',
  'maniobras a cargo del carrier':'handlingByCarrier', 'loading/unloading by carrier':'handlingByCarrier',
};
const products = {
  jitomate:'tomato',jitomates:'tomato',tomate:'tomato',tomates:'tomato',tomato:'tomato',tomatoes:'tomato',
  pino:'pine',pinos:'pine','arboles de navidad':'pine','pinos de navidad':'pine','christmas trees':'pine',
  'arboles de navidad / pinos de madera para exportacion':'pine',
};
function weight(value) {
  // A thousands comma requires three digits; decimal commas/ranges are ambiguous.
  const match=fold(value).match(/^(\d+(?:,\d{3})*(?:\.\d+)?)\s*(kg|kgs|kilogramos|kilograms|t|ton|tons|toneladas|tonnes|lb|lbs)\.?$/);
  if (!match) return null;
  const n=Number(match[1].replaceAll(',',''));
  if (!(n>0 && Number.isFinite(n))) return null;
  const kg=n * (['t','ton','tons','toneladas','tonnes'].includes(match[2]) ? 1000 : ['lb','lbs'].includes(match[2]) ? 0.45359237 : 1);
  return Number.isFinite(kg) ? kg : null;
}
function parseValue(key,value) {
  const v=fold(value).replace(/\.$/,'');
  if (key==='product') return products[v] ?? null;
  if (key==='weight'||key==='grossWeight') return weight(value);
  if (key==='temperature') {
    const match=v.match(/^(-?\d+(?:\.\d+)?)\s*°?\s*c$/);
    const n=match ? Number(match[1]) : NaN;
    return Number.isFinite(n) ? n : null;
  }
  return ['si','yes','true'].includes(v) ? true : ['no','false'].includes(v) ? false : null;
}
/** Only labelled current requirement fields, never event names, notes, offers,
 * template descriptions or arbitrary body overrides. Unsupported prose stays unknown.
 */
export function reeferFacts(lane) {
  const seen = new Map();
  for (const field of ['service_specifications','operation_criteria','business_rules']) {
    const raw=lane?.[field];
    if (typeof raw!=='string' || raw.length>30000) continue;
    // Rich text from the existing editor is accepted as inert text, never executed.
    if (/<(?:script|style|iframe)\b/i.test(raw)) continue;
    const text=raw.replace(/<!--[^]*?-->/g,'').replace(/<\/(?:li|p|div|h[1-6])\s*>|<br\s*\/?\s*>/gi,'\n')
      .replace(/<[^>]*>/g,'').replace(/&nbsp;/gi,' ').replace(/&deg;|&#176;/gi,'°')
      .replace(/,\s*(?=[A-Za-zÁÉÍÓÚáéíóú][^,:\n]{0,55}:)/g,'\n');
    for (const line of text.split(/[\n;]/)) {
      const match=line.trim().replace(/^[-*•]\s*/,'').match(/^([^:]{1,65}):\s*(.*?)\s*$/);
      if (!match) continue;
      const key=labels[fold(match[1])]; if (!key) continue;
      const values=seen.get(key) ?? []; values.push(parseValue(key,match[2])); seen.set(key,values);
    }
  }
  const facts={};
  for(const [key,values] of seen) {
    const distinct=[...new Set(values)];
    facts[key]=distinct.length===1 && distinct[0]!==null ? {state:'known',value:distinct[0]} : {state:'ambiguous'};
  }
  if(facts.weight?.state==='known' && facts.grossWeight?.state==='known' && facts.grossWeight.value<facts.weight.value) {
    facts.weight={state:'ambiguous'}; facts.grossWeight={state:'ambiguous'};
  }
  return facts;
}
function equipment(lane) {
  const values=[fold(lane.equipment),fold(lane.trailer)].filter(Boolean);
  if (!values.length) return 'missing';
  const reefer=/^(reefer|refrigerated(?: trailer)?|caja refrigerada|refrigerado)(?: 53(?:['′’]| ft| pies)?)?$/;
  const generic=/^(truck trailer|tractocamion|tractocamion 53|trailer|ftl)$/;
  if (values.some(v=>!reefer.test(v)&&!generic.test(v))) return 'different';
  return values.some(v=>reefer.test(v)) ? 'known' : 'missing';
}
export function isReeferTemplate(templateId) { return fold(templateId)===REEFER_POLICY.templateId; }

export function evaluateReeferRestrictions({templateId,organizationId,vendorId,lanes}) {
  if(!isReeferTemplate(templateId)) return {applies:false,ok:true,status:'not_applicable',issues:[],policyId:null,sourceRefs:[]};
  const issues=[];
  const add=(code,status,laneId=null)=>{if(!issues.some(i=>i.code===code&&i.laneId===laneId))issues.push({code,status,laneId});};
  const rule=rules[fold(vendorId)];
  if(organizationId!==REEFER_POLICY.organizationId) add('workspace','blocked');
  if(!rule) add('member','blocked');
  if(rule?.evidenceConflict) add('evidence_conflict','pending');
  if(!Array.isArray(lanes)||!lanes.length) add('choose_lanes','pending');
  if(rule) for(const lane of Array.isArray(lanes)?lanes:[]) {
    const laneId=typeof lane?.id==='string'?lane.id:null;
    if(!laneId){add('lane_unknown','pending');continue;}
    const geo=['origin_city','origin_state','origin_country','destination_city','destination_state','destination_country'];
    if(geo.some(k=>!fold(lane[k]))) add('geography_missing','pending',laneId);
    else if(country(lane.origin_country)!=='mx'||state(lane.origin_state)!=='qe'||city(lane.origin_city)!==rule.origin||country(lane.destination_country)!=='us'||!rule.destinations.includes(city(lane.destination_city)+':'+state(lane.destination_state))) add('route','blocked',laneId);
    const operation=fold(lane.operation);
    if(operation && !['mx northbound','d2d export','d2d exports','d2d crossborder export','ftl mx northbound'].includes(operation)) add('direction','blocked',laneId);
    const eq=equipment(lane);
    if(eq!=='known') add(eq==='different'?'equipment':'equipment_missing',eq==='different'?'blocked':'pending',laneId);
    const facts=reeferFacts(lane);
    const get=(key,code)=>{const f=facts[key];if(f?.state!=='known'){add(f?.state==='ambiguous'?'requirements_ambiguous':code,'pending',laneId);return null;}return f.value;};
    const product=get('product','product_missing');
    if(product!==null&&!rule.products.includes(product)) add('product','blocked',laneId);
    get('temperature','temperature_missing');
    if(rule.weightBelowKg) {
      const w=get(facts.grossWeight?'grossWeight':'weight','weight_missing');
      if(w!==null&&w>=rule.weightBelowKg) add('weight_breco','blocked',laneId);
    }
    if(rule.handling) {
      const w=get('grossWeight','gross_weight_missing');
      if(w!==null&&w>rule.grossMaxKg) add('weight_frio','blocked',laneId);
      for(const key of ['palletized','precooled']) {
        const value=get(key,key+'_missing'); if(value===false) add(key,'blocked',laneId);
      }
      for(const key of ['customsByCarrier','insuranceByCarrier','handlingByCarrier']) {
        const value=get(key,key+'_missing'); if(value===true) add(key,'blocked',laneId);
      }
    }
  }
  const status=issues.some(i=>i.status==='blocked')?'blocked':issues.length?'pending':'compatible';
  return {applies:true,ok:status==='compatible',status,issues,policyId:REEFER_POLICY.id,sourceRefs:rule?.refs ?? []};
}
