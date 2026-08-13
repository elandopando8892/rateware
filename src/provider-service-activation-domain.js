export const PROVIDER_ACTIVATION_TRACKS = Object.freeze([
  'provider_readiness',
  'xbf_customer_setup',
  'commercial_operational_readiness',
]);

export const PROVIDER_REQUIREMENT_STATES = Object.freeze([
  'pending',
  'in_progress',
  'submitted',
  'under_review',
  'passed',
  'failed',
  'correction_required',
  'expired',
  'not_applicable',
]);

export const PROVIDER_READINESS_STATES = Object.freeze([
  'not_configured',
  'in_progress',
  'blocked',
  'ready',
]);

const REQUIREMENT_TRANSITIONS = Object.freeze({
  pending: ['in_progress', 'submitted', 'under_review', 'passed', 'failed', 'not_applicable'],
  in_progress: ['submitted', 'under_review', 'passed', 'failed', 'correction_required', 'expired', 'not_applicable'],
  submitted: ['in_progress', 'under_review', 'passed', 'failed', 'correction_required', 'expired'],
  under_review: ['in_progress', 'passed', 'failed', 'correction_required', 'expired', 'not_applicable'],
  passed: ['under_review', 'correction_required', 'expired'],
  failed: ['in_progress', 'submitted', 'under_review', 'passed', 'correction_required', 'expired'],
  correction_required: ['in_progress', 'submitted', 'under_review', 'passed', 'failed', 'expired'],
  expired: ['in_progress', 'submitted', 'under_review', 'passed', 'not_applicable'],
  not_applicable: ['pending', 'under_review'],
});

const NORMALIZED_CODE_PATTERN = /^[a-z][a-z0-9_]{1,127}$/;

function asDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value == null || value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeBoolean(value, fallback = false) {
  if (value == null) return fallback;
  return value === true;
}

export function normalizeActivationTrackCode(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!PROVIDER_ACTIVATION_TRACKS.includes(normalized)) {
    throw new RangeError(`Unsupported provider activation track: ${value}`);
  }
  return normalized;
}

export function normalizeRequirementCode(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!NORMALIZED_CODE_PATTERN.test(normalized)) {
    throw new TypeError('Requirement code must be a normalized snake_case identifier.');
  }

  return normalized;
}

export function isProviderRequirementState(value) {
  return PROVIDER_REQUIREMENT_STATES.includes(String(value ?? '').trim().toLowerCase());
}

export function canTransitionProviderRequirement(fromState, toState) {
  const from = String(fromState ?? '').trim().toLowerCase();
  const to = String(toState ?? '').trim().toLowerCase();
  if (!isProviderRequirementState(from) || !isProviderRequirementState(to)) return false;
  if (from === to) return true;
  return REQUIREMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertProviderRequirementTransition(fromState, toState) {
  if (!canTransitionProviderRequirement(fromState, toState)) {
    throw new RangeError(`Invalid provider requirement transition: ${fromState} -> ${toState}`);
  }
  return String(toState).trim().toLowerCase();
}

export function isEffectiveProviderException(exceptionRecord, at = new Date()) {
  if (!exceptionRecord || typeof exceptionRecord !== 'object') return false;
  if (String(exceptionRecord.status ?? '').trim().toLowerCase() !== 'approved') return false;

  const now = asDate(at);
  const effectiveFrom = asDate(exceptionRecord.effectiveFrom ?? exceptionRecord.effective_from);
  const expiresAt = asDate(exceptionRecord.expiresAt ?? exceptionRecord.expires_at);
  const revokedAt = asDate(exceptionRecord.revokedAt ?? exceptionRecord.revoked_at);

  if (!now || !effectiveFrom || !expiresAt) return false;
  if (revokedAt && revokedAt <= now) return false;
  return effectiveFrom <= now && now < expiresAt;
}

export function providerExceptionAppliesToRequirement(exceptionRecord, requirement) {
  if (!exceptionRecord || !requirement) return false;

  const scopeType = String(exceptionRecord.scopeType ?? exceptionRecord.scope_type ?? '').trim().toLowerCase();
  const activationId = String(requirement.activationId ?? requirement.activation_id ?? '');
  const trackCode = String(requirement.trackCode ?? requirement.track_code ?? '').trim().toLowerCase();
  const requirementId = String(requirement.id ?? requirement.requirementId ?? requirement.requirement_id ?? '');

  if (String(exceptionRecord.activationId ?? exceptionRecord.activation_id ?? '') !== activationId) return false;

  if (scopeType === 'activation') return true;
  if (scopeType === 'track') {
    return String(exceptionRecord.trackCode ?? exceptionRecord.track_code ?? '').trim().toLowerCase() === trackCode;
  }
  if (scopeType === 'requirement') {
    return String(
      exceptionRecord.activationRequirementId
      ?? exceptionRecord.activation_requirement_id
      ?? exceptionRecord.requirementId
      ?? exceptionRecord.requirement_id
      ?? '',
    ) === requirementId;
  }

  return false;
}

export function getProviderRequirementEffectiveState(requirement, at = new Date()) {
  const state = String(requirement?.state ?? 'pending').trim().toLowerCase();
  if (!isProviderRequirementState(state)) return state;
  if (state !== 'passed') return state;

  const now = asDate(at);
  const expiresAt = asDate(requirement?.expiresAt ?? requirement?.expires_at);
  if (now && expiresAt && expiresAt <= now) return 'expired';
  return state;
}

export function isProviderRequirementSatisfied(requirement, exceptions = [], at = new Date()) {
  if (!requirement || typeof requirement !== 'object') return false;

  const state = getProviderRequirementEffectiveState(requirement, at);
  if (state === 'passed') return true;

  if (state === 'not_applicable') {
    const reviewedAt = asDate(requirement.reviewedAt ?? requirement.reviewed_at);
    const reviewedBy = String(requirement.reviewedByUserId ?? requirement.reviewed_by_user_id ?? '').trim();
    if (reviewedAt && reviewedBy) return true;
  }

  return exceptions.some((exceptionRecord) => (
    isEffectiveProviderException(exceptionRecord, at)
    && providerExceptionAppliesToRequirement(exceptionRecord, requirement)
  ));
}

export function evaluateProviderTrackReadiness({
  activationId,
  trackCode,
  requirements = [],
  exceptions = [],
  at = new Date(),
} = {}) {
  const normalizedTrack = normalizeActivationTrackCode(trackCode);
  const scopedRequirements = requirements.filter((requirement) => (
    String(requirement.activationId ?? requirement.activation_id ?? '') === String(activationId ?? '')
    && String(requirement.trackCode ?? requirement.track_code ?? '').trim().toLowerCase() === normalizedTrack
  ));

  const requiredRequirements = scopedRequirements.filter((requirement) => normalizeBoolean(requirement.required, true));
  const satisfiedRequired = requiredRequirements.filter((requirement) => (
    isProviderRequirementSatisfied(requirement, exceptions, at)
  ));
  const blockingRequirements = requiredRequirements.filter((requirement) => {
    if (!normalizeBoolean(requirement.blocking, true)) return false;
    if (isProviderRequirementSatisfied(requirement, exceptions, at)) return false;
    const effectiveState = getProviderRequirementEffectiveState(requirement, at);
    return ['failed', 'correction_required', 'expired'].includes(effectiveState);
  });

  let readinessState = 'in_progress';
  if (scopedRequirements.length === 0 || requiredRequirements.length === 0) {
    readinessState = 'not_configured';
  } else if (blockingRequirements.length > 0) {
    readinessState = 'blocked';
  } else if (satisfiedRequired.length === requiredRequirements.length) {
    readinessState = 'ready';
  }

  const completionPercentage = requiredRequirements.length === 0
    ? 0
    : Math.round((satisfiedRequired.length / requiredRequirements.length) * 10000) / 100;

  return Object.freeze({
    activationId: String(activationId ?? ''),
    trackCode: normalizedTrack,
    readinessState,
    totalRequirementCount: scopedRequirements.length,
    requiredRequirementCount: requiredRequirements.length,
    satisfiedRequiredCount: satisfiedRequired.length,
    blockerCount: blockingRequirements.length,
    blockerRequirementCodes: Object.freeze(blockingRequirements.map((requirement) => (
      String(requirement.requirementCode ?? requirement.requirement_code ?? '')
    )).filter(Boolean)),
    completionPercentage,
  });
}

export function evaluateProviderActivationReadiness({
  activationId,
  requirements = [],
  exceptions = [],
  at = new Date(),
} = {}) {
  const tracks = PROVIDER_ACTIVATION_TRACKS.map((trackCode) => evaluateProviderTrackReadiness({
    activationId,
    trackCode,
    requirements,
    exceptions,
    at,
  }));

  let readinessState = 'in_progress';
  if (tracks.some((track) => track.readinessState === 'blocked')) {
    readinessState = 'blocked';
  } else if (tracks.some((track) => track.readinessState === 'not_configured')) {
    readinessState = 'not_configured';
  } else if (tracks.every((track) => track.readinessState === 'ready')) {
    readinessState = 'ready';
  }

  const requiredRequirementCount = tracks.reduce((sum, track) => sum + track.requiredRequirementCount, 0);
  const satisfiedRequiredCount = tracks.reduce((sum, track) => sum + track.satisfiedRequiredCount, 0);
  const completionPercentage = requiredRequirementCount === 0
    ? 0
    : Math.round((satisfiedRequiredCount / requiredRequirementCount) * 10000) / 100;

  return Object.freeze({
    activationId: String(activationId ?? ''),
    readinessState,
    canActivate: readinessState === 'ready',
    requiredRequirementCount,
    satisfiedRequiredCount,
    blockerCount: tracks.reduce((sum, track) => sum + track.blockerCount, 0),
    completionPercentage,
    tracks: Object.freeze(tracks),
  });
}

export function assertProviderActivationReady(input) {
  const readiness = evaluateProviderActivationReadiness(input);
  if (!readiness.canActivate) {
    throw new RangeError(`Provider activation is not ready: ${readiness.readinessState}`);
  }
  return readiness;
}
