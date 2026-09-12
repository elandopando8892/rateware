# Rateware production alias and Edge state — 2026-09-11

## Observed state

- `rates.heymarksman.com` resolves as a CNAME to `cname.vercel-dns.com` and is
  attached to the Rateware Vercel project.
- The production alias currently points to deployment
  `dpl_BHDX3J8wBwXJEEUBDqjbqXYSsQvs`, status `READY`, with aliases
  `rateware.vercel.app`, `rates.heymarksman.com`, and
  `rateware-elandopando8892s-projects.vercel.app`.
- The production deployment was created at `2026-09-11 12:59:48 -06:00`.
- The inspected branch was `codex/carrier-list-templates` at `34c57dc`.
  Correction verified on 2026-09-12: `99af4da` is NOT an ancestor of this
  branch. It is the main-line rollback of the progressive lane-rendering
  change that remains in this candidate. The candidate does include
  `7f8df29`, which raises the outreach invitation ID limit to 50,000.
- The branch preview alias is reachable and returns HTTP 200. The production
  alias also returns HTTP 200.
- Supabase Auth health returns HTTP 200 (`GoTrue v2.196.0`) using the public
  client key; no secret value is recorded here.
- The linked Supabase project reports `rateware-api` active at Edge version 621,
  updated at `2026-09-11 16:19:02 -06:00`, with remote bundle hash
  `928a1a3bfbb236259563df7d505b0f61dc296b1004f17365472b2114beedbfab`.

## Interpretation and boundary

The current source and branch-level stability test expect
`RFX_OUTREACH_INVITATION_ID_LIMIT = 50000`, while the supplied screenshot shows
the older 5,000-row error. The screenshot therefore cannot be treated as proof
that the current frontend and current Edge bundle are both serving the same
candidate. It needs an authenticated reproduction with a request/operation
receipt before any rollback or production declaration.

The Vercel inspection does not expose a Git SHA, and the Edge bundle hash is not
an independently verified source-to-deployment mapping. Exact SHA-to-deployment
evidence remains open for P5.

## Safety disposition

No migration, feature-flag change, production redeploy, invitation, email,
WhatsApp message, or business record was created during this inspection. The
Docker daemon is still unavailable, so P3-A isolated migration replay remains
open.
