# P4 preview authenticated smoke — 2026-09-11

## Scope

Read-only acceptance evidence for the Rateware preview candidate. The browser
session used Supabase Auth with Google Sign-In and performed no template save,
carrier insert, invitation, Gmail, WhatsApp, or other business mutation.

## Candidate and runtime

- Git branch: `codex/carrier-list-templates`
- Candidate commits: `3c79756` (scoped Vercel preview CORS) and `91e9945`
  (content-addressed P3-V3 accessibility supersession)
- Vercel preview: `https://rateware-qews5happ-elandopando8892s-projects.vercel.app`
- Preview deployment: `dpl_G4E8wFTZ8QMd8c2iRYrpHhNzZy9c` (READY)
- Supabase `rateware-api`: active version `621`
- Production aliases were not promoted or changed by this evidence capture.

## Observed checks

1. Google Sign-In completed and the authenticated shell showed the signed-in
   workspace.
2. Command Center loaded live workspace aggregates: 178 source files, 23
   pending review rows, 5 Bid Rooms, and 1,360 procurement vendors.
3. Carrier CRM loaded 1,360 carriers and exposed List Templates. The existing
   `D2D Crossborder MX-US (332)` template was visible, and `New template` was
   enabled. Opening the constructor produced a draft only; it was closed
   without saving.
4. Bid Room loaded 63 events. Launch / Carrier Fit exposed the active-template
   selector with `D2D Crossborder MX-US (332)` and rendered compatible carriers.
   Selecting the template changed only the read-only filter state; no carrier
   was added to the RFx.
5. The preview CORS preflight returned HTTP 200 with
   `Access-Control-Allow-Origin` equal to the exact Vercel preview origin.
6. `node --test tests/platform55-p3v-v3-contract.test.mjs tests/rateware-stability.test.mjs`
   passed (6/6 subtests).
7. `node tools/validate-action-contract.mjs` passed with 415 contract surfaces,
   413 discovered surfaces, and zero errors; the existing stale declaration
   warning remains.

## Disposition

This is authenticated preview evidence, not a closed P4 gate: the preview
uses the existing Rateware Supabase project rather than a separately seeded
non-production tenant pair. P3-V6 remains NO-GO until its certifier produces
actual state fixtures, screenshot artifacts, and enforced network accounting.
P5 production promotion and the 24–48 hour stability window remain pending.
