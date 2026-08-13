import { createHash, timingSafeEqual } from 'node:crypto';

export const PROVIDER_PORTAL_SCOPES = Object.freeze([
  'profile', 'requirements', 'documents', 'cases', 'status',
]);

export function hashProviderPortalToken(token) {
  const value = String(token ?? '').trim();
  if (value.length < 32) throw new TypeError('Portal token must contain at least 32 characters.');
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function providerPortalTokenMatches(token, expectedHash) {
  const expected = String(expectedHash ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) return false;
  let actual;
  try { actual = hashProviderPortalToken(token); } catch { return false; }
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

export function normalizeProviderPortalEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TypeError('Invalid portal email address.');
  return email;
}

export function effectiveProviderPortalInvitationStatus(input, now = new Date()) {
  const status = String(input?.status ?? 'active').trim().toLowerCase();
  if (['revoked', 'submitted', 'expired'].includes(status)) return status;
  const expiresAt = input?.expiresAt ? new Date(input.expiresAt) : null;
  const current = now instanceof Date ? now : new Date(now);
  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || Number.isNaN(current.getTime())) {
    throw new TypeError('Portal invitation expiry and current time must be valid dates.');
  }
  if (current >= expiresAt) return 'expired';
  return status;
}

export function providerPortalAllowsScope(input, scope, now = new Date()) {
  if (!PROVIDER_PORTAL_SCOPES.includes(scope)) return false;
  const state = effectiveProviderPortalInvitationStatus(input, now);
  if (!['active', 'viewed'].includes(state)) return false;
  return Array.isArray(input?.allowedScopes) && input.allowedScopes.includes(scope);
}

export function providerPortalRequirementNeedsAction(input) {
  if (!input || typeof input !== 'object') return false;
  if (String(input.accessStatus ?? 'active').toLowerCase() !== 'active') return false;
  if (input.requirementSatisfied === true) return false;
  const responseState = String(input.responseStatus ?? '').toLowerCase();
  if (responseState === 'accepted') return false;
  return ['read_only'].includes(String(input.accessMode ?? '').toLowerCase()) === false;
}

export function providerPortalSubmissionDisposition(input) {
  if (!input || typeof input !== 'object') throw new TypeError('Portal submission is required.');
  return Object.freeze({
    canonicalMutationAllowed: false,
    internalReviewRequired: true,
    providerRelationshipId: String(input.providerRelationshipId ?? '').trim() || null,
    legalEntityId: String(input.legalEntityId ?? '').trim() || null,
  });
}
