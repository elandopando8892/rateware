# Review of four bounded Rateware read projections

Reviewed from PR180 head `91d75399e9be4b8fefb4406b0812569be3e84b99`.
The Rateware runtime and its role/identity configuration are unchanged here.
Only four direct source fingerprints are reconciled; the 291 shared envelopes
remain pending. No permission decision, access/scope class or lifecycle changes.

- `get_rate_row_detail` selects the verified owner's staging row and optional
  status. Its projection adds saved bid transit_days, accepting only a nonnegative
  number, without returning the complete extraction payload.
- `get_upload_source_url` selects an owned upload and signs the stored bucket/path
  for 600 seconds. Body storage/owner overrides cannot choose another object.
  Supabase retains its existing workspace rules. Oracle forwards only action/id
  and the caller bearer to rateware-storage-api, whose reviewed identity resolver
  requires confirmed Supabase identity, the specific Rateware organization and
  canonical workspace linkage. A downstream denial has no local signing fallback.
  The two routes are intentionally distinct in the existing file-access contract.
- `list_contact_history` keeps the owner predicate through optional filters and
  bounds normal pages to 1000. Its WhatsApp branch uses the existing stricter
  pending/message scopes, verifies owner/event/message/channel and returns a
  bounded projection excluding raw callback metadata and credentials.
- `list_rfx_invitation_wave_reviews` checks the owned event before reading owner-
  scoped audit evidence. It returns the latest review/revocation per vendor and
  rejects a history beyond 5000 rather than silently returning a partial success.

Twenty-one new synthetic tests execute the real branches, constants and helpers
with a query client and signing/transport spies. They cover foreign resources,
body spoofing, redaction, invalid scope, limits, latest revocation and signing
denial. Six existing routing tests pass. They do not certify live Auth, RLS,
Oracle credentials/signing, storage objects or a deployed end-to-end journey.

The existing four-entrypoint source-file suite initially stops on five inference
errors in interpret-upload. One explicit `Record<string, unknown>` result
annotation corrects those errors; emitted JavaScript is byte-identical under
the existing esbuild transform. No cast, any, SDK version change or no-check
flag is added. The interpretation module type-checks and loads in an isolated
one-test fixture without invoking its handler or a model. Rateware's isolated
check also passes. The combined file suite still stops before runtime on 131
type errors in its Rateware import context. It is NOT reported as passing.
Its command uses cached dependencies only, a scoped import allowlist when
loading modules, and no network access; no package installation is performed.

The broader interpretation handler drift stays pending its own full review:
the type-only correction does not approve its previous source/envelope changes.
All 497 dispositions and the original scanner/validator remain intact. The
separate loads_portal replay dependency is unresolved. No production SQL,
deployment, merge, Docker operation or change to active checkouts is included.
