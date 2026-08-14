import { ACTION_CONTRACT as BASE_ACTION_CONTRACT } from '../supabase/functions/_shared/action-contract.mjs';
import { PROVIDER_SERVICE_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-provider-service.mjs';

const extension = PROVIDER_SERVICE_ACTION_CONTRACT_EXTENSION;
const contractVersion = extension.contractVersion;
const delta = extension.expectedCountsDelta;

// Provider Service is hosted inside the authenticated shipper-directory-api runtime.
// Its local dependency changes that function's shared authorization envelope for
// all eight pre-existing actions even though their handler source segments are unchanged.
// Build 15 adds two bounded read-only communications actions under the same canonical
// Kinde -> workspace -> tenant resolver and does not add a new externally discovered action.
const shipperDirectoryEnvelope = '08c65fd8cda5dcf4b4bca5dae412fb1e0f4c5ed2726e3d205cc09a38f3c43bd8';
const legacyAuthorizationOverrides = Object.fromEntries([
  'edge.shipper-directory-api.get_shipper',
  'edge.shipper-directory-api.list_shippers',
  'edge.shipper-directory-api.shipper_account_activity',
  'edge.shipper-directory-api.shipper_action_queue',
  'edge.shipper-directory-api.shipper_commercial_work',
  'edge.shipper-directory-api.shipper_crm_summary',
  'edge.shipper-directory-api.shipper_intelligence',
  'edge.shipper-directory-api.shipper_relationship_pipeline',
].map((canonicalId) => [canonicalId, shipperDirectoryEnvelope]));

// Phase 0 models every PostgreSQL RPC as internal/service-role + internal_only.
// Twenty Provider Service guard/trigger functions are additionally made non-invocable
// by SQL REVOKE and verified by provider-service-rpc-security.test.mjs.
const providerMetadataOverrides = {
  'rpc.public.provider_service_guard_activation_identity()': 'fcfa89fa08013e4acb8ca0b84a566b620cadb4b7950b403c44625c271999d5a0',
  'rpc.public.provider_service_guard_case_identity_and_transition()': 'fadc36f6c20369df5857fc514bea0494a6806b76c45d0fccb791bdf83a9aaf83',
  'rpc.public.provider_service_guard_communication_message_identity()': '64c26101578e85ad6f27df0b2f56c0c6f8572847c96c3c7a9699ee81470fc5dc',
  'rpc.public.provider_service_guard_compliance_evaluation_identity()': 'f8e41e6c08e30a1c3cc4e9b604f5275d24bda9005650a565cac8acf12a74cff8',
  'rpc.public.provider_service_guard_compliance_result_snapshot()': '4aa616038c8e977571e0cdc87042b7fb6e771103fe0fb26c7d9b813a5451566e',
  'rpc.public.provider_service_guard_document_identity()': 'fef124ad7986438cb0f0ac9ca28d2d12fb4a2df1f546f2c9399de03721079c59',
  'rpc.public.provider_service_guard_document_version_file_identity()': '3871def4bc08d309527bf806cc56b61d5b896042efe1d69fc6f956213c9166b2',
  'rpc.public.provider_service_guard_exception_approval()': '2cb4e8a111bba4768005da2a4b36a1868b4fbe32f2be389f5bdaf2020a5e591b',
  'rpc.public.provider_service_guard_extraction_terminal_state()': '7de91a81e01796f49fe8d3603c6cd49bd29d5e91b3e95a773dbfd6bb3b4c882a',
  'rpc.public.provider_service_guard_requirement_link_identity()': 'bfaff15e08aa6f9fb60c3fcbcef4607ff4b049be6ba09a940cf6a062140efbb7',
  'rpc.public.provider_service_guard_requirement_snapshot()': '7cbc1ea78f970dd1e3c557264c3b0d0f0febfa9a2515ef62e4630139ad57b70f',
  'rpc.public.provider_service_guard_review_terminal_state()': 'a0920613798b61462c0bee785d600e15eb0680d561e7b2ba6589ce06eb12fffa',
  'rpc.public.provider_service_guard_template_mutation()': 'c74ec87fcf9dee6bbb9eb4c46ae82f2be2dc5a497c2044246632cb720292aff9',
  'rpc.public.provider_service_guard_template_requirement_mutation()': 'ef0b918b80eaf3e9f5cdac194c4f236fb6102869bd9961d95b75e5f816d1cfaf',
  'rpc.public.provider_service_reject_activation_event_mutation()': '88f3fdb17fa445aa2f0419fa5e812a99fb59ff2d66b2d6b1efa42d296de8aaa6',
  'rpc.public.provider_service_reject_approval_event_mutation()': '03e1844c68331e7759bbd4a2840cd09e260fea15b0c330772af244a31a945d6b',
  'rpc.public.provider_service_reject_communication_event_mutation()': '212871996fd4a7e07bc9f1b434e56a196c2658d22b3532717085d18b4c5dfb19',
  'rpc.public.provider_service_reject_compliance_event_mutation()': 'c63e77ca58659c604b5241ef8375402863c617049fbbf90600c0f807f909793d',
  'rpc.public.provider_service_reject_document_event_mutation()': 'd906a4b3599bc247f5db9383a5c6efe785860e42d86582faeccaf8a96397480a',
  'rpc.public.provider_service_reject_portal_event_mutation()': '0345a2b8a89ecd4617d04ed6046b2c30c266a24f3418b8cdf3da3e7204ca6188',
};

const providerSurfaces = extension.surfaces.map((entry) => ({
  ...entry,
  decisionStatus: 'internal_only',
}));

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
    ...providerMetadataOverrides,
  },
  reviewedAuthorizationFingerprints: {
    ...BASE_ACTION_CONTRACT.reviewedAuthorizationFingerprints,
    ...legacyAuthorizationOverrides,
    ...extension.reviewedAuthorizationFingerprints,
  },
  surfaces: [
    ...BASE_ACTION_CONTRACT.surfaces.map((entry) => ({ ...entry, contractVersion })),
    ...providerSurfaces,
  ],
};
