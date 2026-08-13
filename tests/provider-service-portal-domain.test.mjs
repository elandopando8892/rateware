import test from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveProviderPortalInvitationStatus,
  hashProviderPortalToken,
  normalizeProviderPortalEmail,
  providerPortalAllowsScope,
  providerPortalRequirementNeedsAction,
  providerPortalSubmissionDisposition,
  providerPortalTokenMatches,
} from '../src/provider-service-portal-domain.js';

const TOKEN='0123456789abcdef0123456789abcdef0123456789abcdef';
const NOW=new Date('2026-08-13T20:00:00Z');

test('stores and compares portal tokens only through SHA-256',()=>{
  const hash=hashProviderPortalToken(TOKEN);
  assert.equal(hash.length,64);
  assert.equal(providerPortalTokenMatches(TOKEN,hash),true);
  assert.equal(providerPortalTokenMatches(`${TOKEN}x`,hash),false);
});

test('normalizes invited email',()=>{
  assert.equal(normalizeProviderPortalEmail(' AP@Carrier.COM '),'ap@carrier.com');
});

test('expires invitations deterministically',()=>{
  assert.equal(effectiveProviderPortalInvitationStatus({status:'active',expiresAt:'2026-08-13T19:59:59Z'},NOW),'expired');
  assert.equal(effectiveProviderPortalInvitationStatus({status:'viewed',expiresAt:'2026-08-14T20:00:00Z'},NOW),'viewed');
});

test('scope access requires a live invitation and explicit scope',()=>{
  const invitation={status:'active',expiresAt:'2026-08-14T20:00:00Z',allowedScopes:['requirements']};
  assert.equal(providerPortalAllowsScope(invitation,'requirements',NOW),true);
  assert.equal(providerPortalAllowsScope(invitation,'profile',NOW),false);
});

test('provider submissions never mutate canonical records directly',()=>{
  assert.deepEqual(providerPortalSubmissionDisposition({providerRelationshipId:'rel-1',legalEntityId:'xbf-us'}),{
    canonicalMutationAllowed:false,
    internalReviewRequired:true,
    providerRelationshipId:'rel-1',
    legalEntityId:'xbf-us',
  });
  assert.equal(providerPortalRequirementNeedsAction({accessMode:'respond',accessStatus:'active',requirementSatisfied:false}),true);
});
