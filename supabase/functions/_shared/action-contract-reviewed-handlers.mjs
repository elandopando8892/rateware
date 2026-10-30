// Static reviewed handler attribution and owner-filter correction. No permission decisions change.
export const REVIEWED_HANDLER_ATTRIBUTION = {
  "overrides": {
    "edge.rateware-api.shipper_commercial_work": {
      "handler": "handleShipperCommercialWork",
      "sourceFingerprint": "69916abb304eaf8aa8e8442d4de52af9e33e2ace7b1364ad894edc35003a4e2c"
    },
    "edge.rateware-api.replace_bounced_vendor_email": {
      "handler": "handleReplaceBouncedVendorEmail",
      "sourceFingerprint": "3403d1f01f1ea049f040921ba7595225a30089143b2f60bc2a28b9a6613b1e74"
    },
    "edge.rateware-api.set_rfx_lane_no_award": {
      "handler": "handleSetRfxLaneNoAward",
      "sourceFingerprint": "6a3a5f6411401b0f7d4e77b23b96956bbe06886d20972947daf636b971a31df4"
    },
    "edge.rateware-api.list_outreach_campaigns": {
      "handler": "handleListOutreachCampaigns",
      "sourceFingerprint": "6974a41f2a65cd474f49b23335efc1d3503b5e0f8ce310b26309f15c4df859fa"
    },
    "edge.rateware-api.list_vendor_unmatched_ids": {
      "handler": "handleListVendorUnmatchedIds",
      "sourceFingerprint": "5bd31915ea32ebcb30d9a9be484887ee33a076ea50872a7357f0fb08cfaf2fdf"
    },
    "edge.rateware-api.simulate_interpretation_memory": {
      "handler": "handleSimulateInterpretationMemory",
      "sourceFingerprint": "a8fcf9aa1fd2a47303112dee779a47d62d423666fc232a1262b6e9a0f1646823"
    }
  },
  "reviewedMetadataFingerprints": {
    "edge.rateware-api.shipper_commercial_work": "ef688c9f04698ec10d97cb0db954ed46a9bb3de11acd024c6a42e80a7cf05174",
    "edge.rateware-api.replace_bounced_vendor_email": "5590af38c68e3058f29273835c74fd9ed4d9d74f903f7260335ea811f8ad161d",
    "edge.rateware-api.set_rfx_lane_no_award": "29aba1ef14968dab0ee51f53c6eb6b68cdcb4c23039f3db66da5934b84d8308b",
    "edge.rateware-api.list_outreach_campaigns": "09247049e6378dd72edd3decc57f33c860642022d09b12535bd071c4fe2d6416",
    "edge.rateware-api.list_vendor_unmatched_ids": "4918234d072459420af7a38aee05b720ffda48b4f1045fa6ff674b2dbfd2e488",
    "edge.rateware-api.simulate_interpretation_memory": "bc21a2f7451bae80019c16fb54673a5609d8747ce7a6c5d0dacac9b247eb3349"
  },
  "reviewedAuthorizationFingerprints": {
    "edge.rateware-api.associate_whatsapp_reply": "55b8edd13513b0672f8ff9bca619c096194aec24246979af195117315c49f507",
    "edge.rateware-api.check_gmail_connection": "55b8edd13513b0672f8ff9bca619c096194aec24246979af195117315c49f507",
    "edge.rateware-api.get_carrier_provider_advisory": "55b8edd13513b0672f8ff9bca619c096194aec24246979af195117315c49f507",
    "edge.rateware-api.get_markos_bid_room_snapshot": "55b8edd13513b0672f8ff9bca619c096194aec24246979af195117315c49f507",
    "edge.rateware-api.get_published_carrier_classification": "55b8edd13513b0672f8ff9bca619c096194aec24246979af195117315c49f507",
    "edge.rateware-api.review_whatsapp_reply_association": "55b8edd13513b0672f8ff9bca619c096194aec24246979af195117315c49f507",
    "edge.rateware-api.verify_outreach_gmail_message": "55b8edd13513b0672f8ff9bca619c096194aec24246979af195117315c49f507"
  }
};
