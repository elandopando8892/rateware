// Static reviewed source. Permissions unchanged. Migration name matches applied history.
export const SPOT_CONVERSION_ACTION_CONTRACT_EXTENSION = {
  "contractVersion": "1.3.0",
  "expectedCountsDelta": {
    "governable": 3,
    "edge": 2,
    "postgres": 1,
    "ratewareApi": 0
  },
  "reviewedMetadataFingerprints": {
    "edge.quotedesk-api.convert_spot_request_to_quote": "06be176664fa216f9a4dc5811b8809acd7e34591315df1cffff09c6683d8fad2",
    "edge.quotedesk-api.list_spot_request_quotes": "e909d62a360e972df2753672a48272f7f4aace50390032768e7e4bcfde040ef3",
    "rpc.public.quotedesk_convert_spot_request(text,text,text,text,uuid,timestamptz)": "73e640a708e1d23606f188fc285932d66d59a6d2dbb4eda8fb16f1b9fb3675b9"
  },
  "reviewedAuthorizationFingerprints": {
    "edge.create-raw-upload.create_raw_upload": "e78b0ee67856f2504899e564e231e16cf80f16e0ddee6ec69d135ca4a1a6f251",
    "edge.interpret-upload.interpret_upload": "11f3c332c27213969058fd41e8790b706cec859a46141ce491695cff9af0b9f1",
    "edge.quotedesk-api.apply_bid_room_awards": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.convert_spot_request_to_quote": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.create_quote": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.delete_quote_lane": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.estimate_lane_fcm": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.event_origins": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.get_context": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.get_quote": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.link_bid_room_event": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.list_fcm_cost_bases": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.list_quote_emails": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.list_quote_queue": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.list_quotes": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.list_spot_request_quotes": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.prepare_quote_email_draft": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.preview_quote_email": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.save_accessorial": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.save_quote_lane": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.send_quote_email": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.send_quote_queue_message": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.set_quote_status": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.suggest_lane_miles": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.quotedesk-api.update_quote": "0c178a238da0fd8343486280ccdb8acb82e443a335f17082a056fe552ba04329",
    "edge.rateware-storage-api.get_upload_source_url": "29e78eefa8e5053f3bbdc3528f72b7adbdb2ea4522fca857f898d312d9d20014",
    "edge.rateware-storage-api.remove_upload": "29e78eefa8e5053f3bbdc3528f72b7adbdb2ea4522fca857f898d312d9d20014",
    "rpc.public.quotedesk_convert_spot_request(text,text,text,text,uuid,timestamptz)": "9c22224397edab7596f25502c92b878104e4d5a971f275874578593bfd1b9291"
  },
  "overrides": {
    "edge.create-raw-upload.create_raw_upload": {
      "dependencyFiles": [
        "supabase/functions/_shared/approved-evidence-policy.ts",
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/object-storage.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/source-file-access.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/create-raw-upload/index.ts"
      ]
    },
    "edge.interpret-upload.interpret_upload": {
      "dependencyFiles": [
        "supabase/functions/_shared/approved-evidence-policy.ts",
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/object-storage.ts",
        "supabase/functions/_shared/rate-normalization.mjs",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/service-normalization.mjs",
        "supabase/functions/_shared/source-file-access.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/interpret-upload/email-interpretation-policy.mjs",
        "supabase/functions/interpret-upload/index.ts",
        "supabase/functions/interpret-upload/vendor/xlsx-0.20.3.mjs"
      ]
    },
    "edge.quotedesk-api.apply_bid_room_awards": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.create_quote": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.delete_quote_lane": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.estimate_lane_fcm": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.event_origins": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.get_context": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.get_quote": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.link_bid_room_event": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.list_fcm_cost_bases": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.list_quote_emails": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.list_quote_queue": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.list_quotes": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.prepare_quote_email_draft": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.preview_quote_email": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.save_accessorial": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.save_quote_lane": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.send_quote_email": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.send_quote_queue_message": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.set_quote_status": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.suggest_lane_miles": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.quotedesk-api.update_quote": {
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ]
    },
    "edge.rateware-storage-api.get_upload_source_url": {
      "dependencyFiles": [
        "supabase/functions/_shared/approved-evidence-policy.ts",
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/object-storage.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/source-file-access.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/rateware-storage-api/index.ts"
      ]
    },
    "edge.rateware-storage-api.remove_upload": {
      "dependencyFiles": [
        "supabase/functions/_shared/approved-evidence-policy.ts",
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/object-storage.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/source-file-access.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/rateware-storage-api/index.ts"
      ]
    }
  },
  "surfaces": [
    {
      "contractVersion": "1.3.0",
      "canonicalId": "edge.quotedesk-api.convert_spot_request_to_quote",
      "actionName": "convert_spot_request_to_quote",
      "sourceKind": "edge-selector",
      "sourceFile": "supabase/functions/quotedesk-api/index.ts",
      "handler": "jsonResponse",
      "endpoint": "POST /functions/v1/quotedesk-api body.action",
      "businessModule": "Commercial",
      "operation": "manage",
      "resource": "quotedesk",
      "access": "write",
      "exposure": "human",
      "sensitivity": "medium-high",
      "tenantRelevance": "tenant-scoped",
      "proposedPermissionKey": "quotedesk.manage",
      "functionalOwner": "Commercial",
      "decisionStatus": "pending_human_approval",
      "lifecycle": "active",
      "replacementAction": null,
      "sourceFingerprint": "73a585b5f3d1a3d03a2bbf7cc498db095433bd38426397ec7c7f98f689a3fb98",
      "analysisCoverage": "shared-observed",
      "coverageSignals": [
        "shared_dependency_observed",
        "external_dependency"
      ],
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ],
      "rpcSignature": null,
      "notes": "Local candidate. Authenticated Admin/Operator conversion, trusted identity only, one database transaction; no mail or automatic retry."
    },
    {
      "contractVersion": "1.3.0",
      "canonicalId": "edge.quotedesk-api.list_spot_request_quotes",
      "actionName": "list_spot_request_quotes",
      "sourceKind": "edge-selector",
      "sourceFile": "supabase/functions/quotedesk-api/index.ts",
      "handler": "jsonResponse",
      "endpoint": "POST /functions/v1/quotedesk-api body.action",
      "businessModule": "Commercial",
      "operation": "read",
      "resource": "quotedesk",
      "access": "read",
      "exposure": "human",
      "sensitivity": "medium",
      "tenantRelevance": "tenant-scoped",
      "proposedPermissionKey": "quotedesk.read",
      "functionalOwner": "Commercial",
      "decisionStatus": "pending_human_approval",
      "lifecycle": "active",
      "replacementAction": null,
      "sourceFingerprint": "73a585b5f3d1a3d03a2bbf7cc498db095433bd38426397ec7c7f98f689a3fb98",
      "analysisCoverage": "shared-observed",
      "coverageSignals": [
        "shared_dependency_observed",
        "external_dependency"
      ],
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs",
        "supabase/functions/quotedesk-api/spot-conversion.ts"
      ],
      "rpcSignature": null,
      "notes": "Read-only durable Spot links scoped by authenticated workspace; Consulta allowed."
    },
    {
      "contractVersion": "1.3.0",
      "canonicalId": "rpc.public.quotedesk_convert_spot_request(text,text,text,text,uuid,timestamptz)",
      "actionName": "public.quotedesk_convert_spot_request",
      "sourceKind": "postgres-function",
      "sourceFile": "supabase/migrations/20261006234153_quotedesk_spot_conversion_atomic.sql",
      "handler": "public.quotedesk_convert_spot_request(text,text,text,text,uuid,timestamptz)",
      "endpoint": "PostgreSQL function / PostgREST RPC surface public.quotedesk_convert_spot_request(text,text,text,text,uuid,timestamptz)",
      "businessModule": "Commercial",
      "operation": "manage",
      "resource": "quotedesk",
      "access": "write",
      "exposure": "internal/service-role",
      "sensitivity": "medium-high",
      "tenantRelevance": "tenant-scoped",
      "proposedPermissionKey": "quotedesk.spot_internal",
      "functionalOwner": "Commercial",
      "decisionStatus": "internal_only",
      "lifecycle": "active",
      "replacementAction": null,
      "sourceFingerprint": "9c22224397edab7596f25502c92b878104e4d5a971f275874578593bfd1b9291",
      "analysisCoverage": "direct",
      "coverageSignals": [
        "direct"
      ],
      "dependencyFiles": [
        "supabase/migrations/20261006234153_quotedesk_spot_conversion_atomic.sql"
      ],
      "rpcSignature": "text,text,text,text,uuid,timestamptz",
      "notes": "Local candidate, not applied. Service-role-only atomic Spot conversion with source lock, version and durable receipt."
    }
  ]
};
