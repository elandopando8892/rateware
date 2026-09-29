import { ACTION_CONTRACT as BASE_ACTION_CONTRACT } from '../supabase/functions/_shared/action-contract.mjs';
import { CARRIER_LIST_TEMPLATE_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-carrier-list-templates.mjs';
import { PROVIDER_SERVICE_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-provider-service.mjs';
import { RFX_INVITATION_REVIEW_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-rfx-invitation-reviews.mjs';
import { RFX_ATOMIC_AWARD_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-rfx-award-atomic.mjs';
import { WEBSITE_INTAKE_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-website-intake.mjs';
import { QUOTEDESK_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-quotedesk.mjs';
import { US_DIESEL_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-us-diesel.mjs';
import { FCM_SYNC_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-fcm-sync.mjs';
import { OPS_WATCH_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-ops-watch.mjs';
import { TEAM_MEMBERSHIP_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-team-membership.mjs';
import { OBJECT_STORAGE_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-object-storage.mjs';
import { CUSTOMER_RFI_LOOKUPS_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-customer-rfi-lookups.mjs';
import { RFX_LANE_NO_AWARD_ACTION_CONTRACT_EXTENSION } from '../supabase/functions/_shared/action-contract-rfx-lane-no-award.mjs';

const extension = PROVIDER_SERVICE_ACTION_CONTRACT_EXTENSION;
const carrierTemplateExtension = CARRIER_LIST_TEMPLATE_ACTION_CONTRACT_EXTENSION;
const rfxInvitationReviewExtension = RFX_INVITATION_REVIEW_ACTION_CONTRACT_EXTENSION;
const rfxAtomicAwardExtension = RFX_ATOMIC_AWARD_ACTION_CONTRACT_EXTENSION;
const websiteIntakeExtension = WEBSITE_INTAKE_ACTION_CONTRACT_EXTENSION;
const quotedeskExtension = QUOTEDESK_ACTION_CONTRACT_EXTENSION;
const usDieselExtension = US_DIESEL_ACTION_CONTRACT_EXTENSION;
const fcmSyncExtension = FCM_SYNC_ACTION_CONTRACT_EXTENSION;
const opsWatchExtension = OPS_WATCH_ACTION_CONTRACT_EXTENSION;
const teamMembershipExtension = TEAM_MEMBERSHIP_ACTION_CONTRACT_EXTENSION;
const objectStorageExtension = OBJECT_STORAGE_ACTION_CONTRACT_EXTENSION;
const customerRfiLookupsExtension = CUSTOMER_RFI_LOOKUPS_ACTION_CONTRACT_EXTENSION;
const rfxLaneNoAwardExtension = RFX_LANE_NO_AWARD_ACTION_CONTRACT_EXTENSION;
const contractVersion = extension.contractVersion;
const delta = extension.expectedCountsDelta;
const carrierTemplateDelta = carrierTemplateExtension.expectedCountsDelta;
const rfxInvitationReviewDelta = rfxInvitationReviewExtension.expectedCountsDelta;
// Token possession scopes this no-write projection to a single carrier book.
// It does not grant the carrier the mutating Bid Room actions.
const rfxBidPeekSurface = {
  ...BASE_ACTION_CONTRACT.surfaces.find((entry) => entry.canonicalId === 'edge.rfx-bid-api.get_invitation'),
  contractVersion,
  canonicalId: 'edge.rfx-bid-api.peek_invitation',
  actionName: 'peek_invitation',
  sourceFingerprint: 'f9007bedda3102f9d9890b7ebfb6bffa8596a27b04414ab748467326d16e1261',
  decisionStatus: 'pending_human_approval',
  notes: 'No-write, token-scoped carrier invitation projection for Loads Preview. Production activation remains pending human approval.',
};

// Provider Service is hosted inside the authenticated shipper-directory-api runtime.
// Its local dependency changes that function's shared authorization envelope for
// all eight pre-existing actions even though their handler source segments are unchanged.
// Build 30 adds two sanitized, read-only onboarding actions under the same canonical
// Kinde -> workspace -> tenant resolver and does not add a new externally discovered action.
const shipperDirectoryEnvelope = '28123057c8839fca6b50d71a34391eb6b24c994946f003040a78ef3626c77bac';
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
// P3 implementation-ready concurrency guard adds a reviewed local dependency
// to the shared rateware-api authorization envelope without changing tenant or
// permission semantics.
const ratewareApiEnvelope = 'bcc403457b3f6486794748fecf79c69b352470272ceb8453ce50000eacf5d1ee';
const ratewareApiAuthorizationOverrides = Object.fromEntries([
  ...BASE_ACTION_CONTRACT.surfaces,
  ...carrierTemplateExtension.surfaces,
  ...rfxInvitationReviewExtension.surfaces,
].filter((entry) => entry.canonicalId.startsWith('edge.rateware-api.'))
  .map((entry) => [entry.canonicalId, ratewareApiEnvelope]));

const supabaseAuthAuthorizationOverrides = {
  'edge.create-raw-upload.create_raw_upload': '52420761826b476fffd671d7bce3eaa6a6994a5388eaf6ca6e2dbe80652ac694',
  'edge.interpret-upload.interpret_upload': 'c97cf6d7a44a5815d0297d00ee27a2dbd06c6217647997421859c18eac271264',
  'edge.sync-rateware-catalog.sync_rateware_catalog': 'b3acb75e8fad35c02feca43e27d704fb7eb5ac3c8fb72d75287ccbc698a1db1c',
};

// Removing the unused legacy verifier from the shared response helper changes
// dependency envelopes for CORS-only consumers without changing their handlers.
const corsOnlyAuthorizationEnvelopes = {
  'edge.carrier-profile-api.': '4e1755252e58e7245b2078488ded67fb6f6241b221007147462887b427afa9d6',
  'edge.gmail-oauth-callback.': '3584f61979a5ad5605e49b243e33fc9769f314808a5ae6b1f866154088b59b29',
  'edge.google-chat-app.': 'cac11d8a48e151559ddd4145dd9a7f8a933caaa6305667083544f35175515a05',
  'edge.ratebook-carrier-api.': 'ce08ec32d9d78aeef3f0f745240d84c5f2da51e14e2862e8bcc8096aeba37907',
  'edge.rfx-bid-api.': 'e0dfcdf045b4043bc40a95eaae8e786539a3f7c15d348471445929a64ee5d0e8',
  'edge.shipper-profile-api.': 'a6920f9f1d0daf40018b3f4390578b051b504fdab9d377e4a52bab3e98f9b0dd',
  'edge.sync-banxico-fx.': '0cd59df491252504b52db16b3d6a2aff738bfcc6cd9f3a07ec87b43c87fc85a4',
  'edge.whatsapp-webhook.': 'd0e3629ff9357c3035cd753c19ed4e8bbb04c954ab642d5539a6cbc161c7c403',
};
const corsOnlyAuthorizationOverrides = Object.fromEntries(
  BASE_ACTION_CONTRACT.surfaces.flatMap((entry) => {
    const match = Object.entries(corsOnlyAuthorizationEnvelopes)
      .find(([prefix]) => entry.canonicalId.startsWith(prefix));
    return match ? [[entry.canonicalId, match[1]]] : [];
  })
);

// Adding the canonical MARKSMAN Rates origin changes the shared response/CORS
// dependency envelope for every Edge Function that imports that helper. These
// fingerprints were reviewed from the complete discovered graph after the
// allowlist-only change; handler permissions and tenant scopes are unchanged.
// Re-signed 2026-09-25 after reviewing everything that drifted since: #113
// (production's kinde.ts CORS previews and auth.ts app_metadata permissions),
// #137 (stricter reviewed source-file access), the shared Google Chat relay
// (#119/#120), carrier-profile #114/#117/#119, rfx-bid #112/#124, SheetJS
// 0.20.3 and a constant Oracle config error. None weakens authentication,
// tenant or owner scoping.
// 2026-09-25 (later): the Chat relay shows people's text as text (no mentions
// or links) and carriers can't write the platform's profile_data keys.
// 2026-09-25 (evening): whatsapp-webhook links a reply to the "+52..." number it
// was sent to; the verify token and signature checks are unchanged.
// 2026-09-26: rfx-bid-api adds two read-only lookups behind the customer RFI
// link (places and freight lists); its existing handlers are unchanged.
// 2026-09-27: rateware-api's Bid Room launch copies the project's Shipper id
// onto the new event (a column it already writes elsewhere); no check changes.
// 2026-09-28: taking approved rates out of the rate base (archiving, deleting
// or reopening them, directly, through their upload or by reading the upload
// again) and archiving or restoring a shipper became an Administrador's.
// rateware-api, rateware-storage-api and interpret-upload read the rows first
// and refuse an operator (_shared/team-roles.ts adminOnlyDenial). Ownership
// and tenant checks are unchanged.
// 2026-09-28 (later): shipper-profile-api returns a site's contact in
// get_profile, which submit_profile already writes back; the token still
// scopes every read and write to its own shipper.
// 2026-09-28 (chat): rfx-bid-api answers a carrier's chat through
// _shared/carrier-chat-view.mjs, which keeps what the carrier's page shows and
// leaves out the team's notes, assignment, addresses and workspace key, other
// carriers' emails, Google Chat ids and the lane's internal fields. The
// invitation token still scopes every read and write.
// 2026-09-29: merging duplicate carriers (which deletes the duplicate) and
// archiving a carrier became an Administrador's in _shared/team-roles.ts; the
// merge preview became a read. rateware-api also refuses an operator when a
// CRM template or an import would archive a carrier. Ownership and tenant
// checks are unchanged. Later that day, taking a carrier out of the archive
// became an Administrador's too; the handlers check it after reading the
// rows. And list_rfx_invitation_wave_reviews, which the contract already
// declares a read, joined the role reads, so every role can see the reviews.
// 2026-09-29 (close): declaring a lane void (set_rfx_lane_no_award, its own
// extension) became an Administrador's decision like awarding, and
// quotedesk-api's estimate_lane_fcm, which the contract already declares a
// read, joined the role reads. Ownership and tenant checks are unchanged.
// 2026-09-29 (start date, void lanes): rateware-api keeps the event's
// operation start date; rfx-bid-api shows it to carriers, keeps void lanes of
// events still taking bids out of the carrier's book and the public board,
// refuses offers on them, and never returns the lane's void reason or who
// declared it. The invitation token still scopes every read and write.
// 2026-09-29 (carrier payload): the carrier's own invitation carries its lane
// and event in the same public shape as its book, so the target rate, the
// incumbent carrier, the event's notes and the owning account stay internal;
// the support assistant is no longer told the target. Access is unchanged.
// 2026-09-29 (sent): list_rfx_detail tells, per invitation, when its message
// really went out (the latest outreach message the provider accepted, bounced
// and failed ones left out), read from the owner's own messages of the event.
const brandedDomainAuthorizationEnvelopes = {
  'edge.carrier-profile-api.': 'b03bbde80ff4b7f55be1d9dbf6aeaee0e29b942b59606a2ff51cab9407451dd4',
  'edge.create-raw-upload.': '47344307ceef4b051008850e8211fad1e395c7fd5830e3a3f011a10d5a36ccf3',
  'edge.gmail-oauth-callback.': '9cd3a3329bdb82d139b988dc7503fc3676b744157bd9a1063ce579fa4c8b178c',
  'edge.google-chat-app.': '0d81b2db1ca1d0442814d2e07264c967b1a1999a70be60bd1ed641fbe675475b',
  'edge.interpret-upload.': '2667890f3b3fffc9b38f0e8cd2ff52346db10baa22df08d517259b23d76ce1c8',
  'edge.provider-gmail-intake-api.': '51f613ef43bb666a2bbe81fd09ab99af18315677a6210119bc105bafc7f5f9b6',
  'edge.provider-gmail-oauth-callback.': 'cbecbbb73b557f7cec24f2ac30e5ee39fa5d6567422d37490a8d9ba04a2cdc9a',
  'edge.provider-gmail-push.': '2b47e44194a6ae218af455b227f5bce2a21dd4ff48690e46c67d9cd9b6bd3c2f',
  'edge.ratebook-carrier-api.': '10a589d0428b43071c325bd8c63c58d1f1f43636f91a04a5a3a0753d6a201d84',
  'edge.rateware-api.': 'afc4e5e582308c37a3d73fad40a148bdfb4e1304a4e35377de99bdbb63638fc0',
  // Reviewed after merging the no-write invitation peek with the stricter
  // Google Chat conversation isolation in main. The peek now includes
  // same-vendor encrypted-token rows without decrypting or exposing tokens;
  // the ordinary invitation path still hydrates tokens for quoting.
  'edge.rfx-bid-api.': '86cccc352754a79b77285f332c85ffe99b81bba3c1131f8106661abc993fe050',
  'edge.shipper-directory-api.': '529b561a078707872c24b999e1ed60c61ad2b024fcbfbdc4b9d3f121dca942cf',
  'edge.shipper-profile-api.': 'f1a6315de6fa26940c274745a944f93577a7179c7465fc015f00a4fbd90d762e',
  'edge.sync-banxico-fx.': '0bb53f48177955f59c0fbb2747094883d6680455900dab99c4f87d92490934fc',
  'edge.sync-rateware-catalog.': '3d0999b983698fe5157ad223da8772130d6c769c9e55e06ebb4efa8c92f1bd95',
  'edge.whatsapp-webhook.': '8b8236be223a75d8da2d109ed9a28b7ea6f4d6031f458051d0c5c49b203e5da1',
};
// These eight pre-existing actions share reviewed code segments with the newly
// added template dispatch and handler factory. Their behavior is unchanged, but
// the scanner intentionally fingerprints the complete reachable action segment.
const ratewareApiSourceFingerprintOverrides = {
  'edge.rateware-api.award_rfx_lane_vendor': '80b222f9225cf992b19bcc18ca232ae3dff2a4cdfc88b280bd615d517373ba34',
  'edge.rateware-api.create_rfx_award_package': '378f73423f4726da85dfc4c453be98f50d3f86c7da6a9f3af9a68267441fe4d6',
  'edge.rateware-api.create_vendor_segment': '8e6a444366bfa108430e02fdf8dffbbf11a0ab0e4e102d4687f6e589f809aa69',
  'edge.rateware-api.delete_vendor_segment': '792ce2b10566c1be41064ef07f5e818088fb1f16596433d88fdb7c0fbec972d2',
  'edge.rateware-api.generate_outreach_drafts': 'a94ce49aabdbfa2a891518d7972a3001b4f74e7aaeb0bfbd0eac85a3043592c4',
  'edge.rateware-api.list_vendor_segments': '79d6ff15b7b7a0bcbf8e580baaed1b11575d56c38cc4034fb9b80a8891814128',
  'edge.rateware-api.list_rfx_detail': '8321e92a1551ba11ceb19dfea535c61e78ab0121bbcb891b6d8852912fe8eb0c',
  'edge.rateware-api.list_vendors': 'd245449ecef4d230b05aa58a58014fe432538c98aa303c8f6d23235806ba3c38',
  'edge.rateware-api.preview_outreach_audience': '3743b26bac151fc0e4985e7706decd95b79b7db291c56adaaf7f16bd356d60bd',
  'edge.rateware-api.send_bid_room_carrier_message': '3a8bc0f06e4f577effffd6e35350e73925fd9153db71a25266b35f40b81b7fe0',
  'edge.rateware-api.shortlist_rfx_lane_vendors': '054559e7a40ff4c2946a3a6981ad70e5cd69e49bdf3fd9016072a559dbab4030',
  'edge.rateware-api.update_vendor_segment': 'd73978185d8637b0b72028db2b30b7f5d3800a42f3d58949d25d2f4d2d978976',
};

// Oracle storage integration (2026-09-24): main now carries the create-raw-upload
// and interpret-upload running in production since 2026-09-08 (plus SheetJS
// 0.20.3): files are written and read through _shared/object-storage.ts
// (Supabase Storage or Oracle Object Storage) behind reviewed source-file access
// (_shared/source-file-access.ts). Ownership checks are unchanged.
const supabaseAuthSourceFingerprintOverrides = {
  'edge.create-raw-upload.create_raw_upload': 'aa374df97b0680a4df07507bdf5f7028fc1c37ac6cf72643e577001ff4d147fe',
  'edge.interpret-upload.interpret_upload': 'fda251de5baaa8d0111a00cc9602f07d8511d29fcf373af9bb07645739e866d8',
  'edge.sync-rateware-catalog.sync_rateware_catalog': '207fd12f17afbbd5e4dd58a0e914ad939aab033816bf8a5a64b461cf46aa8c83',
};

// Carrier profile fixes (#114 internal notes stay internal, #117 support log,
// #119 follow-ups reach the team's Chat thread): the carrier's token still scopes
// every read and write to its own vendor row and tickets.
const carrierProfileSourceFingerprintOverrides = {
  'edge.carrier-profile-api.add_ticket_followup': 'fbc3fcfad29bcde5dfe01ce678a73cff0f24a14e9fea14dc7f622d3988665710',
  'edge.carrier-profile-api.get_profile': '8fc31edb80ccdcdc9dccd9990ffca37594ee93bf247344009a1002e942e47aea',
  'edge.carrier-profile-api.submit_profile': 'e7019872565e1d24acc5764c6a6f7e3efd84d63063b51577ce51bb938445a204',
};

// Meta reports a reply's sender as bare digits while outreach stores "+52...";
// the webhook now matches every spelling of that phone. Routing by phone id and
// WABA, the verify token and the X-Hub-Signature-256 check are unchanged.
const whatsappWebhookSourceFingerprintOverrides = {
  'edge.whatsapp-webhook.ingest_webhook': '9a2a759be8690ead5e9caeddee053b44811e473ca337fd0a1689de5d1e0aa56e',
  'edge.whatsapp-webhook.verify_webhook': '9a2a759be8690ead5e9caeddee053b44811e473ca337fd0a1689de5d1e0aa56e',
};

// These reviewed rfx-bid handlers contain multiline literals. Normalizing CRLF
// before lexical fingerprinting makes their identities stable across Windows
// and Unix checkouts without changing executable behavior.
const portableRfxBidSourceFingerprintOverrides = {
  'edge.rfx-bid-api.decline_invitation': '6ec9d89d98ca2bbcceed7b697fa1acd22929d29d4519c4f31e5ffc7d72fd28c0',
  'edge.rfx-bid-api.get_invitation': 'f9007bedda3102f9d9890b7ebfb6bffa8596a27b04414ab748467326d16e1261',
  // The board leaves void lanes out and shows the operation start date (2026-09-29).
  'edge.rfx-bid-api.public_bid_room_board': 'c4e8e67793bd866168dfc4efe9226aef03907876d58920e8d17776c48743cf49',
  'edge.rfx-bid-api.public_bid_room_find_invitations': '789fd150c4ca512fa07374cc0eab1d9b53081861a3c2425691fc5c63300237b8',
  'edge.rfx-bid-api.public_bid_room_request_invite': '1d6b135fde12db3a88cc64efd2e5c5c39ce1dafbc3c79eb94cb0216425f40907',
  'edge.rfx-bid-api.submit_bid': 'd60402a1c008a8b884b84c6436010d55e3fcac0457fff6cf0c592b51547b4934',
  'edge.rfx-bid-api.withdraw_bid': '6ec9d89d98ca2bbcceed7b697fa1acd22929d29d4519c4f31e5ffc7d72fd28c0',
};

// For files kept outside Supabase Storage, rateware-api forwards
// get_upload_source_url and remove_upload to rateware-storage-api with the
// caller's own bearer (_shared/source-download-routing.mjs); Supabase-stored
// files keep the in-process path. No service credential is substituted.
const oracleStorageSurfaceOverrides = {
  'edge.rateware-api.get_upload_source_url': { sourceFingerprint: '35ec7b2a0469f28567702178cf05fcb0ead07d9ef5aea2a0b2d05aa619bf4830' },
  'edge.rateware-api.remove_upload': { sourceFingerprint: '7916e001cf9f76a3f3a18dfa57687ea1de9104c9038654adbf97e9e827ec63c9' },
};
// _shared/auth.ts now also returns email_confirmed and rateware_organization_id,
// read only by the reviewed source-file access check, and fcm.mjs reads free-text
// equipment as the FCM's units. quotedesk-api's tenant scoping and permissions
// are unchanged.
// The handlers that now read the rows they touch and refuse an operator
// before writing when that would take approved rates out of the rate base or
// archive or restore a shipper (2026-09-28), or archive or restore a carrier
// (2026-09-29). Nothing else in them changed.
const rateBaseAdminSourceFingerprintOverrides = {
  'edge.rateware-api.apply_vendor_template_updates': '1736e4e393ea499edc607e05b73c03c1cfb05a61344f7ab0bedef270dcadf3b0',
  'edge.rateware-api.archive_staging': 'ee15cc468134c653aa7cc137ad282817c48b3d1671dc913214776a06cfc5c2ed',
  'edge.rateware-api.bulk_update_rate_rows_by_filter': 'd5da4dbd5a3552eb72a925c5e25e52369b089b5a8d525ebf0267f18e22739b78',
  'edge.rateware-api.bulk_update_vendors': '059619d359cd444dd5ec7f3928dc353ac99d965989062939dc0499e4a4e017dc',
  'edge.rateware-api.bulk_update_staging': '0dd135b2f38e45a1de0c1e07d46d1c2f554f24bcefceedd870981779af13e86e',
  'edge.rateware-api.import_shipper_crm_workbook': 'd2c6779661af8a5b86480788555ed405e7446d3c8ac50278c860bb2ab3769134',
  'edge.rateware-api.import_shippers': 'c0036b4d417a877be000a1e1162c969c1d79cbe6fef8bd2aadd0d00336ced9fd',
  'edge.rateware-api.import_vendors': 'ea7082107340654ba955137f17a3634646611a85e86f8639d2c58da659e24e09',
  'edge.rateware-api.import_vendors_google_sheet': '8fa6cba341b0c363db72d1819eb31e8baf03815eca8db1719237c5a898864aec',
  'edge.rateware-api.remove_staging': '66725240f06dff9331ea193c9e1a6063f3efa9eefcf8ab2efc10c1b591cbb6f5',
  'edge.rateware-api.update_shipper': '79f16ecad98739a920f35e5d7206b7585ee7a6a18c5688d32b553bc42c9c6a87',
  'edge.rateware-api.update_staging': '22a302e2ff4f73213c0a419b960cdf16bde43ceb0195597ce5fc039ae63920e7',
  'edge.rateware-api.update_vendor': 'f8493125dbf55ae56680ae7933e02c07385f3a55d149ab18a658dafcc3c5fd88',
};

// The carrier chat handlers answer through the carrier chat view (2026-09-28),
// and the listing keeps out Google Chat messages from other conversations.
const carrierChatSourceFingerprintOverrides = {
  'edge.rfx-bid-api.list_bid_room_chat': '97d7adc27a3440b4d1e13fd6610500787221267e000f3b6c787ba76582844db5',
  'edge.rfx-bid-api.post_bid_room_chat_message': '459d7a128900a4a7a0f43f14b34af543064304095b35970bc02a4bae905aad33',
};

const quotedeskAuthEnvelope = 'cd1073603c3af9c103faf96d3d0dfdd2757e2ccb463827b09b58fb2455c46375';

const supabaseAuthMetadataOverrides = {
  'edge.google-chat-app.handle_chat_event': 'fd759bead6f0bfed76d9f70c962399ba7d815ef30f7a85491d68c4d5b088accf',
  'edge.google-chat-app.health': 'f9872ecb54dc79b021298aacc207d6e2eeee956f4dba34d97981b3b354394060',
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
  'edge.provider-gmail-intake-api.provider_gmail_status': 'e44eb7eafa4a31050af94fbc732896d5f37bdbcda99019ed9893f66d27b0387f',
  'edge.provider-gmail-intake-api.renew_provider_gmail_watch': 'e44eb7eafa4a31050af94fbc732896d5f37bdbcda99019ed9893f66d27b0387f',
  'edge.provider-gmail-intake-api.start_provider_gmail_oauth': 'e44eb7eafa4a31050af94fbc732896d5f37bdbcda99019ed9893f66d27b0387f',
  'edge.provider-gmail-intake-api.sync_provider_gmail_inbox': 'e44eb7eafa4a31050af94fbc732896d5f37bdbcda99019ed9893f66d27b0387f',
  'edge.provider-gmail-oauth-callback.complete_provider_gmail_oauth_callback': 'cd8694e615f2754770c93f510d6abb3330b6b7e9c02b4971d9e1ce2b007c6fa7',
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

const brandedDomainAuthorizationOverrides = Object.fromEntries(
  [
    ...BASE_ACTION_CONTRACT.surfaces,
    ...extension.surfaces,
    ...providerSurfaces,
    ...gmailSurfaces,
    ...carrierTemplateExtension.surfaces,
    ...rfxInvitationReviewExtension.surfaces,
    ...rfxAtomicAwardExtension.surfaces,
    ...customerRfiLookupsExtension.surfaces,
    ...rfxLaneNoAwardExtension.surfaces,
  ].flatMap((entry) => {
    const match = Object.entries(brandedDomainAuthorizationEnvelopes)
      .find(([prefix]) => entry.canonicalId.startsWith(prefix));
    return match ? [[entry.canonicalId, match[1]]] : [];
  })
);

export const ACTION_CONTRACT = {
  ...BASE_ACTION_CONTRACT,
  contractVersion,
  methodVersion: `${BASE_ACTION_CONTRACT.methodVersion}+provider-service-convergence+provider-gmail-intake+provider-gmail-pubsub+carrier-list-templates+rfx-invitation-reviews+rfx-atomic-award+website-intake+quotedesk+us-diesel+rfx-lane-no-award`,
  expectedCounts: {
    governable: BASE_ACTION_CONTRACT.expectedCounts.governable + delta.governable + 6 + carrierTemplateDelta.governable + rfxInvitationReviewDelta.governable + rfxAtomicAwardExtension.expectedCountsDelta.governable + websiteIntakeExtension.expectedCountsDelta.governable + quotedeskExtension.expectedCountsDelta.governable + usDieselExtension.expectedCountsDelta.governable + fcmSyncExtension.expectedCountsDelta.governable + opsWatchExtension.expectedCountsDelta.governable + teamMembershipExtension.expectedCountsDelta.governable + objectStorageExtension.expectedCountsDelta.governable + customerRfiLookupsExtension.expectedCountsDelta.governable + rfxLaneNoAwardExtension.expectedCountsDelta.governable + 1,
    edge: BASE_ACTION_CONTRACT.expectedCounts.edge + delta.edge + 6 + carrierTemplateDelta.edge + rfxInvitationReviewDelta.edge + websiteIntakeExtension.expectedCountsDelta.edge + quotedeskExtension.expectedCountsDelta.edge + usDieselExtension.expectedCountsDelta.edge + fcmSyncExtension.expectedCountsDelta.edge + opsWatchExtension.expectedCountsDelta.edge + objectStorageExtension.expectedCountsDelta.edge + customerRfiLookupsExtension.expectedCountsDelta.edge + rfxLaneNoAwardExtension.expectedCountsDelta.edge + 1,
    postgres: BASE_ACTION_CONTRACT.expectedCounts.postgres + delta.postgres + carrierTemplateDelta.postgres + rfxAtomicAwardExtension.expectedCountsDelta.postgres + websiteIntakeExtension.expectedCountsDelta.postgres + quotedeskExtension.expectedCountsDelta.postgres + teamMembershipExtension.expectedCountsDelta.postgres,
    ratewareApi: BASE_ACTION_CONTRACT.expectedCounts.ratewareApi + delta.ratewareApi + carrierTemplateDelta.ratewareApi + rfxInvitationReviewDelta.ratewareApi + rfxLaneNoAwardExtension.expectedCountsDelta.ratewareApi,
  },
  reviewedMetadataFingerprints: {
    ...BASE_ACTION_CONTRACT.reviewedMetadataFingerprints,
    'edge.rfx-bid-api.peek_invitation': '24fa4f2496a0b577a10bdb6e691c617ddc9dbbbbae8a7ad79d8a7def7b81cfca',
    ...extension.reviewedMetadataFingerprints,
    ...providerMetadataOverrides,
    ...gmailMetadataFingerprints,
    ...carrierTemplateExtension.reviewedMetadataFingerprints,
    ...rfxInvitationReviewExtension.reviewedMetadataFingerprints,
    ...rfxAtomicAwardExtension.reviewedMetadataFingerprints,
    ...websiteIntakeExtension.reviewedMetadataFingerprints,
    ...quotedeskExtension.reviewedMetadataFingerprints,
    ...usDieselExtension.reviewedMetadataFingerprints,
    ...fcmSyncExtension.reviewedMetadataFingerprints,
    ...opsWatchExtension.reviewedMetadataFingerprints,
    ...teamMembershipExtension.reviewedMetadataFingerprints,
    ...objectStorageExtension.reviewedMetadataFingerprints,
    ...customerRfiLookupsExtension.reviewedMetadataFingerprints,
    ...rfxLaneNoAwardExtension.reviewedMetadataFingerprints,
    ...supabaseAuthMetadataOverrides,
  },
  reviewedAuthorizationFingerprints: {
    ...BASE_ACTION_CONTRACT.reviewedAuthorizationFingerprints,
    'edge.rfx-bid-api.peek_invitation': '86cccc352754a79b77285f332c85ffe99b81bba3c1131f8106661abc993fe050',
    ...legacyAuthorizationOverrides,
    ...extension.reviewedAuthorizationFingerprints,
    ...gmailAuthorizationFingerprints,
    ...ratewareApiAuthorizationOverrides,
    ...carrierTemplateExtension.reviewedAuthorizationFingerprints,
    ...rfxInvitationReviewExtension.reviewedAuthorizationFingerprints,
    ...rfxAtomicAwardExtension.reviewedAuthorizationFingerprints,
    ...websiteIntakeExtension.reviewedAuthorizationFingerprints,
    ...quotedeskExtension.reviewedAuthorizationFingerprints,
    ...usDieselExtension.reviewedAuthorizationFingerprints,
    ...fcmSyncExtension.reviewedAuthorizationFingerprints,
    ...opsWatchExtension.reviewedAuthorizationFingerprints,
    ...teamMembershipExtension.reviewedAuthorizationFingerprints,
    ...objectStorageExtension.reviewedAuthorizationFingerprints,
    ...customerRfiLookupsExtension.reviewedAuthorizationFingerprints,
    ...rfxLaneNoAwardExtension.reviewedAuthorizationFingerprints,
    ...corsOnlyAuthorizationOverrides,
    ...supabaseAuthAuthorizationOverrides,
    ...ratewareApiAuthorizationOverrides,
    ...brandedDomainAuthorizationOverrides,
    ...Object.fromEntries(quotedeskExtension.surfaces
      .filter((entry) => entry.canonicalId.startsWith('edge.quotedesk-api.'))
      .map((entry) => [entry.canonicalId, quotedeskAuthEnvelope])),
  },
  surfaces: [
    ...BASE_ACTION_CONTRACT.surfaces.map((entry) => ({
      ...entry,
      contractVersion,
      ...((ratewareApiSourceFingerprintOverrides[entry.canonicalId] || supabaseAuthSourceFingerprintOverrides[entry.canonicalId] || portableRfxBidSourceFingerprintOverrides[entry.canonicalId] || carrierProfileSourceFingerprintOverrides[entry.canonicalId] || whatsappWebhookSourceFingerprintOverrides[entry.canonicalId] || rateBaseAdminSourceFingerprintOverrides[entry.canonicalId] || carrierChatSourceFingerprintOverrides[entry.canonicalId])
        ? { sourceFingerprint: ratewareApiSourceFingerprintOverrides[entry.canonicalId] || supabaseAuthSourceFingerprintOverrides[entry.canonicalId] || portableRfxBidSourceFingerprintOverrides[entry.canonicalId] || carrierProfileSourceFingerprintOverrides[entry.canonicalId] || whatsappWebhookSourceFingerprintOverrides[entry.canonicalId] || rateBaseAdminSourceFingerprintOverrides[entry.canonicalId] || carrierChatSourceFingerprintOverrides[entry.canonicalId] }
        : {}),
      ...(entry.canonicalId.startsWith('edge.google-chat-app.')
        ? { analysisCoverage: 'shared-observed', coverageSignals: ['shared_dependency_observed'] }
        : {}),
      ...(oracleStorageSurfaceOverrides[entry.canonicalId] || {}),
    })),
    ...providerSurfaces,
    ...gmailSurfaces,
    ...carrierTemplateExtension.surfaces,
    ...rfxInvitationReviewExtension.surfaces,
    ...rfxAtomicAwardExtension.surfaces,
    ...websiteIntakeExtension.surfaces,
    ...quotedeskExtension.surfaces,
    ...usDieselExtension.surfaces,
    ...fcmSyncExtension.surfaces,
    ...opsWatchExtension.surfaces,
    ...teamMembershipExtension.surfaces,
    ...objectStorageExtension.surfaces,
    ...customerRfiLookupsExtension.surfaces,
    ...rfxLaneNoAwardExtension.surfaces,
    rfxBidPeekSurface,
  ],
};
