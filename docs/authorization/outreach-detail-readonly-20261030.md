# Outreach message detail remains a read

The reconciliation of the remaining read sources exposed a legacy mutation in
`get_outreach_message`: an email row with a joined plaintext invitation token
called hydration with its migration-capable default. Opening or refreshing the
message could therefore update the invitation's token fields and timestamp.
This predates this block and is the same class of implicit write already removed
from RFx detail and outreach listing by PR180.

One call now passes `{ migrateLegacyTokens: false }`. Owned message selection,
optional event restriction, response enrichment, encrypted-token recovery,
diagnostics and the separate WhatsApp review branch keep their existing behavior.
The helper's default and explicit write-capable callers remain unchanged.

Eight synthetic unit cases execute the real detail branch and hydration helper.
The legacy single-read and repeated-read cases fail before the fix, then all
eight pass. The tests also cover encrypted tokens, persisted WhatsApp preview,
foreign/missing messages, event mismatch and the unchanged migration-capable
default. Decryption, enrichment, diagnostic/preview services and the migration
writer are spies; this unit proves dispatch to migration is suppressed, not live
provider or database behavior.

The final candidate also passes Deno check, eighteen synthetic HTTP client/proxy
cases and thirty-six actual handler regressions. Those fixtures block provider
network and business writes and do not certify production Auth, RLS or deployment.

Only this reviewed action's source fingerprint is refreshed. The seven already
registered new human actions retain a static envelope for the one-line module
change; the 291 legacy envelopes remain pending their shared dependency review.
All 497 permission decisions, lifecycle, scope/access classes and permission
keys are preserved. Local full-gate errors decrease from 305 to 304: thirteen
direct sources and 291 envelopes remain. Three negative controls stay blocking.

No production changes, SQL, migration edits, role changes, new tools, worktrees,
Docker operations or merge are included. The separate loads_portal prerequisite
still blocks the isolated integration replay.
