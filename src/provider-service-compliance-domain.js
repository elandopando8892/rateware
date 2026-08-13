export const PROVIDER_COMPLIANCE_RESULTS = Object.freeze(['unknown','pass','fail','warn','review','error']);
export const PROVIDER_COMPLIANCE_SEVERITIES = Object.freeze(['info','low','medium','high','critical']);

export function complianceEvidenceQualifies(input) {
  if (!input || typeof input !== 'object') return false;
  if (String(input.status ?? 'active').toLowerCase() !== 'active') return false;
  const kind=String(input.evidenceKind ?? '').toLowerCase();
  if (kind==='document') return String(input.documentEffectiveState ?? '').toLowerCase()==='verified';
  if (kind==='external' || kind==='manual') return Boolean(input.verifiedAt && String(input.verifiedByUserId ?? '').trim());
  return false;
}

function effectiveResult(row, now) {
  const result=String(row.result ?? 'unknown').toLowerCase();
  if (result==='pass' && row.validUntil) {
    const expiry=new Date(row.validUntil);
    if (!Number.isNaN(expiry.getTime()) && expiry <= now) return 'expired';
  }
  if (result==='pass' && row.evidenceRequired===true) {
    const evidence=Array.isArray(row.evidence) ? row.evidence : [];
    if (!evidence.some(complianceEvidenceQualifies)) return 'review';
  }
  return result;
}

export function evaluateProviderCompliance(results, now=new Date()) {
  const rows=Array.isArray(results) ? results : [];
  const current=now instanceof Date ? now : new Date(now);
  if (rows.length===0) return Object.freeze({status:'not_configured',holdRecommended:false,warningCount:0});

  const evaluated=rows.map(row=>({...row,effectiveResult:effectiveResult(row,current)}));
  const required=evaluated.filter(row=>row.isRequired!==false);
  const blocking=required.filter(row=>row.isBlocking===true);

  const blockingFail=blocking.some(row=>row.effectiveResult==='fail');
  const blockingExpired=blocking.some(row=>row.effectiveResult==='expired');
  const blockingReview=blocking.some(row=>['unknown','review','error'].includes(row.effectiveResult));
  const warningCount=evaluated.filter(row=>row.effectiveResult==='warn').length;
  const requiredIncomplete=required.some(row=>!['pass','warn'].includes(row.effectiveResult));

  let status='compliant';
  if (blockingFail) status='non_compliant';
  else if (blockingExpired) status='expired';
  else if (blockingReview || requiredIncomplete) status='review_required';
  else if (warningCount>0) status='compliant_with_warnings';

  return Object.freeze({
    status,
    holdRecommended:['non_compliant','expired'].includes(status),
    warningCount,
    resultCount:evaluated.length,
    blockingFailureCount:blocking.filter(row=>row.effectiveResult==='fail').length,
    blockingExpiredCount:blocking.filter(row=>row.effectiveResult==='expired').length,
    reviewCount:required.filter(row=>['unknown','review','error'].includes(row.effectiveResult)).length,
  });
}

export function validateComplianceRuleDraft(input) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new TypeError('Compliance rule draft must be an object.');
  const ruleCode=String(input.ruleCode ?? '').trim().toLowerCase();
  const evaluatorCode=String(input.evaluatorCode ?? '').trim().toLowerCase();
  const severity=String(input.severity ?? 'medium').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,127}$/.test(ruleCode)) throw new TypeError('Invalid compliance rule code.');
  if (!/^[a-z][a-z0-9_]{1,127}$/.test(evaluatorCode)) throw new TypeError('Invalid compliance evaluator code.');
  if (!PROVIDER_COMPLIANCE_SEVERITIES.includes(severity)) throw new RangeError('Invalid compliance severity.');
  if (typeof input.evaluatorSql==='string' && input.evaluatorSql.trim()) throw new TypeError('Dynamic SQL evaluators are forbidden.');
  return Object.freeze({ruleCode,evaluatorCode,severity,isRequired:input.isRequired!==false,isBlocking:input.isBlocking!==false,evidenceRequired:Boolean(input.evidenceRequired)});
}
