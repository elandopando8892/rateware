import { ACTION_CONTRACT as BASE_ACTION_CONTRACT } from '../supabase/functions/_shared/action-contract.mjs';
import { PROVIDER_SERVICE_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-provider-service.mjs';

const extension = PROVIDER_SERVICE_ACTION_CONTRACT_EXTENSION;
import { OSP_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-osp.mjs';
const ospExtension = OSP_ACTION_CONTRACT_EXTENSION;
const contractVersion = extension.contractVersion;
const delta = extension.expectedCountsDelta;

// Provider Service is hosted inside the authenticated shipper-directory-api runtime.
// Its local dependency changes that function's shared authorization envelope for
// all eight pre-existing actions even though their handler source segments are unchanged.
// Build 30 adds two sanitized, read-only onboarding actions under the same canonical
// Kinde -> workspace -> tenant resolver and does not add a new externally discovered action.
// Refreshed 2026-08-17 for two reviewed changes, neither of which alters authorization:
//   1. listProviderOnboardingWorkspace gained an aggregate fallback so an empty queue page
//      cannot blank the workspace counters.
//   2. Four sanitized read-only actions were added — list_provider_entity_vault,
//      list_provider_onboarding_field_review, list_provider_onboarding_approvals and
//      list_provider_onboarding_delivery — each reading an organization-scoped view that
//      already withholds document bytes, paths, hashes, restricted field values and
//      recipient local parts.
//   3. Three document-review COMMANDS were wired to the same dispatch —
//      claim_provider_entity_document_review, decide_provider_entity_review_field and
//      finalize_provider_entity_document_review. Their logic already existed in
//      _shared/provider-entity-review-commands.ts but no entrypoint imported it, so it
//      was unreachable. The handlers inject the resolved organization and the
//      authenticated reviewer; a caller-supplied organization_id is overwritten, never
//      merged. This is the first write path in this runtime, so unlike (1) and (2) it
//      does change what the function can do — it is registered here deliberately and the
//      commands' own guards (ownership, expected_revision, separation of duties) remain
//      the authorization boundary.
//   4. Five further commands wired through the same table-driven dispatch —
//      promote_provider_entity_review_facts, open/reconcile/cancel_provider_onboarding_case
//      and create_provider_onboarding_release_package. All are internal state
//      transitions with no external side effect. Form assembly and Gmail delivery are
//      deliberately left unwired until a sender allowlist and recipient-domain policy
//      exist, and decideProviderOnboardingReleasePackage stays unwired because it
//      duplicates the canonical approval RPC with cross-revision approval counting.
//   5. The bounded-upload pair — begin_provider_entity_upload and
//      confirm_provider_entity_upload — wired through the same table. These issue a
//      short-lived signed upload URL into the private vault bucket and confirm the
//      object afterwards. The adapter pins actor.type to 'user', so a caller cannot
//      claim to be the system or an integration and bypass the identified-user
//      requirement. No public URL is ever produced by either path.
//   - evaluate_provider_onboarding_readiness, which had no production entry point at
//      all: reconcile takes an evaluation id and cannot compute one, so nothing that
//      runs could produce the input the case workflow requires. It reads this tenant's
//      evidence and writes an evaluation row; it reaches nothing external.
//   - record_provider_onboarding_requirement_waiver / revoke_..., which let an operator
//      accept a specific unmet onboarding requirement on the record. The waiver reaches
//      one new table, provider_onboarding_requirement_waivers, which is service-role
//      only and tenant-scoped like every other Provider Service table. It changes what
//      readiness reports, not who may call anything: a waived evaluation is
//      'complete_with_waivers', a release package must opt in to accept it, and the
//      two-person package approval is untouched.
// Fact promotion additionally classifies a taxpayer identifier from its own value: a
// 12-character RFC is a persona moral and is business identification, a 13-character RFC
// is a persona fisica and embeds that person's date of birth. This narrows what may be
// released rather than widening it, and adds no privilege, table or caller.
// FINAL REFRESH. provider-service.ts has moved to its own function,
// supabase/functions/provider-onboarding-api, so it has LEFT this function's import
// closure. That is why the envelope moves one last time: the eight actions below are
// losing a dependency, not gaining one.
//
// The five refreshes catalogued above happened because every OSP commit changed the
// authorization fingerprint of eight governed Rateware actions it had nothing to do with.
// That is what a governance record looks like on its way to becoming a rubber stamp, and
// it was going to get worse: OSP and Rateware now have different owners committing to the
// same tree. After this refresh an OSP change cannot move these fingerprints at all.
//
// All run under the same canonical Kinde -> workspace -> tenant resolver and add no new
// privilege or caller, and none is externally discovered, so the envelope is refreshed
// deliberately rather than the eight actions being re-reviewed.
const shipperDirectoryEnvelope = '254872c04929e7acd173e69aaea3168cebf51cdba2beea9febcb0696fdaaee1d';
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

// Refreshed 2026-08-17 (Sprint 1): provider-gmail-sync.ts now calls the agent intake
// (provider-agent-intake.ts -> thread resolution, request classification, entity
// resolution). That adds a local dependency to the Gmail runtime and changes its
// shared envelope. The intake writes only proposals and an agent-run audit row under
// the same tenant scope — no new privilege, no new caller, and no outbound action.
// Refreshed 2026-08-19: the deterministic classifier learned the Spanish alta
// phrasings a real carrier thread used, and the envelope bridge now maps the
// resolver vocabulary. Both are intake dependencies, so the Gmail envelope moves;
// no new caller, privilege or external reach.
// Refreshed 2026-08-18. The Gmail sync now hands the agent intake the mailbox and
// the Gmail message id so the intake can record a neutral inbox envelope, and the
// intake imports `provider-inbound-envelope.ts`. The dependency envelope is
// computed per function, not per action, so all four intake-api actions move
// together even though only the sync path changed.
//
// Authorization itself is unchanged: no new caller, no new privilege, no new
// external reach. The push receiver moves for the same reason — it reaches the
// sync — and the OAuth callback, which does not, keeps its envelope.
const gmailAuthorizationFingerprints = {
  'edge.provider-gmail-intake-api.provider_gmail_status': 'b46922ac1ae77c402c3eed089b0805929e9eacb6127f85f43159d5a99833437f',
  'edge.provider-gmail-intake-api.renew_provider_gmail_watch': 'b46922ac1ae77c402c3eed089b0805929e9eacb6127f85f43159d5a99833437f',
  'edge.provider-gmail-intake-api.start_provider_gmail_oauth': 'b46922ac1ae77c402c3eed089b0805929e9eacb6127f85f43159d5a99833437f',
  'edge.provider-gmail-intake-api.sync_provider_gmail_inbox': 'b46922ac1ae77c402c3eed089b0805929e9eacb6127f85f43159d5a99833437f',
  'edge.provider-gmail-intake-api.preview_provider_message_intake': 'b46922ac1ae77c402c3eed089b0805929e9eacb6127f85f43159d5a99833437f',
  'edge.provider-gmail-oauth-callback.complete_provider_gmail_oauth_callback': '61a4d760bc3bc7157e0abcebf08818cd4e84841f6ec35f7c406475e28df53a3b',
  'edge.provider-gmail-push.receive_provider_gmail_push': '080e54f3e81fda701069415f40c463fe3ad8c4022829e00a27e439d62de75676',
};

// Surfaces recovered from production on 2026-08-18. Both functions were deployed
// to rateware-prod without a source commit, so they had never been governed. They
// are declared here at the state actually running in production.
const recoveredAuthorizationFingerprints = {
  'edge.provider-document-canary-processor.provider_document_canary_gone': 'e442680a43f5180ecb6d89212e28d060746dd6ab3b999eb641fbf06a9cd1700a',
  'edge.provider-release-package-api.get_provider_release_manifest': 'cf1d74974a46d97c26ca4418943e5733a0845bda5fde3f2e1dd2a17c3c8bd2af',
  'edge.provider-release-package-api.get_provider_release_download_url': 'cf1d74974a46d97c26ca4418943e5733a0845bda5fde3f2e1dd2a17c3c8bd2af',
  // The Entity Vault scan/classify/promote worker (VirusTotal Private Scanning).
  'edge.provider-entity-document-processor.process_provider_entity_documents': '080cf4e3a79d125652c25b594323d555f781b0127e539724dd929e409c5d3555',
};

const recoveredMetadataFingerprints = {
  'edge.provider-release-package-api.get_provider_release_manifest': '53ed919755f4be55e7525aad1de25be4ad2170862e4329f2cd35ad352109dd8f',
  'edge.provider-release-package-api.get_provider_release_download_url': 'd0f283235e8fcec38f9f3a4c05905bed19c317d653f59ab587d37bc0d56170b9',
  'edge.provider-document-canary-processor.provider_document_canary_gone': '6b84f34c73e697ef5d226e2552d67c6c150854463f3df0f0a6499f834c1c9748',
  'edge.provider-entity-document-processor.process_provider_entity_documents': 'ca92c6b90bb72d769d59426a7b0c4a96dafa4cdc41c7778a2103749256f46d66',
};


// The Onboarding Service Provider runtime, registered on the move out of
// shipper-directory-api. These 24 actions had never been governed: they dispatched
// through isProviderServiceAction(body.action), a call the extractor cannot read as a
// table, so OSP's thirteen write commands carried no governance while changing the
// fingerprints of the eight Rateware actions hosted beside them.
//
// Registered fresh rather than renamed. renameIssues() only fires for ids that vanish,
// and these ids never existed, so this is the one moment the move is free.








const recoveredSharedMetadata = {
  businessModule: 'Provider Service',
  functionalOwner: 'Provider Service',
  decisionStatus: 'explicitly_allowed',
  lifecycle: 'active',
  replacementAction: null,
  analysisCoverage: 'direct',
  coverageSignals: ['direct', 'external_dependency'],
  rpcSignature: null,
  contractVersion,
};

const recoveredSurfaces = [
  {
    canonicalId: 'edge.provider-release-package-api.get_provider_release_manifest',
    actionName: 'get_provider_release_manifest',
    sourceKind: 'edge-method',
    sourceFile: 'supabase/functions/provider-release-package-api/index.ts',
    handler: 'Deno.serve',
    endpoint: 'POST /functions/v1/provider-release-package-api action=get_manifest',
    operation: 'read',
    resource: 'provider-onboarding-release-package',
    access: 'read',
    exposure: 'human',
    sensitivity: 'critical',
    tenantRelevance: 'record-derived',
    proposedPermissionKey: 'provider.release-package.read',
    sourceFingerprint: 'ab39a6bcfdde50ae76f6ce98d8a7672c827f2125162da52c6ff914cb2503f52b',
    ...recoveredSharedMetadata,
  },
  {
    canonicalId: 'edge.provider-release-package-api.get_provider_release_download_url',
    actionName: 'get_provider_release_download_url',
    sourceKind: 'edge-method',
    sourceFile: 'supabase/functions/provider-release-package-api/index.ts',
    handler: 'Deno.serve',
    endpoint: 'POST /functions/v1/provider-release-package-api action=get_download_url',
    operation: 'read',
    resource: 'provider-onboarding-release-package',
    access: 'read',
    exposure: 'human',
    sensitivity: 'critical',
    tenantRelevance: 'record-derived',
    proposedPermissionKey: 'provider.release-package.download',
    sourceFingerprint: 'ab39a6bcfdde50ae76f6ce98d8a7672c827f2125162da52c6ff914cb2503f52b',
    ...recoveredSharedMetadata,
  },
  {
    canonicalId: 'edge.provider-document-canary-processor.provider_document_canary_gone',
    actionName: 'provider_document_canary_gone',
    sourceKind: 'edge-method',
    sourceFile: 'supabase/functions/provider-document-canary-processor/index.ts',
    handler: 'Deno.serve',
    endpoint: 'POST /functions/v1/provider-document-canary-processor',
    operation: 'read',
    resource: 'provider-entity-document-ingestion',
    // The tombstone reads nothing and writes nothing; it answers a constant 410.
    // `read` is the least-privilege value the contract's vocabulary allows, and
    // the surface is platform-scoped because it touches no tenant record.
    access: 'read',
    exposure: 'internal/service-role',
    sensitivity: 'low',
    tenantRelevance: 'platform-scoped',
    proposedPermissionKey: 'provider.document-canary.read',
    sourceFingerprint: '60688265ba2148b672d0b23361f832f42c4220a3dc57d91ebd546adfbf7db8c6',
    ...recoveredSharedMetadata,
    // An internal/service-role surface must be internal_only; this overrides the
    // shared default deliberately, after the spread.
    decisionStatus: 'internal_only',
  },
  {
    canonicalId: 'edge.provider-entity-document-processor.process_provider_entity_documents',
    actionName: 'process_provider_entity_documents',
    sourceKind: 'edge-method',
    sourceFile: 'supabase/functions/provider-entity-document-processor/index.ts',
    handler: 'Deno.serve',
    endpoint: 'POST /functions/v1/provider-entity-document-processor service-role',
    operation: 'manage',
    resource: 'provider-entity-document-ingestion',
    access: 'write',
    exposure: 'internal/service-role',
    sensitivity: 'critical',
    tenantRelevance: 'record-derived',
    proposedPermissionKey: 'provider.entity-document-processor.manage',
    sourceFingerprint: '7f9029a6677ec8ba29b27a6efbe2d370c193496d311089cf4d721848e6593f15',
    ...recoveredSharedMetadata,
    decisionStatus: 'internal_only',
    // It composes the shared processor and scanner modules, so coverage is
    // shared-observed, not the direct default the recovered surfaces carry.
    analysisCoverage: 'shared-observed',
    coverageSignals: ['shared_dependency_observed', 'external_dependency'],
  },
];

const gmailMetadataFingerprints = {
  'edge.provider-gmail-intake-api.preview_provider_message_intake': '1d99b228e275856af6a8ac9b257f6dfdaebe19962630194ebe078b270e1c80b0',
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
    canonicalId: 'edge.provider-gmail-intake-api.preview_provider_message_intake',
    actionName: 'preview_provider_message_intake',
    sourceKind: 'edge-selector',
    sourceFile: 'supabase/functions/provider-gmail-intake-api/index.ts',
    handler: 'previewIntake',
    endpoint: 'POST /functions/v1/provider-gmail-intake-api body.action',
    operation: 'read',
    resource: 'provider-communications',
    // Writes nothing: no row, no case, no provider link, and neither the subject
    // nor the body is stored. It returns the proposal and its audit fields only.
    access: 'read',
    sensitivity: 'high',
    tenantRelevance: 'tenant-scoped',
    proposedPermissionKey: 'provider.gmail.intake.preview',
    sourceFingerprint: '1fae1d83ecbf6644a01df8f6952b7af191bebf853a977abe01a8469533a864a9',
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
  methodVersion: `${BASE_ACTION_CONTRACT.methodVersion}+provider-service-convergence+provider-gmail-intake+provider-gmail-pubsub`,
  expectedCounts: {
    // +6 Gmail intake/pubsub, +3 recovered from production 2026-08-18
    // (2 release-package actions, 1 canary tombstone), +1 vault document processor.
    governable: BASE_ACTION_CONTRACT.expectedCounts.governable + delta.governable + 6 + 3 + 1 + 1,
    edge: BASE_ACTION_CONTRACT.expectedCounts.edge + delta.edge + 6 + 3 + 1 + 1,
    postgres: BASE_ACTION_CONTRACT.expectedCounts.postgres + delta.postgres,
    ratewareApi: BASE_ACTION_CONTRACT.expectedCounts.ratewareApi + delta.ratewareApi,
  },
  reviewedMetadataFingerprints: {
    ...BASE_ACTION_CONTRACT.reviewedMetadataFingerprints,
    ...extension.reviewedMetadataFingerprints,
    ...providerMetadataOverrides,
    ...gmailMetadataFingerprints,
    ...recoveredMetadataFingerprints,
    ...ospExtension.reviewedMetadataFingerprints,
  },
  reviewedAuthorizationFingerprints: {
    ...BASE_ACTION_CONTRACT.reviewedAuthorizationFingerprints,
    ...legacyAuthorizationOverrides,
    ...extension.reviewedAuthorizationFingerprints,
    ...gmailAuthorizationFingerprints,
    ...recoveredAuthorizationFingerprints,
    ...ospExtension.reviewedAuthorizationFingerprints,
  },
  surfaces: [
    ...BASE_ACTION_CONTRACT.surfaces.map((entry) => ({ ...entry, contractVersion })),
    ...providerSurfaces,
    ...gmailSurfaces,
    ...recoveredSurfaces,
    ...ospExtension.surfaces,
  ],
};
