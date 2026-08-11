import {
  IdentityContractError,
  normalizeVerifiedKindeIdentity,
  resolveCanonicalTenant
} from "./identity-contract.mjs";

export type VerifiedKindeIdentity = {
  provider: "kinde";
  externalSubject: string;
  externalOrganizationId: string;
  email: string | null;
};

export type CanonicalTenantContext = VerifiedKindeIdentity & {
  identityId: string;
  canonicalTenantId: string;
  canonicalOwnerKey: string | null;
};

export {
  IdentityContractError,
  normalizeVerifiedKindeIdentity,
  resolveCanonicalTenant
};
