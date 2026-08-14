import { ACTION_CONTRACT as BASE_ACTION_CONTRACT } from '../supabase/functions/_shared/action-contract.mjs';
import { PROVIDER_SERVICE_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-provider-service.mjs';

const extension = PROVIDER_SERVICE_ACTION_CONTRACT_EXTENSION;
const contractVersion = extension.contractVersion;
const delta = extension.expectedCountsDelta;

export const ACTION_CONTRACT = {
  ...BASE_ACTION_CONTRACT,
  contractVersion,
  methodVersion: `${BASE_ACTION_CONTRACT.methodVersion}+provider-service-convergence`,
  expectedCounts: {
    governable: BASE_ACTION_CONTRACT.expectedCounts.governable + delta.governable,
    edge: BASE_ACTION_CONTRACT.expectedCounts.edge + delta.edge,
    postgres: BASE_ACTION_CONTRACT.expectedCounts.postgres + delta.postgres,
    ratewareApi: BASE_ACTION_CONTRACT.expectedCounts.ratewareApi + delta.ratewareApi,
  },
  reviewedMetadataFingerprints: {
    ...BASE_ACTION_CONTRACT.reviewedMetadataFingerprints,
    ...extension.reviewedMetadataFingerprints,
  },
  reviewedAuthorizationFingerprints: {
    ...BASE_ACTION_CONTRACT.reviewedAuthorizationFingerprints,
    ...extension.reviewedAuthorizationFingerprints,
  },
  surfaces: [
    ...BASE_ACTION_CONTRACT.surfaces.map((entry) => ({ ...entry, contractVersion })),
    ...extension.surfaces,
  ],
};
