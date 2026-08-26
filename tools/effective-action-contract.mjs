import { ACTION_CONTRACT as BASE_ACTION_CONTRACT } from '../supabase/functions/_shared/action-contract.mjs';
import { CARRIER_LIST_TEMPLATE_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-carrier-list-templates.mjs';
import { PROVIDER_SERVICE_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-provider-service.mjs';

const extension = PROVIDER_SERVICE_ACTION_CONTRACT_EXTENSION;
const carrierTemplateExtension = CARRIER_LIST_TEMPLATE_ACTION_CONTRACT_EXTENSION;
const contractVersion = extension.contractVersion;
const delta = extension.expectedCountsDelta;
const carrierTemplateDelta = carrierTemplateExtension.expectedCountsDelta;

// Provider Service is hosted inside the authenticated shipper-directory-api runtime.
// Its local dependency changes that function's shared authorization envelope for
// all eight pre-existing actions even though their handler source segments are unchanged.
// Build 30 adds two sanitized, read-only onboarding actions under the same canonical
// Kinde -> workspace -> tenant resolver and does not add a new externally discovered action.
const shipperDirectoryEnvelope = 'cf049f85a1664a9df2663c3683ad72b6a249900debb1b97b9b641ac927081338';
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

// The Rateware API handler factory and Carrier List Templates imports change the
// shared authorization envelope for every action hosted by rateware-api. This is
// a static reviewed fingerprint; it is not derived from source at validation time.
const ratewareApiEnvelope = '23ad51228f3cc24759f313a2d8a5210f6b677e5cd4ef99a73fd4adb8d790d963';
const ratewareApiAuthorizationOverrides = Object.fromEntries([
  ...BASE_ACTION_CONTRACT.surfaces,
  ...carrierTemplateExtension.surfaces,
].filter((entry) => entry.canonicalId.startsWith('edge.rateware-api.'))
  .map((entry) => [entry.canonicalId, ratewareApiEnvelope]));

// These eight pre-existing actions share reviewed code segments with the newly
// added template dispatch and handler factory. Their behavior is unchanged, but
// the scanner intentionally fingerprints the complete reachable action segment.
const ratewareApiSourceFingerprintOverrides = {
  'edge.rateware-api.create_vendor_segment': '8e6a444366bfa108430e02fdf8dffbbf11a0ab0e4e102d4687f6e589f809aa69',
  'edge.rateware-api.delete_vendor_segment': '792ce2b10566c1be41064ef07f5e818088fb1f16596433d88fdb7c0fbec972d2',
  'edge.rateware-api.generate_outreach_drafts': '05f5940c29b19b93b95466b0571fc160146d32e89e253e186e58eec647d270c5',
  'edge.rateware-api.list_vendor_segments': '79d6ff15b7b7a0bcbf8e580baaed1b11575d56c38cc4034fb9b80a8891814128',
  'edge.rateware-api.list_vendors': '6aaccab686ecae9b04492be99175863f452cd0633bbe426a651ed310968faeef',
  'edge.rateware-api.send_bid_room_carrier_message': '3a8bc0f06e4f577effffd6e35350e73925fd9153db71a25266b35f40b81b7fe0',
  'edge.rateware-api.shortlist_rfx_lane_vendors': '054559e7a40ff4c2946a3a6981ad70e5cd69e49bdf3fd9016072a559dbab4030',
  'edge.rateware-api.update_vendor_segment': 'd73978185d8637b0b72028db2b30b7f5d3800a42f3d58949d25d2f4d2d978976',
};

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

const gmailAuthorizationFingerprints = {
  'edge.provider-gmail-intake-api.provider_gmail_status': '0904678e8fefab6d202730784336047beb0148e1b51eaa9dc5c36bd120689f41',
  'edge.provider-gmail-intake-api.renew_provider_gmail_watch': '0904678e8fefab6d202730784336047beb0148e1b51eaa9dc5c36bd120689f41',
  'edge.provider-gmail-intake-api.start_provider_gmail_oauth': '0904678e8fefab6d202730784336047beb0148e1b51eaa9dc5c36bd120689f41',
  'edge.provider-gmail-intake-api.sync_provider_gmail_inbox': '0904678e8fefab6d202730784336047beb0148e1b51eaa9dc5c36bd120689f41',
  'edge.provider-gmail-oauth-callback.complete_provider_gmail_oauth_callback': '61a4d760bc3bc7157e0abcebf08818cd4e84841f6ec35f7c406475e28df53a3b',
  'edge.provider-gmail-push.receive_provider_gmail_push': '2b47e44194a6ae218af455b227f5bce2a21dd4ff48690e46c67d9cd9b6bd3c2f',
};

const gmailMetadataFingerprints = {
  'edge.provider-gmail-intake-api.provider_gmail_status': '85dbc15681218bc1ca70193ec2ae29d5db0782120e3fb0da91bf3cff90e7adfa',
  'edge.provider-gmail-intake-api.renew_provider_gmail_watch': 'f4fff693928c09472972f5b9ac9d13a365174f177fadb5bb72c7f56e0808756e',
  'edge.provider-gmail-intake-api.start_provider_gmail_oauth': '6a8207af747fc37ccf2739c8a7ca721248323c430fa8aeafe305430bfe862ae1',
  'edge.provider-gmail-intake-api.sync_provider_gmail_inbox': 'aedaa25ab711b311445d607f04c9f828ef869dc560fb6ded3b45782baaa64186',
  'edge.provider-gmail-oauth-callback.complete_provider_gmail_oauth_callback': 'fec0d1b03b9b6b246c34ad98931f83368d586bd2322bddbbaa43e26c13b9c4e7',
  'edge.provider-gmail-push.receive_provider_gmail_push': '5e5b7e00fa5ae1111ad73f71d2a7c7165f0342b41868b0050cb49cc88f560f8a',
};

const gmailSharedMetadata = {
  businessModule: 'Provider Service',
  functionalOwner: 'Provider Service',
  exposure: 'external-tokenized',
  decisionStatus: 'explicitly_allowed',
  lifecycle: 'active',
  replacementAction: null,
  analysisCoverage: 'shared-observed',
  coverageSignals: ['shared_dependency_observed', 'external_dependency'],
  rpcSignature: null,
  contractVersion,
};

const gmailSurfaces = [
  {
    canonicalId: 'edge.provider-gmail-intake-api.provider_gmail_status',
    actionName: 'provider_gmail_status',
    sourceKind: 'edge-selector',
    sourceFile: 'supabase/functions/provider-gmail-intake-api/index.ts',
    handler: 'listSafeStatus',
    endpoint: 'POST /functions/v1/provider-gmail-intake-api body.action',
    operation: 'read',
    resource: 'provider-gmail-intake',
    access: 'read',
    sensitivity: 'high',
    tenantRelevance: 'tenant-scoped',
    proposedPermissionKey: 'provider.gmail.status.read',
    sourceFingerprint: 'ff47d3e1b16ed554128449d8c47321e8ae9e3bd03ad45f23694bcd8eb89b5364',
    ...gmailSharedMetadata,
  },
  {
    canonicalId: 'edge.provider-gmail-intake-api.renew_provider_gmail_watch',
    actionName: 'renew_provider_gmail_watch',
    sourceKind: 'edge-selector',
    sourceFile: 'supabase/functions/provider-gmail-intake-api/index.ts',
    handler: 'renewWatch',
    endpoint: 'POST /functions/v1/provider-gmail-intake-api body.action',
    operation: 'manage',
    resource: 'provider-gmail-intake',
    access: 'write',
    sensitivity: 'high',
    tenantRelevance: 'tenant-scoped',
    proposedPermissionKey: 'provider.gmail.watch.manage',
    sourceFingerprint: 'fdf4ab91c410e8257a263debc1b4239442bfdc4351fec42c7bc90ccf01ac4873',
    ...gmailSharedMetadata,
  },
  {
    canonicalId: 'edge.provider-gmail-intake-api.start_provider_gmail_oauth',
    actionName: 'start_provider_gmail_oauth',
    sourceKind: 'edge-selector',
    sourceFile: 'supabase/functions/provider-gmail-intake-api/index.ts',
    handler: 'startOauth',
    endpoint: 'POST /functions/v1/provider-gmail-intake-api body.action',
    operation: 'manage',
    resource: 'provider-gmail-intake',
    access: 'write',
    sensitivity: 'high',
    tenantRelevance: 'tenant-scoped',
    proposedPermissionKey: 'provider.gmail.connect.manage',
    sourceFingerprint: '8cc34ecc22576d13e08e2ba5e3a680ecb723d7a7f78a421e3128f3d622449117',
    ...gmailSharedMetadata,
  },
  {
    canonicalId: 'edge.provider-gmail-intake-api.sync_provider_gmail_inbox',
    actionName: 'sync_provider_gmail_inbox',
    sourceKind: 'edge-selector',
    sourceFile: 'supabase/functions/provider-gmail-intake-api/index.ts',
    handler: 'syncInbox',
    endpoint: 'POST /functions/v1/provider-gmail-intake-api body.action',
    operation: 'manage',
    resource: 'provider-communications',
    access: 'write',
    sensitivity: 'high',
    tenantRelevance: 'tenant-scoped',
    proposedPermissionKey: 'provider.gmail.sync.manage',
    sourceFingerprint: 'e230016c68593f77f0c194d48dfb131cdef6ce5d74be7a9e0f7373a4e7e09d86',
    ...gmailSharedMetadata,
  },
  {
    canonicalId: 'edge.provider-gmail-oauth-callback.complete_provider_gmail_oauth_callback',
    actionName: 'complete_provider_gmail_oauth_callback',
    sourceKind: 'edge-method',
    sourceFile: 'supabase/functions/provider-gmail-oauth-callback/index.ts',
    handler: 'Deno.serve',
    endpoint: 'GET /functions/v1/provider-gmail-oauth-callback?code&state',
    operation: 'manage',
    resource: 'provider-gmail-intake',
    access: 'write',
    sensitivity: 'critical',
    tenantRelevance: 'record-derived',
    proposedPermissionKey: 'external.provider-gmail-oauth.manage',
    sourceFingerprint: '09dd452318873b80f980665981dc0b9abfe5898b9c7716eb3a2c917d875b3f7e',
    ...gmailSharedMetadata,
  },
  {
    canonicalId: 'edge.provider-gmail-push.receive_provider_gmail_push',
    actionName: 'receive_provider_gmail_push',
    sourceKind: 'edge-method',
    sourceFile: 'supabase/functions/provider-gmail-push/index.ts',
    handler: 'Deno.serve',
    endpoint: 'POST /functions/v1/provider-gmail-push',
    operation: 'manage',
    resource: 'provider-gmail-intake',
    access: 'write',
    sensitivity: 'critical',
    tenantRelevance: 'record-derived',
    proposedPermissionKey: 'external.provider-gmail-push.manage',
    sourceFingerprint: '6d02841bfab871b000375f4b174a96cd125218692fcfba97edea65fa7a3ee146',
    ...gmailSharedMetadata,
  },
];

export const ACTION_CONTRACT = {
  ...BASE_ACTION_CONTRACT,
  contractVersion,
  methodVersion: `${BASE_ACTION_CONTRACT.methodVersion}+provider-service-convergence+provider-gmail-intake+provider-gmail-pubsub+carrier-list-templates`,
  expectedCounts: {
    governable: BASE_ACTION_CONTRACT.expectedCounts.governable + delta.governable + 6 + carrierTemplateDelta.governable,
    edge: BASE_ACTION_CONTRACT.expectedCounts.edge + delta.edge + 6 + carrierTemplateDelta.edge,
    postgres: BASE_ACTION_CONTRACT.expectedCounts.postgres + delta.postgres + carrierTemplateDelta.postgres,
    ratewareApi: BASE_ACTION_CONTRACT.expectedCounts.ratewareApi + delta.ratewareApi + carrierTemplateDelta.ratewareApi,
  },
  reviewedMetadataFingerprints: {
    ...BASE_ACTION_CONTRACT.reviewedMetadataFingerprints,
    ...extension.reviewedMetadataFingerprints,
    ...providerMetadataOverrides,
    ...gmailMetadataFingerprints,
    ...carrierTemplateExtension.reviewedMetadataFingerprints,
  },
  reviewedAuthorizationFingerprints: {
    ...BASE_ACTION_CONTRACT.reviewedAuthorizationFingerprints,
    ...legacyAuthorizationOverrides,
    ...extension.reviewedAuthorizationFingerprints,
    ...gmailAuthorizationFingerprints,
    ...ratewareApiAuthorizationOverrides,
    ...carrierTemplateExtension.reviewedAuthorizationFingerprints,
  },
  surfaces: [
    ...BASE_ACTION_CONTRACT.surfaces.map((entry) => ({
      ...entry,
      contractVersion,
      ...(ratewareApiSourceFingerprintOverrides[entry.canonicalId]
        ? { sourceFingerprint: ratewareApiSourceFingerprintOverrides[entry.canonicalId] }
        : {}),
    })),
    ...providerSurfaces,
    ...gmailSurfaces,
    ...carrierTemplateExtension.surfaces,
  ],
};
