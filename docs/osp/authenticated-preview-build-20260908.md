# Authenticated preview build — 2026-09-08

Candidate: `b8fc6fbb1faac6216d1545323a91ade76ad61f1e`, pushed to the private OSP
repository. Production has not been promoted or reconfigured.

## Configuration and source

Vercel initially had no Preview variables. Nine required variables were added
only to Preview. Supabase remains the selected auth provider. The scanner uses
the shared project's Storage origin and a newly generated preview-only sensitive
credential; the production scanner credential was not recovered or rotated.
Public browser values are non-sensitive variables, never service-role keys.

Source was extracted with `git archive` from the candidate's `apps/osp` tree.
Local overlays are project linkage and an upload exclusion file. `.vercel`,
`.env*`, test-results and node_modules are excluded from upload. The CLI reports
`gitDirty: 1` because it discovers the surrounding worktree; this is not claimed
as a clean Git-connected deployment. The upload contains the archived app and
its full existing scanner build, not the local temporary directory.

## Build dispatched

- Existing project: `prj_6mVnZ4DNVH3U2KCyQgyRMZDCJx8s`.
- Deployment: `dpl_CemUrGDW2qGyZ2H3oCjNG2vX8TAM`.
- Generated URL: `https://osp-customer-setup-qs8dmblkb-elandopando8892s-projects.vercel.app`.
- Build-only exact origin setting:
  `https://osp-customer-setup-closeout-b8fc6fb-elandopando8892s-projects.vercel.app`.
- Last observed state: **BUILDING**, dependencies installed; no completed-build
  or browser proof yet. The CLI's generic “ready” message was not treated as
  readiness because the authoritative state was INITIALIZING/BUILDING.

## Remaining

Update: deployment reached **READY** and the exact preview alias was assigned.
The browser rendered the real-preview banner and Google login button. Selecting
the existing Sales identity returned to the shared default Site URL at Rateware,
not OSP. The Supabase dashboard confirms 33 redirect entries and no entry for
this preview origin. The default Site URL must stay unchanged.

Adding an authentication redirect through the browser required action-time
confirmation, which the user supplied. Applied additions are only `/app` and
`/app?returnTo=%2Fapp%2Fpipeline` on the exact configured preview origin, without
wildcard hosts or removing other applications' redirects. The dashboard now
shows 35 entries (33 original plus these two), with the default Site URL still
`https://rates.heymarksman.com/`. A fresh Google login returned to the exact
preview `/app/pipeline` and showed `sales@heymarksman.com OSP ADMINISTRATOR`.
No failed-flow authorization code was reused.

Authenticated UI shell is proven, but data access is not. The pipeline displayed
unavailable data. An independent OPTIONS request to osp-read-api using this
exact origin and authorization/content-type request headers returned HTTP 400
INVALID_REQUEST without an allow-origin response. This matches the remaining
API origin deployment/configuration prerequisite. Do not interpret unavailable
UI data as evidence that Gmail is actually disconnected or that no cases exist.

## Coordinated-release preparation

The thirteen migration names remain absent from the live migration ledger.
Native rehearsal already showed that the old UI rejects new response fields;
therefore API replacement cannot be treated as an isolated CORS-only release.

`dpl_3jvP1h8N5L6Q6NgTnxDkz3fhjpgf` was built without the preview-origin flag but
still with Preview runtime variables. It is **not** a production promotion
candidate because its scanner credential belongs to Preview.

The actual production-environment candidate is
`dpl_CuDr3KniMaKSvENf9RcdXszdW8kA`, built using `--prod --skip-domain`, now READY.
The primary OSP domain was independently checked and still resolves to
`dpl_Ggf4PYD79X66rfFLipw3kNuj5Fhe` / `ed12d16`. Candidate metadata lists a default
Vercel alias; do not infer traffic routing from that metadata alone.

Current osp-read-api source was downloaded with Supabase CLI `--use-api` into
`tmp/osp-release-backup-b8fc6fb/read-api` as the first rollback source artifact.
Its dependency closure and the other API backups still need validation before
replacement. No migration or API deployment was executed in this step.

## Backup validation continuation

Downloaded case-api, document-api and worker separately. Form API extraction was
refused by the CLI (`UnsafeFunctionDownloadPathError`) for its app dependencies;
the MCP source response was instead saved to a new folder after rejecting path
traversal and requiring only apps/osp or supabase/functions prefixes.

Plain `deno check` of exported sources failed: type-only source files are absent,
case/worker need their import maps, and the worker entry is edge.ts, not index.ts.
These errors are retained as a failed probe, not hidden by claiming type safety.
Runtime bundling without execution, using the case API's exported import map,
succeeded for read-api (112 modules), case-api (169), document-api (147) and
form-api (103). The generated runtime.bundle.js files remain in their respective
ignored backup folders. This proves runtime dependency resolution, not a live
restoration smoke or compatibility of old code with the new schema.

Live source versions captured: read-api **180** (not the earlier noted 179),
case-api 181, document-api 162, form-api 152, worker 211. Preserve the current
180 source rather than assuming an older baseline. Worker bundling remains
unresolved because its import map was not included in the exported file list;
do not replace that worker on the strength of these API backups.

Worker backup follow-up: read the import map at the exact local path reported
by its live metadata (`osp-s7-main-integration/supabase/functions/osp-worker/deno.json`).
Its five pinned aliases were copied to the ignored worker backup directory.
Runtime bundling then succeeded: **727 modules, 3.96 MB**. This map is corroborated
by the recorded checkout, not recovered from the exported bundle, and that
provenance distinction remains explicit. All five source backups now have
non-executed runtime bundles; no restoration or business action was attempted.

Set exactly one Supabase configuration entry, `OSP_APPROVED_PREVIEW_ORIGIN`, to
the configured preview origin; CLI reported success for one entry in the shared
project. This is configuration for the candidate handlers, not a claim that the
currently deployed handlers accept it. No wildcard or auth role was added.

Verify build completion and scanner bundle. Assign the exact preview alias only
to this candidate, configure its exact Auth redirect and API CORS, then perform
authenticated checks. The generated URL is not the configured app origin and
must not be presented as a working login. Do not promote this preview-configured
build to production. No signature, mail, webhook or historical Salzillo mutation
was performed.
