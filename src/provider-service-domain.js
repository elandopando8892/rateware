export const PROVIDER_LIFECYCLE_STATUSES = Object.freeze([
  'identified',
  'contactable',
  'eligible',
  'onboarding',
  'under_review',
  'approved',
  'activated',
  'executed',
  'recurrent',
  'information_required',
  'correction_required',
  'compliance_hold',
  'finance_hold',
  'legal_review',
  'suspended',
  'rejected',
  'offboarded',
]);

export const PROVIDER_ACTIVATION_STATUSES = Object.freeze([
  'not_started',
  'in_progress',
  'blocked',
  'ready',
  'activated',
  'suspended',
]);

const LIFECYCLE_TRANSITIONS = Object.freeze({
  identified: ['contactable', 'information_required', 'rejected', 'offboarded'],
  contactable: ['eligible', 'information_required', 'rejected', 'offboarded'],
  eligible: ['onboarding', 'information_required', 'rejected', 'offboarded'],
  onboarding: ['under_review', 'information_required', 'correction_required', 'rejected', 'offboarded'],
  under_review: [
    'approved',
    'information_required',
    'correction_required',
    'compliance_hold',
    'finance_hold',
    'legal_review',
    'rejected',
    'offboarded',
  ],
  approved: ['activated', 'compliance_hold', 'finance_hold', 'legal_review', 'suspended', 'offboarded'],
  activated: ['executed', 'compliance_hold', 'finance_hold', 'suspended', 'offboarded'],
  executed: ['recurrent', 'compliance_hold', 'finance_hold', 'suspended', 'offboarded'],
  recurrent: ['compliance_hold', 'finance_hold', 'suspended', 'offboarded'],
  information_required: ['onboarding', 'under_review', 'rejected', 'offboarded'],
  correction_required: ['onboarding', 'under_review', 'rejected', 'offboarded'],
  compliance_hold: ['under_review', 'approved', 'activated', 'suspended', 'rejected', 'offboarded'],
  finance_hold: ['under_review', 'approved', 'activated', 'suspended', 'rejected', 'offboarded'],
  legal_review: ['under_review', 'approved', 'rejected', 'offboarded'],
  suspended: ['onboarding', 'under_review', 'approved', 'activated', 'offboarded'],
  rejected: ['onboarding', 'offboarded'],
  offboarded: ['identified'],
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VENDOR_CODE_PATTERN = /^VND-([A-Z0-9]{2,16})-([0-9]{6,})$/;

export function normalizeEntityCode(value) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (normalized.length < 2 || normalized.length > 16) {
    throw new TypeError('Entity code must contain 2 to 16 alphanumeric characters.');
  }

  return normalized;
}

export function normalizeProviderRoleCode(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!/^[a-z][a-z0-9_]{1,63}$/.test(normalized)) {
    throw new TypeError('Provider role code must be a normalized snake_case identifier.');
  }

  return normalized;
}

export function formatVendorCode({ entityCode, sequence }) {
  const normalizedEntityCode = normalizeEntityCode(entityCode);
  const numericSequence = Number(sequence);

  if (!Number.isSafeInteger(numericSequence) || numericSequence < 1) {
    throw new TypeError('Vendor sequence must be a positive safe integer.');
  }

  return `VND-${normalizedEntityCode}-${String(numericSequence).padStart(6, '0')}`;
}

export function parseVendorCode(value) {
  const match = String(value ?? '').trim().toUpperCase().match(VENDOR_CODE_PATTERN);
  if (!match) return null;

  const sequence = Number(match[2]);
  if (!Number.isSafeInteger(sequence) || sequence < 1) return null;

  return Object.freeze({
    vendorCode: `VND-${match[1]}-${match[2]}`,
    entityCode: match[1],
    sequence,
  });
}

export function isProviderLifecycleStatus(value) {
  return PROVIDER_LIFECYCLE_STATUSES.includes(String(value ?? '').trim().toLowerCase());
}

export function canTransitionProviderLifecycle(fromStatus, toStatus) {
  const from = String(fromStatus ?? '').trim().toLowerCase();
  const to = String(toStatus ?? '').trim().toLowerCase();

  if (!isProviderLifecycleStatus(from) || !isProviderLifecycleStatus(to)) return false;
  if (from === to) return true;

  return LIFECYCLE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertProviderLifecycleTransition(fromStatus, toStatus) {
  if (!canTransitionProviderLifecycle(fromStatus, toStatus)) {
    throw new RangeError(`Invalid provider lifecycle transition: ${fromStatus} -> ${toStatus}`);
  }

  return String(toStatus).trim().toLowerCase();
}

export function validateProviderRelationshipDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Provider relationship draft must be an object.');
  }

  const requiredUuidFields = ['organizationId', 'vendorId', 'legalEntityId'];
  for (const field of requiredUuidFields) {
    if (!UUID_PATTERN.test(String(input[field] ?? '').trim())) {
      throw new TypeError(`${field} must be a valid UUID.`);
    }
  }

  const lifecycleStatus = String(input.lifecycleStatus ?? 'identified').trim().toLowerCase();
  const activationStatus = String(input.activationStatus ?? 'not_started').trim().toLowerCase();

  if (!PROVIDER_LIFECYCLE_STATUSES.includes(lifecycleStatus)) {
    throw new RangeError(`Unsupported provider lifecycle status: ${lifecycleStatus}`);
  }

  if (!PROVIDER_ACTIVATION_STATUSES.includes(activationStatus)) {
    throw new RangeError(`Unsupported provider activation status: ${activationStatus}`);
  }

  const result = {
    organizationId: String(input.organizationId).trim().toLowerCase(),
    vendorId: String(input.vendorId).trim().toLowerCase(),
    legalEntityId: String(input.legalEntityId).trim().toLowerCase(),
    lifecycleStatus,
    activationStatus,
  };

  if (input.vendorCode != null && String(input.vendorCode).trim() !== '') {
    const parsed = parseVendorCode(input.vendorCode);
    if (!parsed) throw new TypeError('vendorCode must use the VND-{ENTITY}-{SEQUENCE} format.');
    result.vendorCode = parsed.vendorCode;
  }

  return Object.freeze(result);
}
