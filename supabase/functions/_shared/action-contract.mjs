/**
 * Phase 0 action contract, composed from the reviewed legacy inventory and
 * the reviewed Provider Service convergence extension.
 */
import { ACTION_CONTRACT as LEGACY_ACTION_CONTRACT } from './action-contract-legacy.mjs';
import { PROVIDER_SERVICE_ACTION_CONTRACT_EXTENSION } from './action-contract-provider-service.mjs';

const extension = PROVIDER_SERVICE_ACTION_CONTRACT_EXTENSION;
const contractVersion = extension.contractVersion;
const delta = extension.expectedCountsDelta;

export const ACTION_CONTRACT = {
  ...LEGACY_ACTION_CONTRACT,
  contractVersion,
  methodVersion: `${LEGACY_ACTION_CONTRACT.methodVersion}+provider-service-convergence`,
  expectedCounts: {
    governable: LEGACY_ACTION_CONTRACT.expectedCounts.governable + delta.governable,
    edge: LEGACY_ACTION_CONTRACT.expectedCounts.edge + delta.edge,
    postgres: LEGACY_ACTION_CONTRACT.expectedCounts.postgres + delta.postgres,
    ratewareApi: LEGACY_ACTION_CONTRACT.expectedCounts.ratewareApi + delta.ratewareApi,
  },
  reviewedMetadataFingerprints: {
    ...LEGACY_ACTION_CONTRACT.reviewedMetadataFingerprints,
    ...extension.reviewedMetadataFingerprints,
  },
  reviewedAuthorizationFingerprints: {
    ...LEGACY_ACTION_CONTRACT.reviewedAuthorizationFingerprints,
    ...extension.reviewedAuthorizationFingerprints,
  },
  surfaces: [
    ...LEGACY_ACTION_CONTRACT.surfaces.map((entry) => ({ ...entry, contractVersion })),
    ...extension.surfaces,
  ],
};
