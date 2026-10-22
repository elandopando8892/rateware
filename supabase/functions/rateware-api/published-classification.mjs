import { normalizeVerifiedIdentity } from '../_shared/identity-contract.mjs';
import { parsePublishedClassification, PENDING_CASES, IDENTITY_PENDING_RATE_ID } from '../_shared/published-classification-contract.mjs';

/** Existing authenticator verifies claims before this action. No client-provided scope is accepted. */
export async function readPublishedCarrierClassification({ client, verifiedClaims, workspace }) {
  let organizationId;
  try {
    const identity = normalizeVerifiedIdentity(verifiedClaims);
    organizationId = identity.externalOrganizationId;
    if (organizationId !== workspace?.organization_id) throw new Error('SCOPE_MISMATCH');
    if (verifiedClaims.rateware_organization_id != null && verifiedClaims.rateware_organization_id !== organizationId) throw new Error('AMBIGUOUS_ORGANIZATION');
  } catch {
    return { status: 403, body: { code: 'CLASSIFICATION_SCOPE_DENIED', error: 'Verified organization required.' } };
  }
  try {
    const result = await client.rpc('rateware_read_published_carrier_classification', {
      p_organization_id: organizationId,
      p_pending_vendor_ids: PENDING_CASES.map(c => c.vendor_id),
      p_identity_pending_rate_id: IDENTITY_PENDING_RATE_ID,
    });
    if (result?.error) throw new Error('SOURCE_UNAVAILABLE');
    return { status: 200, body: parsePublishedClassification(result?.data, organizationId) };
  } catch {
    return { status: 503, body: { code: 'CLASSIFICATION_UNAVAILABLE', error: 'Published classification could not be verified.' } };
  }
}
