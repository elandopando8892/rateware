# Reviewed handler attribution and memory-simulation scope

Six inline Rateware actions now dispatch to named handlers with explicit context:
shipper_commercial_work, replace_bounced_vendor_email, set_rfx_lane_no_award,
list_outreach_campaigns, list_vendor_unmatched_ids and simulate_interpretation_memory.
The existing authentication, principal, role and audit-context gates still run
before dispatch. Responses retain the original correlated response callback.
Five actions previously had undetermined handler structure; bounce replacement
was attributed to its audit helper instead of its full business operation.

The extraction preserves the original statements. One intentional behavioral
correction filters raw_uploads by the verified user.owner_email before pagination,
matching and counts in memory simulation. A global rule still applies to the
workspace's documents; it does not make other owners' documents visible.
Synthetic two-owner fixtures reproduced the previous cross-workspace result and
the corrected result. No customer data or production endpoint was used.

The new functions use an ordinary context parameter and destructure inside the
body. A regression test checks that the unchanged scanner fingerprints each full
handler, avoiding its destructured-parameter limitation. The validator itself and
its blocking decisions are unchanged.

The static contract increment changes only six handler/source attributions and
the seven previously registered human-action envelopes affected by this source
change. Permission keys, decisions, lifecycles, exposures and counts are preserved.
Unrelated baseline authorization drift remains blocking and is not re-signed.

Validation: strict offline Deno check; 36 read-only handler cases; 18 synthetic
HTTP integration cases; 14 before/after equivalence cases; full-handler attribution
regression; six memory-scope cases including body-supplied owner, global/vendor/RFx
rules, a second workspace and foreign-rule rejection. New portable tests run before
the existing full contract gate in CI; no gate is skipped or downgraded.

This PR remains a review candidate. It does not deploy, migrate production,
grant permissions or complete the separate Loads Portal replay prerequisite.
