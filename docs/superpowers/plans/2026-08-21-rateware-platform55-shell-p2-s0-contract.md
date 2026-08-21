# Rateware Platform 55 Shell P2-S0 Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze a reproducible twelve-build fidelity contract, route map, token baseline, and P2 scope without changing production UI behavior.

**Architecture:** Read the approved Build 12 ZIP without extracting it into the repository, generate a file-backed render-state matrix, map every production route and Platform 55 surface, and commit the exact shell token contract. Node tests validate the committed evidence independently of the external ZIP.

**Tech Stack:** PowerShell `System.IO.Compression`, CSV/JSON/Markdown evidence, CSS custom properties, Node.js tests, existing production-readiness ledger.

**Spec:** `docs/superpowers/specs/2026-08-21-rateware-platform55-shell-migration-design.md`

## Global Constraints

- Use a new worktree `C:\Users\andre\OneDrive\Documents\Rateware_P2_S0_Shell_Contract` on branch `codex/p2-shell-contract-s0` from the then-current `origin/main`.
- The reference ZIP hash must equal `CF2CED85E95DFB33BB7410BF73ACE22CB95090CE649747DF60BF2920E808C16A` before any inventory is generated.
- The generated matrix must contain exactly 1,150 render-plan rows distributed as `61,61,68,76,82,90,96,104,116,124,132,140` for Builds 01-12.
- No production HTML, JavaScript runtime, Supabase asset, migration, environment, or external service is changed in this sprint.

---

### Task 1: Generate the Twelve-Build Fidelity Matrix

**Files:**
- Create: `tools/platform55-build12-inventory.ps1`
- Create: `docs/platform55-build12-source.json`
- Create: `docs/platform55-shell-build-matrix.csv`
- Create: `tests/platform55-build-matrix.test.mjs`

**Interfaces:**
- Consumes: Build 12 ZIP with twelve manifest/render-plan namespaces.
- Produces: deterministic source metadata and 1,150-row build matrix consumed by every later sprint.

- [ ] **Step 1: Write the failing matrix test**

Create `tests/platform55-build-matrix.test.mjs` with assertions equivalent to:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = JSON.parse(readFileSync("docs/platform55-build12-source.json", "utf8"));
const csv = readFileSync("docs/platform55-shell-build-matrix.csv", "utf8").trim().split(/\r?\n/);
const rows = csv.slice(1).map((line) => line.match(/(?:"([^"]*(?:""[^"]*)*)"|([^,]*))(?:,|$)/g));

assert.equal(source.sha256, "CF2CED85E95DFB33BB7410BF73ACE22CB95090CE649747DF60BF2920E808C16A");
assert.equal(source.archive_entries, 3239);
assert.equal(source.render_states, 1150);
assert.equal(csv.length - 1, 1150);
assert.deepEqual(source.states_by_build, {
  build_01: 61, build_02: 61, build_03: 68, build_04: 76,
  build_05: 82, build_06: 90, build_07: 96, build_08: 104,
  build_09: 116, build_10: 124, build_11: 132, build_12: 140
});
assert.equal(new Set(csv.slice(1)).size, 1150);
assert.ok(rows.length === 1150);
```

Use a small CSV parser inside the test that correctly unescapes quoted commas; do not split production rows with plain `line.split(",")`.

- [ ] **Step 2: Run the test to verify RED**

```powershell
node tests/platform55-build-matrix.test.mjs
```

Expected: FAIL with `ENOENT` for `docs/platform55-build12-source.json`.

- [ ] **Step 3: Add the bounded ZIP inventory script**

Implement `tools/platform55-build12-inventory.ps1` with this contract:

```powershell
param(
  [Parameter(Mandatory=$true)][string]$ArchivePath,
  [Parameter(Mandatory=$true)][string]$MatrixPath,
  [Parameter(Mandatory=$true)][string]$SourcePath
)

$expectedHash = 'CF2CED85E95DFB33BB7410BF73ACE22CB95090CE649747DF60BF2920E808C16A'
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ArchivePath).Hash
if ($actualHash -ne $expectedHash) { throw "Build 12 SHA-256 mismatch" }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
try {
  # Read only the twelve known manifest/render-plan entries.
  # Emit build, ordinal, state, name_or_route, width, height, source_manifest,
  # source_render_plan, mapping_status, target_route, disposition, evidence.
  # Initial mapping_status is not_started and the final three fields are empty.
} finally {
  $archive.Dispose()
}
```

The implementation must reject missing/duplicate build namespaces, missing manifest/render plan, invalid JSON, duplicate state identity within a build, count drift, and output paths outside the current checkout. It must not extract archive entries or execute embedded content.

- [ ] **Step 4: Generate the committed evidence**

```powershell
$archive = 'C:\Users\andre\Downloads\rateware_foundation_home_commercial_procurement_operations_finance_intelligence_administration_platform_build_v12.zip'
powershell -NoProfile -File tools/platform55-build12-inventory.ps1 `
  -ArchivePath $archive `
  -MatrixPath docs/platform55-shell-build-matrix.csv `
  -SourcePath docs/platform55-build12-source.json
```

Expected: 12 namespaces, 1,150 render rows, 3,239 archive entries, zero extraction.

- [ ] **Step 5: Run GREEN and commit**

```powershell
node tests/platform55-build-matrix.test.mjs
git diff --check
git add tools/platform55-build12-inventory.ps1 docs/platform55-build12-source.json docs/platform55-shell-build-matrix.csv tests/platform55-build-matrix.test.mjs
git commit -m "test: freeze Platform 55 twelve-build evidence"
```

Expected: PASS and one four-file commit.

---

### Task 2: Map Every Production Route and Platform 55 Surface

**Files:**
- Create: `docs/platform55-shell-route-map.csv`
- Modify: `tests/platform55-build-matrix.test.mjs`
- Modify: `docs/platform55-surface-inventory.csv`

**Interfaces:**
- Consumes: 29 tracked root HTML pages and 95 existing surface rows.
- Produces: exact ownership wave and shell variant for each route/surface.

- [ ] **Step 1: Add failing route-map assertions**

Add expected route sets to the test:

```js
const internalRoutes = new Set([
  "app.html", "business-intelligence.html", "catalog-workbench.html",
  "growth-hacking.html", "interpretation-memory.html", "outreach.html",
  "provider-communications.html", "provider-gmail.html", "provider-onboarding.html",
  "provider-service.html", "ratebook.html", "rateware.html", "rfx-events.html",
  "rfx-process.html", "settings.html", "shipper-crm.html", "staging-review.html",
  "upload-center.html", "upload-history.html", "vendor-improvement.html",
  "vendor-support.html", "vendors.html"
]);
const publicRoutes = new Set([
  "bid-room-board.html", "carrier-profile.html", "customer-rfi.html", "index.html",
  "ratebook-carrier.html", "rfx-bid.html", "shipper-profile.html"
]);
assert.equal(internalRoutes.size, 22);
assert.equal(publicRoutes.size, 7);
```

Assert every `git ls-files '*.html'` root route appears exactly once, every route has `owner_sprint`, `shell_variant`, `module_script`, and `verification_test`, and all 95 surface IDs have an owner sprint and route/disposition.

- [ ] **Step 2: Run RED**

```powershell
node tests/platform55-build-matrix.test.mjs
```

Expected: FAIL because `docs/platform55-shell-route-map.csv` does not exist and surface ownership is incomplete.

- [ ] **Step 3: Create the route map**

Use exact columns:

```text
route,page_key,access,shell_variant,owner_sprint,module_script,primary_test,platform55_surfaces,status,evidence
```

Assign internal routes to `tenant`, public portals to `public`, and `index.html` to `entry`. Assign P2-S1 through P2-S5 exactly as stated in the approved spec. Do not assign a public page to the tenant shell.

- [ ] **Step 4: Add explicit surface ownership**

Append these columns to `docs/platform55-surface-inventory.csv`:

```text
p2_owner_sprint,p2_target_route,p2_disposition,p2_evidence
```

Populate all 95 rows. Use only `implement`, `shared_surface`, `superseded`, `reference_only`, or `out_of_scope_public` dispositions. A `shared_surface` row must name its production route; a superseded/reference-only row must explain why in `p2_evidence`.

- [ ] **Step 5: Run GREEN and commit**

```powershell
node tests/platform55-build-matrix.test.mjs
git diff --check
git add docs/platform55-shell-route-map.csv docs/platform55-surface-inventory.csv tests/platform55-build-matrix.test.mjs
git commit -m "docs: map Platform 55 shell routes and surfaces"
```

Expected: 29/29 routes and 95/95 surfaces accounted for.

---

### Task 3: Freeze the Platform 55 Token Contract

**Files:**
- Create: `src/platform55-tokens.css`
- Create: `tests/platform55-shell-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: approved blueprint `:root` token values.
- Produces: stable CSS variables imported by P2-S1 and later CSS layers.

- [ ] **Step 1: Write the failing token test**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/platform55-tokens.css", "utf8");
for (const expected of [
  "--rw-sidebar-expanded: 264px",
  "--rw-sidebar-collapsed: 80px",
  "--rw-topbar: 64px",
  "--rw-navy-950: #0b1d2d",
  "--rw-navy-900: #10263a",
  "--rw-navy-800: #173047",
  "--rw-radius-sm: 6px",
  "--rw-radius-md: 10px",
  "--rw-radius-lg: 14px",
  "--rw-radius-xl: 18px"
]) assert.match(css, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

assert.doesNotMatch(css, /url\(|@import|javascript:/i);
```

Also assert exact brand/slate/teal/amber/red token values copied from the blueprint, the three approved breakpoints `1500`, `1320`, `900`, and reduced-motion variables.

- [ ] **Step 2: Run RED**

```powershell
node tests/platform55-shell-contract.test.mjs
```

Expected: FAIL with `ENOENT` for `src/platform55-tokens.css`.

- [ ] **Step 3: Create the token file**

Create a namespaced `:root` contract, including:

```css
:root {
  --rw-sidebar-expanded: 264px;
  --rw-sidebar-collapsed: 80px;
  --rw-topbar: 64px;
  --rw-navy-800: #173047;
  --rw-navy-900: #10263a;
  --rw-navy-950: #0b1d2d;
  --rw-radius-sm: 6px;
  --rw-radius-md: 10px;
  --rw-radius-lg: 14px;
  --rw-radius-xl: 18px;
  --rw-shadow-sm: 0 1px 2px rgba(15, 35, 55, 0.06);
  --rw-shadow-md: 0 12px 28px rgba(15, 35, 55, 0.10);
  --rw-shadow-drawer: -18px 0 40px rgba(15, 35, 55, 0.18);
  --rw-motion-fast: 160ms;
}
```

Do not import this file from production HTML during P2-S0.

- [ ] **Step 4: Wire the focused test script**

Add to `package.json`:

```json
"test:platform55-shell": "node tests/platform55-build-matrix.test.mjs && node tests/platform55-shell-contract.test.mjs"
```

Prepend `npm run test:platform55-shell &&` to the aggregate `test` script exactly once.

- [ ] **Step 5: Run GREEN and commit**

```powershell
npm run test:platform55-shell
npm test
git diff --check
git add src/platform55-tokens.css tests/platform55-shell-contract.test.mjs package.json
git commit -m "feat: establish Platform 55 shell tokens"
```

Expected: focused and full suites PASS; no HTML behavior changed.

---

### Task 4: Open P2 Evidence at 10 Percent

**Files:**
- Create: `docs/release/evidence/2026-08-21-p2-shell-contract.md`
- Modify: `docs/release/production-readiness-ledger.json`
- Modify: `tests/production-readiness-report.test.mjs`

**Interfaces:**
- Consumes: committed Build 12 matrix, route map, surface map, and token contract.
- Produces: file-backed P2 scope evidence and General 76.7% / P2 10%.

- [ ] **Step 1: Write the failing readiness fixture**

Add a valid ledger fixture with P0/P1 at 100, P2 at 10, P3-P5 at 0, and:

```json
"evidence": {
  "scope": [
    "docs/superpowers/specs/2026-08-21-rateware-platform55-shell-migration-design.md",
    "docs/release/evidence/2026-08-21-p2-shell-contract.md"
  ]
}
```

Assert `validateLedger()` succeeds and `computeOverallProgress()` equals `76.7`.

- [ ] **Step 2: Run RED**

```powershell
node tests/production-readiness-report.test.mjs
```

Expected: FAIL because the P2 evidence file and ledger change do not exist.

- [ ] **Step 3: Write the evidence report**

Record exact candidate/base SHAs, Build 12 and blueprint hashes, 12/12 build namespaces, 1,150 render states, 29/29 routes, 95/95 surfaces, token test results, full-suite result, limitations, and zero external mutation.

- [ ] **Step 4: Update the ledger and verify**

Set P2 to `10`, add only the `scope` evidence above, preserve all prior P0/P1 evidence exactly, and run:

```powershell
node tests/production-readiness-report.test.mjs
npm run release:progress
npm run test:platform55-shell
npm test
npm run validate:action-contract
npm audit --audit-level=low
git diff --check
```

Expected: `General: 76.7%`, `P2: 10%`, all checks PASS.

- [ ] **Step 5: Commit and freeze the local candidate**

```powershell
git add docs/release/evidence/2026-08-21-p2-shell-contract.md docs/release/production-readiness-ledger.json tests/production-readiness-report.test.mjs
git commit -m "docs: open P2 Platform 55 shell evidence"
git status --short
git rev-parse HEAD
```

Expected: clean worktree and exact candidate SHA recorded. Do not push or create a build without separate authorization.
