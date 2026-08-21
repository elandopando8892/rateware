# Rateware Platform 55 Shell P2-S1 Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first faithful Platform 55 tenant shell and Command Center vertical slice without breaking unmigrated pages.

**Architecture:** Add a pure shell model, allowlisted SVG icon element, DOM shell hydrator, route/action search, and focused CSS. `auth.js` keeps auth/permission ownership and uses a compatibility branch: Platform 55 mounting only on opted-in pages, legacy shell initialization everywhere else until P2-S6.

**Tech Stack:** ES modules, custom elements, static HTML, CSS, Node.js contract tests, existing Kinde and dashboard clients, browser visual verification.

**Spec:** `docs/superpowers/specs/2026-08-21-rateware-platform55-shell-migration-design.md`

## Global Constraints

- Use worktree `C:\Users\andre\OneDrive\Documents\Rateware_P2_S1_Command_Center` and branch `codex/p2-shell-command-center-s1` from current `origin/main` after P2-S0 acceptance.
- `app.html` is the only page opting into the new tenant shell in this sprint.
- All other pages must continue through the legacy shell path unchanged.
- Do not add Supabase calls, new notifications persistence, record search, or AI execution.
- Preserve all existing Command Center request functions, IDs, href destinations, loading/error states, and approval boundaries.

---

### Task 1: Build the Pure Shell Model and Icon Contract

**Files:**
- Create: `src/platform55-shell-model.js`
- Create: `src/platform55-icons.js`
- Modify: `tests/platform55-shell-contract.test.mjs`

**Interfaces:**
- Produces: `PLATFORM55_ROUTES`, `routeForPath`, `visibleNavigation`, `shellModel`, and `registerPlatform55Icons` used by Tasks 2-4.
- Consumes: route/surface maps committed by P2-S0.

- [ ] **Step 1: Add failing model tests**

Test exact behavior:

```js
import {
  PLATFORM55_ROUTES,
  routeForPath,
  visibleNavigation,
  shellModel
} from "../src/platform55-shell-model.js";

assert.equal(PLATFORM55_ROUTES.length, 29);
assert.equal(PLATFORM55_ROUTES.filter((row) => row.shell === "tenant").length, 22);
assert.equal(PLATFORM55_ROUTES.filter((row) => row.shell !== "tenant").length, 7);
assert.equal(routeForPath("/app").key, "app");
assert.equal(routeForPath("/app.html").key, "app");
assert.equal(routeForPath("/rfx-bid").shell, "public");
assert.equal(routeForPath("/missing"), null);

const restricted = visibleNavigation({ can: () => false });
assert.ok(restricted.every((item) => item.requiredAction == null));

const model = shellModel({
  pageKey: "app",
  user: { given_name: "<Andre>" },
  accessContext: { can: () => true },
  notificationSummary: { unread: 3 }
});
assert.equal(model.activeRoute.key, "app");
assert.equal(model.notificationCount, 3);
assert.doesNotMatch(JSON.stringify(model), /<Andre>/);
```

Also assert all route hrefs are relative same-product URLs, route keys/hrefs are unique, internal routes have group/icon/title/subtitle, and public routes never appear in tenant navigation.

- [ ] **Step 2: Run RED**

```powershell
npm run test:platform55-shell
```

Expected: FAIL because the two modules do not exist.

- [ ] **Step 3: Implement the minimal pure model**

Use immutable route records:

```js
export const PLATFORM55_ROUTES = Object.freeze([
  Object.freeze({
    key: "app",
    path: "./app.html",
    cleanPath: "/app",
    shell: "tenant",
    group: "Home",
    label: "Command Center",
    icon: "command",
    title: "Command Center",
    subtitle: "Decisions, priorities and lifecycle"
  })
]);
```

The final array must contain one immutable record for each of these exact files, with `cleanPath` equal to the slash plus the filename without `.html`: `app.html`, `business-intelligence.html`, `catalog-workbench.html`, `growth-hacking.html`, `interpretation-memory.html`, `outreach.html`, `provider-communications.html`, `provider-gmail.html`, `provider-onboarding.html`, `provider-service.html`, `ratebook.html`, `rateware.html`, `rfx-events.html`, `rfx-process.html`, `settings.html`, `shipper-crm.html`, `staging-review.html`, `upload-center.html`, `upload-history.html`, `vendor-improvement.html`, `vendor-support.html`, `vendors.html`, `bid-room-board.html`, `carrier-profile.html`, `customer-rfi.html`, `index.html`, `ratebook-carrier.html`, `rfx-bid.html`, and `shipper-profile.html`. The route test compares the sorted 29-file set byte-for-byte with `docs/platform55-route-map.json`; omissions and extra root HTML files fail.

`visibleNavigation` must filter only by an explicit `requiredAction`; absence means navigation is visible. It must never infer permission from labels or URLs. `shellModel` returns plain data and escapes user-facing strings once at render time, not by mutating source objects.

- [ ] **Step 4: Implement the icon registry**

Adapt the blueprint's `rw-icon` contract with an allowlist:

```js
const ICON_NAMES = new Set([
  "command", "work", "bell", "search", "ai", "chevron", "menu",
  "close", "check", "warning", "error", "shipper", "carrier", "rfx",
  "review", "rate", "upload", "source", "settings", "catalog", "user"
]);

export function registerPlatform55Icons({ root = document } = {}) {
  // Inject the vetted SVG sprite once and define rw-icon once.
}
```

Unknown icon names render the `command` fallback. The custom element injects only `<svg aria-hidden="true"><use href="#rw-i-..."></use></svg>` and cannot accept arbitrary HTML or external URLs.

- [ ] **Step 5: Run GREEN and commit**

```powershell
npm run test:platform55-shell
node --check src/platform55-shell-model.js
node --check src/platform55-icons.js
git diff --check
git add src/platform55-shell-model.js src/platform55-icons.js tests/platform55-shell-contract.test.mjs
git commit -m "feat: add Platform 55 shell model and icons"
```

---

### Task 2: Mount the Shared Tenant Shell with Legacy Compatibility

**Files:**
- Create: `src/platform55-shell.js`
- Create: `src/platform55-shell.css`
- Modify: `src/auth.js`
- Modify: `app.html`
- Modify: `tests/platform55-shell-contract.test.mjs`

**Interfaces:**
- Consumes: shell model/icons from Task 1 and auth/user/access context from `auth.js`.
- Produces: `mountPlatform55Shell`, `updatePlatform55Shell`, and `unmountPlatform55Shell`.

- [ ] **Step 1: Add failing mounting-contract assertions**

Assert:

```js
const appHtml = readFileSync("app.html", "utf8");
const authSource = readFileSync("src/auth.js", "utf8");
const shellSource = readFileSync("src/platform55-shell.js", "utf8");

assert.match(appHtml, /data-platform55-shell="tenant"/);
assert.match(appHtml, /data-platform55-page="app"/);
assert.match(appHtml, /platform55-tokens\.css/);
assert.match(appHtml, /platform55-shell\.css/);
assert.doesNotMatch(appHtml, /<aside class="side-nav"/);
assert.match(authSource, /mountPlatform55Shell/);
assert.match(authSource, /data\.platform55Shell === "tenant"/);
assert.match(authSource, /initLegacySaasShell/);
assert.doesNotMatch(shellSource, /fetch\(|authenticatedFetch|supabase|localStorage\.clear/);
```

- [ ] **Step 2: Run RED**

```powershell
npm run test:platform55-shell
```

Expected: FAIL on missing shell module/CSS and unchanged `app.html`.

- [ ] **Step 3: Implement the semantic scaffold in `app.html`**

The page uses:

```html
<body data-platform55-shell="tenant" data-platform55-page="app">
  <div class="rw-app" data-platform55-app>
    <aside class="rw-sidebar" data-platform55-sidebar aria-label="Rateware navigation"></aside>
    <div class="rw-workspace">
      <header class="rw-topbar" data-platform55-topbar></header>
      <main class="rw-main" id="main-content">
        <div class="rw-page" data-platform55-page-content>
          <!-- Existing Command Center sections retain their IDs. -->
        </div>
      </main>
    </div>
  </div>
</body>
```

Move the existing `#auth-form` into a hidden inert template or let the shell mount move the same live node into the topbar; never duplicate the auth control IDs.

- [ ] **Step 4: Implement shell mounting**

`mountPlatform55Shell` must:

- return without side effects when `data-platform55-shell` is not `tenant`;
- register icons once;
- render tenant/brand/navigation/topbar from the pure model;
- preserve and move the existing auth form node rather than cloning listeners;
- set `aria-current="page"` exactly once;
- restore sidebar state from `rateware:shell-nav-collapsed` with safe try/catch;
- close mobile navigation on Escape and after route selection;
- return focus to the trigger after closing overlays;
- add no API calls or business-action handlers.

Export:

```js
export function mountPlatform55Shell(options) {}
export function updatePlatform55Shell(patch = {}, { root = document } = {}) {}
export function unmountPlatform55Shell({ root = document } = {}) {}
```

- [ ] **Step 5: Split the auth integration**

Rename current `initSaasShell()` to `initLegacySaasShell()`. Add:

```js
function initSaasShell() {
  initGlobalNotifications();
  initUnsavedChangesGuard();
  if (document.body.dataset.platform55Shell === "tenant") {
    mountPlatform55Shell({ pageKey: document.body.dataset.platform55Page });
    return;
  }
  initLegacySaasShell();
}
```

When `renderSession()` receives a signed-in user/access context, call `updatePlatform55Shell({ user, accessContext })`. Unmigrated pages must continue using every existing legacy initializer.

- [ ] **Step 6: Implement shell layout CSS**

Import the token contract and implement exact blueprint anchors:

```css
.rw-app {
  min-height: 100vh;
  display: grid;
  grid-template-columns: var(--rw-sidebar-expanded) minmax(0, 1fr);
}
.rw-topbar { min-height: var(--rw-topbar); }
.rw-app[data-nav-collapsed="true"] {
  grid-template-columns: var(--rw-sidebar-collapsed) minmax(0, 1fr);
}
@media (max-width: 1320px) { /* collapsed tenant nav */ }
@media (max-width: 900px) { /* off-canvas mobile nav */ }
@media (prefers-reduced-motion: reduce) { /* remove transitions */ }
```

Do not copy page-specific prototype CSS into this file.

- [ ] **Step 7: Run GREEN and commit**

```powershell
npm run test:platform55-shell
node --check src/platform55-shell.js
node --check src/auth.js
node --check src/dashboard.js
node tests/rateware-stability.test.mjs
git diff --check
git add src/platform55-shell.js src/platform55-shell.css src/auth.js app.html tests/platform55-shell-contract.test.mjs
git commit -m "feat: mount Platform 55 tenant shell"
```

---

### Task 3: Add Global Search, Notifications, Ask AI, and Header Controls

**Files:**
- Create: `src/platform55-search.js`
- Modify: `src/platform55-shell.js`
- Modify: `src/platform55-shell.css`
- Modify: `tests/platform55-shell-contract.test.mjs`

**Interfaces:**
- Consumes: visible route/action records and access context.
- Produces: route/action-only search overlay and read-only header interactions.

- [ ] **Step 1: Add failing pure search tests**

```js
import { searchShellCommands } from "../src/platform55-search.js";

const results = searchShellCommands("review", {
  routes: PLATFORM55_ROUTES,
  actions: [],
  accessContext: { can: () => true },
  limit: 12
});
assert.equal(results[0].key, "staging-review");
assert.equal(searchShellCommands("<script>", options).length, 0);
assert.ok(searchShellCommands("rate", options).length <= 12);
assert.ok(searchShellCommands("admin", deniedOptions).every((row) => row.requiredAction == null));
```

Assert the module contains no network calls and accepts only route/action records with relative URLs.

- [ ] **Step 2: Run RED**

```powershell
npm run test:platform55-shell
```

- [ ] **Step 3: Implement search and overlay behavior**

Use case-folded token matching over label, group, and keywords. Return immutable result objects. The overlay must support Ctrl/Cmd+K, ArrowUp/Down, Enter, Escape, click-outside close, trapped dialog focus, and focus return. Results only navigate; they do not execute domain mutations.

- [ ] **Step 4: Implement faithful topbar controls**

Render these exact roles:

- global search trigger with shortcut;
- system status pill labeled from a passed read-only status, defaulting to `Status unavailable`, never `Operational` without evidence;
- notification button with unread count from `notificationSummary`, default `0`;
- Ask AI link to `./business-intelligence.html?view=analyst`;
- existing Kinde user/auth form.

Notifications initially show a read-only shell drawer populated from passed summary items. No preference save, mark-read write, or outbound channel action is implemented in P2-S1.

- [ ] **Step 5: Run GREEN and commit**

```powershell
npm run test:platform55-shell
node --check src/platform55-search.js
node --check src/platform55-shell.js
git diff --check
git add src/platform55-search.js src/platform55-shell.js src/platform55-shell.css tests/platform55-shell-contract.test.mjs
git commit -m "feat: add Platform 55 global shell controls"
```

---

### Task 4: Recompose the Command Center Faithfully

**Files:**
- Create: `src/platform55-command-center.css`
- Create: `tests/platform55-command-center.test.mjs`
- Modify: `app.html`
- Modify: `src/dashboard.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing dashboard summaries/actions.
- Produces: approved Next Best Action, Priority Queue, Business Lifecycle, Network Pulse, and My Work composition.

- [ ] **Step 1: Write the failing Command Center contract**

Assert unique presence of:

```js
for (const id of [
  "next-best-action", "priority-queue", "business-lifecycle",
  "network-pulse", "my-work-list"
]) assert.equal((appHtml.match(new RegExp(`id="${id}"`, "g")) || []).length, 1);

assert.match(appHtml, /class="rw-hero/);
assert.match(appHtml, /platform55-command-center\.css/);
assert.match(dashboardSource, /renderNextBestAction/);
assert.match(dashboardSource, /renderPriorityQueue/);
assert.match(dashboardSource, /renderBusinessLifecycle/);
assert.match(dashboardSource, /renderNetworkPulse/);
assert.match(dashboardSource, /renderMyWork/);
assert.doesNotMatch(dashboardSource, /approve|insert_approved|send_bid|dispatch/i);
```

Capture and assert the existing dashboard request/function signatures so visual refactoring cannot silently replace them.

- [ ] **Step 2: Run RED**

```powershell
node tests/platform55-command-center.test.mjs
```

- [ ] **Step 3: Restructure markup while preserving IDs**

Use the approved two-column desktop composition and dark Next Best Action hero. Add only derived presentation containers. Keep action links pointed at existing controlled pages. Use `aria-live="polite"` only on summary regions that update; do not make the entire page live.

- [ ] **Step 4: Refactor renderers without changing data calls**

Split display logic into the five named renderers. Each accepts already-loaded summary data and returns/updates UI only. Missing data shows `Unavailable`/empty states; it never fabricates operational status, counts, money, or readiness.

- [ ] **Step 5: Add focused CSS and test script**

Add:

```json
"test:platform55-command-center": "node tests/platform55-command-center.test.mjs"
```

Append it once to the aggregate `test` script. `platform55-command-center.css` owns only `.rw-command-*`, `.rw-hero`, `.rw-lifecycle`, `.rw-network-pulse`, and `.rw-my-work` selectors.

- [ ] **Step 6: Run GREEN and commit**

```powershell
npm run test:platform55-command-center
npm run test:platform55-shell
node tests/rateware-stability.test.mjs
npm test
git diff --check
git add app.html src/dashboard.js src/platform55-command-center.css tests/platform55-command-center.test.mjs package.json
git commit -m "feat: deliver Platform 55 Command Center"
```

---

### Task 5: Verify Responsive Fidelity and Advance P2 to 25 Percent

**Files:**
- Create: `docs/platform55-evidence/p2-s1/<candidate-sha>/README.md`
- Create: three PNG captures under the same immutable SHA directory
- Create: `docs/release/evidence/2026-08-21-p2-shell-s1-command-center.md`
- Modify: `docs/release/production-readiness-ledger.json`
- Modify: `tests/production-readiness-report.test.mjs`

**Interfaces:**
- Consumes: clean P2-S1 candidate and approved reference screenshot.
- Produces: file-backed evidence plan and General 77.8% / P2 25%.

- [ ] **Step 1: Run local browser verification**

Start the existing dev server and verify `/app.html` at 1440x900, 1024x768, and 390x844. Record:

```js
({
  innerWidth: window.innerWidth,
  scrollWidth: document.documentElement.scrollWidth,
  activeRoute: document.querySelector('[aria-current="page"]')?.textContent.trim(),
  landmarks: [...document.querySelectorAll('aside,header,main')].map((node) => node.tagName),
  privateControls: document.querySelectorAll('[data-platform55-topbar] #auth-form').length
})
```

Expected: `scrollWidth <= innerWidth`, active route `Command Center`, one sidebar/header/main landmark set, one auth form.

- [ ] **Step 2: Exercise accessibility and interactions**

Verify keyboard-only navigation, Ctrl/Cmd+K, focus trapping/return, Escape, collapsed desktop nav, off-canvas mobile nav, reduced motion, search no-result state, notifications empty state, signed-out state, signed-in state, and permission-filtered navigation.

- [ ] **Step 3: Obtain an immutable independent review**

Freeze a clean candidate SHA and create a new detached worktree. The reviewer independently compares the three screenshots, reruns focused/full tests, verifies legacy pages still load, and reports P0/P1/P2 findings. Any P0/P1/P2 finding returns to its owning task and creates a new SHA.

- [ ] **Step 4: Add the evidence plan and ledger test**

P2 `25` must contain:

```json
"scope": ["docs/superpowers/specs/2026-08-21-rateware-platform55-shell-migration-design.md"],
"evidence_plan": [
  "docs/superpowers/plans/2026-08-21-rateware-platform55-shell-p2-master.md",
  "docs/release/evidence/2026-08-21-p2-shell-s1-command-center.md"
]
```

Update the readiness test to expect `77.8` overall.

- [ ] **Step 5: Run final local gates and commit evidence**

```powershell
node tests/production-readiness-report.test.mjs
npm run release:progress
npm run test:platform55-shell
npm run test:platform55-command-center
npm test
npm run validate:action-contract
npm audit --audit-level=low
git diff --check origin/main...HEAD
git status --short
```

Expected: General 77.8%, P2 25%, all checks PASS, clean status after evidence commit.

- [ ] **Step 6: Stop at the external authorization gate**

Report the exact candidate SHA and request authorization for fast-forward push, draft PR, and one Vercel preview. Explicitly state that no Supabase preview branch will be created. Ready/merge/automatic production deployment requires a later, separate authorization after preview and independent GO.
