// Applying operator waivers to a readiness evaluation.
//
// Pure decision logic, kept out of the database module so the rules that decide when an
// override is allowed can be executed in a test rather than inferred from a query.
//
// THE RULES, AND WHY EACH ONE
//
// 1. A waiver applies to exactly one requirement, for one legal entity, under one
//    requirement-set version. Requirements are re-versioned when policy changes, so a
//    waiver granted against v1 must not survive into v2 — the thing it excused may no
//    longer be the same requirement.
//
// 2. An expired waiver is not honoured. Expiry is what stops a one-off exception from
//    quietly becoming the standard.
//
// 3. A waiver never upgrades a row to 'satisfied'. The row becomes 'waived', which
//    carries no evidence reference and no hash. Nothing downstream can mistake an
//    operator's decision for a verified document.
//
// 4. A waiver is refused on a 'conflict' row. Every other unmet status means evidence is
//    absent, stale or unverified — a gap an operator can knowingly accept. 'conflict'
//    means the evidence we hold contradicts itself, which is a data-integrity fault, not
//    a gap. Waiving it would bury the contradiction instead of resolving it.
//
// 5. A waiver on an already-satisfied requirement is inert, and says so. Requirements
//    get satisfied after a waiver is issued (the document finally arrives); the waiver
//    should not then subtract from the satisfied count.

export const WAIVER_POLICY_VERSION = '2026.08.19';

/** The longest a waiver may run before an operator has to look at it again. */
export const MAX_WAIVER_DAYS = 180;

/** Row statuses an operator may knowingly accept. See rule 4 for the omission. */
export const WAIVABLE_STATUSES = Object.freeze(['missing', 'unverified', 'expired', 'withheld']);

const asTime = (value) => {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Decides whether one waiver may be applied to one evaluated requirement row.
 *
 * @returns {{ applied: boolean, reason: string }} `reason` is recorded either way, so a
 *   refused waiver stays visible instead of looking like it was never issued.
 */
export function evaluateWaiver({ waiver, row, now } = {}) {
  if (!waiver) return { applied: false, reason: 'no_waiver' };
  if (waiver.waiver_status !== 'active') return { applied: false, reason: 'waiver_not_active' };

  const expiresAt = asTime(waiver.expires_at);
  const at = asTime(now) ?? 0;
  if (expiresAt === null) return { applied: false, reason: 'waiver_expiry_unreadable' };
  if (expiresAt <= at) return { applied: false, reason: 'waiver_expired' };

  if (!row) return { applied: false, reason: 'requirement_not_evaluated' };
  if (row.status === 'satisfied') return { applied: false, reason: 'requirement_already_satisfied' };
  if (row.status === 'conflict') return { applied: false, reason: 'conflicting_evidence_not_waivable' };
  if (!WAIVABLE_STATUSES.includes(row.status)) return { applied: false, reason: 'status_not_waivable' };

  return { applied: true, reason: 'operator_waiver_applied' };
}

/**
 * Applies active waivers to evaluated rows and recomputes the evaluation counts.
 *
 * Takes and returns plain data: `rows` are the readiness rows already computed from
 * evidence, `waivers` the active waiver records for this entity and requirement set.
 *
 * @returns {{ rows, counts, evaluation_status, applied, refused }}
 */
export function applyWaivers({
  rows = [], waivers = [], now = new Date().toISOString(),
  program_code = null, requirement_set_version = null,
} = {}) {
  const byRequirement = new Map();
  const outOfScope = [];
  for (const waiver of waivers) {
    if (!waiver || !waiver.requirement_id) continue;
    // Rule 1, enforced here rather than trusted to the caller's query: a waiver granted
    // against a different requirement-set version excused a requirement that may since
    // have changed, so it does not carry forward. Scoping is checked only when the
    // caller states the scope; an unstated scope means "whatever these waivers are for".
    const wrongProgram = program_code && String(waiver.program_code) !== String(program_code);
    const wrongVersion = requirement_set_version !== null
      && Number(waiver.requirement_set_version) !== Number(requirement_set_version);
    if (wrongProgram || wrongVersion) {
      outOfScope.push({
        waiver_id: waiver.id ?? null,
        requirement_code: waiver.requirement_code ?? null,
        reason: wrongProgram ? 'waiver_program_mismatch' : 'waiver_version_mismatch',
      });
      continue;
    }
    byRequirement.set(String(waiver.requirement_id), waiver);
  }

  const applied = [];
  const refused = [...outOfScope];
  const decided = rows.map((row) => {
    const waiver = byRequirement.get(String(row.requirement?.id));
    if (!waiver) return row;
    const verdict = evaluateWaiver({ waiver, row, now });
    if (!verdict.applied) {
      refused.push({
        requirement_code: row.requirement?.requirement_code ?? null,
        waiver_id: waiver.id ?? null,
        reason: verdict.reason,
      });
      return row;
    }
    applied.push({
      requirement_code: row.requirement?.requirement_code ?? null,
      waiver_id: waiver.id ?? null,
      previous_status: row.status,
    });
    return {
      ...row,
      status: 'waived',
      reason: verdict.reason,
      // Rule 3: a waived row carries no evidence. Whatever partial match was found is
      // dropped rather than travelling under a status that implies it was accepted.
      fact_id: null,
      asset_id: null,
      evidence_sha256: null,
      waiver_id: waiver.id ?? null,
    };
  });

  const required = decided.filter((row) => row.requirement?.is_required);
  const satisfied = required.filter((row) => row.status === 'satisfied').length;
  const waived = required.filter((row) => row.status === 'waived').length;
  const missing = required.length - satisfied - waived;
  const blocking = required.filter((row) => ['expired', 'unverified', 'conflict', 'withheld'].includes(row.status)).length;

  let status;
  if (missing > 0) status = blocking ? 'blocked' : 'incomplete';
  else status = waived > 0 ? 'complete_with_waivers' : 'complete';

  return {
    rows: decided,
    counts: { required_count: required.length, satisfied_count: satisfied, waived_count: waived, missing_count: missing, blocking_count: blocking },
    evaluation_status: status,
    applied,
    refused,
  };
}

/**
 * Validates a requested waiver before it is written.
 *
 * Throws rather than returning a verdict: an invalid waiver must never reach the table,
 * and the caller has nothing useful to do with a soft failure.
 */
export function validateWaiverRequest({ justification, expires_at, authorized_at, substitute_reference } = {}) {
  const reason = String(justification ?? '').trim();
  if (reason.length < 20) throw new Error('justification must explain the override in at least 20 characters.');
  if (reason.length > 2000) throw new Error('justification is too long.');

  const substitute = String(substitute_reference ?? '').trim();
  if (substitute.length > 2000) throw new Error('substitute_reference is too long.');

  const from = asTime(authorized_at) ?? Date.now();
  const until = asTime(expires_at);
  if (until === null) throw new Error('expires_at must be a valid timestamp.');
  if (until <= from) throw new Error('expires_at must be in the future.');
  if (until - from > MAX_WAIVER_DAYS * 86400000) {
    throw new Error(`A waiver may not run longer than ${MAX_WAIVER_DAYS} days.`);
  }

  return { justification: reason, substitute_reference: substitute || null, expires_at: new Date(until).toISOString() };
}
