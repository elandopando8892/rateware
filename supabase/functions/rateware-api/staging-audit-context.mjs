// Only call after Supabase Auth, workspace resolution and the existing role gate.
import { normalizeVerifiedIdentity, IdentityContractError } from '../_shared/identity-contract.mjs';

export const STAGING_AUDIT_HEADER = 'x-rateware-staging-audit';
export const STAGING_AUDIT_SCHEMA = 'rateware-staging-audit/1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const contexts = new WeakMap();
const fail = () => { throw new IdentityContractError('STAGING_AUDIT_IDENTITY_INVALID', 'Verified staging audit identity is inconsistent.'); };

export function createStagingAuditContext(verifiedClaims, workspace, requestId, action) {
  const identity = normalizeVerifiedIdentity(verifiedClaims);
  const org = identity.externalOrganizationId;
  const owner = workspace?.owner_email;
  const email = identity.email;
  if (!uuid.test(identity.externalSubject) || org !== workspace?.organization_id ||
      (verifiedClaims.rateware_organization_id != null && verifiedClaims.rateware_organization_id !== org) ||
      typeof owner !== 'string' || !owner.length || owner.length > 320 || /[\x00-\x1f\x7f]/.test(owner) ||
      !/^[A-Za-z0-9_.:-]{1,128}$/.test(org) ||
      (email !== null && (email.length > 320 || !/^[^\s@]+@[^\s@]+$/.test(email))) ||
      !/^[A-Za-z0-9_.:-]{8,128}$/.test(requestId)) fail();
  // The action is a correlation label, never an authorization or identity claim.
  const sourceAction = typeof action === 'string' && /^[a-z0-9_]{1,100}$/.test(action) ? action : 'unknown';
  return Object.freeze({ schema: STAGING_AUDIT_SCHEMA, source: 'rateware-api', provider: 'supabase',
    subject: identity.externalSubject.toLowerCase(), email, email_confirmed: verifiedClaims.email_confirmed === true,
    organization_id: org, owner_email: owner, request_id: requestId, source_action: sourceAction });
}

export function stagingAuditHeaders(context) {
  // HTTP headers are ByteStrings. Escaping non-ASCII preserves the verified email losslessly.
  const value = JSON.stringify(context).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  if (value.length > 8192) fail();
  return Object.freeze({ [STAGING_AUDIT_HEADER]: value });
}

export function bindStagingAuditContext(client, context) {
  // Never mutate a shared client's headers or allow it to switch verified identities.
  if (contexts.has(client)) fail();
  contexts.set(client, context);
  return client;
}

export function stagingAuditFields(client, entityType, ownerEmail, metadata) {
  if (entityType !== 'rate_staging') return { actor_email: ownerEmail, metadata };
  const context = contexts.get(client);
  return { actor_email: context?.email ?? null, metadata: { ...metadata,
    attribution: context ? 'verified_auth' : 'unavailable', verified_subject: context?.subject ?? null,
    auth_provider: context?.provider ?? null, email_confirmed: context?.email_confirmed ?? null,
    request_id: context?.request_id ?? null, source_action: context?.source_action ?? null,
    audit_schema: STAGING_AUDIT_SCHEMA, audit_kind: 'operation_summary' } };
}
