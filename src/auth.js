import createKindeClient from "https://esm.sh/@kinde-oss/kinde-auth-pkce-js";
import { KINDE_CLIENT_ID, KINDE_DOMAIN } from "./config.js";
import { humanizeError } from "./error-copy.js";
import { initGlobalNotifications } from "./ui-notifications.js";
import { initUnsavedChangesGuard } from "./unsaved-changes.js";

let kindePromise;
let kindeRefreshPromise;
let kindeReauthenticationPromise;

const AUTH_RETURN_URL_KEY = "rateware:kinde-return-url";
const SESSION_RECOVERY_ID = "rateware-session-recovery";
const SHELL_NAV_COLLAPSED_KEY = "rateware:shell-nav-collapsed";
const SHELL_FOCUS_MODE_KEY = "rateware:shell-focus-mode";

function getAppUrl() {
  const localHosts = new Set(["localhost", "127.0.0.1"]);
  return `${window.location.origin}${localHosts.has(window.location.hostname) ? "/app.html" : "/app"}`;
}

function parseJwt(token) {
  const [, payload] = token.split(".");
  if (!payload) return {};

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized));
  } catch {
    return {};
  }
}

function hasKindeConfig() {
  return KINDE_DOMAIN && KINDE_CLIENT_ID && !KINDE_DOMAIN.includes("YOUR_SUBDOMAIN") && !KINDE_CLIENT_ID.includes("YOUR_KINDE");
}

export async function getKindeClient() {
  if (!hasKindeConfig()) {
    throw new Error("Kinde is not configured. Update KINDE_DOMAIN and KINDE_CLIENT_ID in src/config.js.");
  }

  if (!kindePromise) {
    kindePromise = createKindeClient({
      client_id: KINDE_CLIENT_ID,
      domain: KINDE_DOMAIN,
      redirect_uri: getAppUrl(),
      logout_uri: window.location.origin,
      is_dangerously_use_local_storage: true,
      on_redirect_callback: (_user, appState = {}) => {
        const returnUrl = safeReturnUrl(appState?.returnTo || window.sessionStorage.getItem(AUTH_RETURN_URL_KEY));
        window.sessionStorage.removeItem(AUTH_RETURN_URL_KEY);
        const cleanUrl = returnUrl || window.location.pathname;
        if (new URL(cleanUrl, window.location.origin).pathname !== window.location.pathname) {
          window.location.replace(cleanUrl);
          return;
        }
        window.history.replaceState({}, document.title, cleanUrl);
      }
    });
  }

  return kindePromise;
}

function safeReturnUrl(value = "") {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return "";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "";
  }
}

function currentReturnUrl() {
  return safeReturnUrl(`${window.location.pathname}${window.location.search}${window.location.hash}`) || getAppUrl();
}

function tokenExpiresWithin(token, seconds = 60) {
  const claims = parseJwt(token);
  const exp = Number(claims.exp || 0);
  if (!exp) return false;
  return exp <= Math.floor(Date.now() / 1000) + seconds;
}

async function readCachedKindeToken(kinde) {
  try {
    return await kinde.getAccessToken?.() || null;
  } catch {
    return null;
  }
}

async function hasUsableKindeSession() {
  const kinde = await getKindeClient();
  if (!(await kinde.isAuthenticated())) return false;

  try {
    await getKindeToken({ minTtlSeconds: 15 });
    return true;
  } catch {
    return false;
  }
}

async function requestFreshKindeToken(rejectedToken = "") {
  if (!kindeRefreshPromise) {
    kindeRefreshPromise = (async () => {
      // Recreating the PKCE client runs Kinde's supported checkAuth/session
      // restore path. getAccessToken itself only reads the cached JWT.
      kindePromise = null;
      const kinde = await getKindeClient();
      if (!(await kinde.isAuthenticated())) return null;

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const token = await readCachedKindeToken(kinde);
        if (token && !tokenExpiresWithin(token, 5) && (!rejectedToken || token !== rejectedToken)) return token;
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }

      const token = await readCachedKindeToken(kinde);
      return token && !tokenExpiresWithin(token, 0) ? token : null;
    })().finally(() => {
      kindeRefreshPromise = null;
    });
  }

  return kindeRefreshPromise;
}

export async function getKindeToken(options = {}) {
  const { forceRefresh = false, minTtlSeconds = 15, rejectedToken = "" } = options;
  const kinde = await getKindeClient();
  let token = forceRefresh ? await requestFreshKindeToken(rejectedToken) : await readCachedKindeToken(kinde);
  if (token && tokenExpiresWithin(token, minTtlSeconds)) {
    token = await requestFreshKindeToken(token) || token;
  }
  if (!token) throw new Error("Log in before using Rateware.");
  if (tokenExpiresWithin(token, 0)) throw new Error("Log in before using Rateware.");
  return token;
}

export class KindeSessionError extends Error {
  constructor(message = "Your session expired. Sign in again to continue.") {
    super(message);
    this.name = "KindeSessionError";
    this.status = 401;
    this.code = "KINDE_SESSION_REQUIRED";
  }
}

function clearSessionRecovery() {
  document.querySelector(`#${SESSION_RECOVERY_ID}`)?.remove();
}

function showSessionRecovery() {
  if (document.querySelector(`#${SESSION_RECOVERY_ID}`)) return;

  const banner = document.createElement("aside");
  banner.id = SESSION_RECOVERY_ID;
  banner.className = "session-recovery-banner";
  banner.setAttribute("role", "alert");
  banner.innerHTML = `
    <div>
      <strong>Session expired</strong>
      <span>Your current page is preserved. Sign in again to continue the action.</span>
    </div>
    <button type="button">Sign in again</button>
  `;
  banner.querySelector("button").addEventListener("click", () => reauthenticateKinde());
  document.body.append(banner);
  window.dispatchEvent(new CustomEvent("rateware:session-required"));
}

export async function reauthenticateKinde() {
  if (kindeReauthenticationPromise) return kindeReauthenticationPromise;
  const returnTo = currentReturnUrl();
  window.sessionStorage.setItem(AUTH_RETURN_URL_KEY, returnTo);
  clearSessionRecovery();

  // A stale PKCE client can report an old local session as authenticated.
  // Start a clean authorization request so Kinde evaluates its browser session.
  kindePromise = null;
  kindeReauthenticationPromise = (async () => {
    const kinde = await getKindeClient();
    await kinde.login({ app_state: { returnTo } });
  })();
  try {
    return await kindeReauthenticationPromise;
  } finally {
    kindeReauthenticationPromise = null;
  }
}

function withBearerToken(init, token) {
  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

export async function authenticatedFetch(input, init = {}, options = {}) {
  const { minTtlSeconds = 15 } = options;
  let token;
  try {
    token = await getKindeToken({ minTtlSeconds });
  } catch (error) {
    showSessionRecovery();
    throw error;
  }

  let response = await fetch(input, withBearerToken(init, token));
  if (response.status !== 401) {
    clearSessionRecovery();
    return response;
  }

  const freshToken = await getKindeToken({
    forceRefresh: true,
    minTtlSeconds,
    rejectedToken: token
  }).catch(() => null);

  if (freshToken) response = await fetch(input, withBearerToken(init, freshToken));
  if (response.status !== 401) {
    clearSessionRecovery();
    return response;
  }

  showSessionRecovery();
  throw new KindeSessionError();
}

export async function ensureSignedIn() {
  const kinde = await getKindeClient();
  const signedIn = await kinde.isAuthenticated();

  if (!signedIn) {
    throw new Error("Log in before using Rateware.");
  }

  return {
    token: await getKindeToken(),
    user: kinde.getUser(),
    access: await getAccessContext()
  };
}

export async function getAccessContext() {
  const token = await getKindeToken();
  const claims = parseJwt(token);
  const roles = claims.roles || claims["https://kinde.com/roles"] || [];
  const permissions = claims.permissions || claims["https://kinde.com/permissions"] || [];

  return {
    claims,
    roles: Array.isArray(roles) ? roles : [],
    permissions: Array.isArray(permissions) ? permissions : []
  };
}

export async function requirePrivatePage() {
  const kinde = await getKindeClient();

  if (new URLSearchParams(window.location.search).has("code")) {
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }

  const signedIn = await kinde.isAuthenticated();
  if (!signedIn) {
    window.location.replace("./index.html");
    throw new Error("Authentication required.");
  }

  try {
    return await ensureSignedIn();
  } catch (error) {
    showSessionRecovery();
    throw error;
  }
}

export async function canUse() {
  await ensureSignedIn();
  return true;
}

export async function applyPermissionState(selector, action) {
  const allowed = await canUse(action);
  document.querySelectorAll(selector).forEach((element) => {
    element.disabled = !allowed;
    element.title = allowed ? "" : "Sign in to use this action.";
    element.classList.toggle("permission-disabled", !allowed);
  });
  return allowed;
}

function getUserInitials(user) {
  const source = user?.given_name || user?.name || user?.email || "RW";
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "RW";
}

function getUserLabel(user) {
  const email = user?.email || "Kinde user";
  const [name] = email.split("@");
  return name || email;
}

const SHELL_NAV_GROUPS = [
  {
    title: "Operate",
    items: [
      { id: "command", code: "CC", label: "Command Center", href: "./app.html" },
      { id: "import", code: "IM", label: "Import", href: "./upload-center.html" },
      { id: "sources", code: "SF", label: "Source Files", href: "./upload-history.html" },
      { id: "review", code: "RQ", label: "Review Queue", href: "./staging-review.html" },
      { id: "rateware", code: "RW", label: "Rateware", href: "./rateware.html" }
    ]
  },
  {
    title: "Analyze",
    items: [{ id: "analyze", code: "AN", label: "Analyze", href: "./business-intelligence.html" }]
  },
  {
    title: "Source",
    items: [
      { id: "crm", code: "CM", label: "Carrier CRM", href: "./vendors.html" },
      { id: "shipper-crm", code: "SM", label: "Shipper CRM", href: "./shipper-crm.html" },
      { id: "rfx-process", code: "RP", label: "RFx Process", href: "./rfx-process.html" },
      { id: "ratebook", code: "RB", label: "Ratebook", href: "./ratebook.html" },
      { id: "rfx", code: "BR", label: "Bid Room", href: "./rfx-events.html" },
      { id: "support", code: "VS", label: "Vendor Support", href: "./vendor-support.html" },
      { id: "improvement", code: "CI", label: "Vendor CI", href: "./vendor-improvement.html" }
    ]
  },
  {
    title: "Admin",
    items: [
      { id: "settings", code: "ST", label: "Settings", href: "./settings.html" },
      { id: "memory", code: "LR", label: "Learning Rules", href: "./interpretation-memory.html" },
      { id: "catalog", code: "CT", label: "Catalog", href: "./catalog-workbench.html" }
    ]
  }
];

const PAGE_META = {
  app: {
    title: "Command Center",
    eyebrow: "Procurement command center",
    crumbs: [{ label: "Command" }, { label: "Today" }]
  },
  "upload-center": {
    title: "Import",
    eyebrow: "Source intake",
    crumbs: [{ label: "Operate", href: "./app.html" }, { label: "Import" }]
  },
  "upload-history": {
    title: "Source Files",
    eyebrow: "Source archive",
    crumbs: [
      { label: "Operate", href: "./app.html" },
      { label: "Import", href: "./upload-center.html" },
      { label: "Source Files" }
    ]
  },
  "staging-review": {
    title: "Review Queue",
    eyebrow: "Human approval required",
    crumbs: [
      { label: "Operate", href: "./app.html" },
      { label: "Source Files", href: "./upload-history.html" },
      { label: "Review Queue" }
    ]
  },
  rateware: {
    title: "Rateware",
    eyebrow: "Approved rate book",
    crumbs: [
      { label: "Operate", href: "./app.html" },
      { label: "Review Queue", href: "./staging-review.html" },
      { label: "Rateware" }
    ]
  },
  "business-intelligence": {
    title: "Analyze",
    eyebrow: "Commercial intelligence",
    crumbs: [{ label: "Analyze", href: "./app.html" }, { label: "Workbench" }]
  },
  vendors: {
    title: "Carrier CRM",
    eyebrow: "Carrier master",
    crumbs: [{ label: "Source", href: "./app.html" }, { label: "Carrier CRM" }]
  },
  "shipper-crm": {
    title: "Shipper CRM",
    eyebrow: "Customer master",
    crumbs: [{ label: "Source", href: "./app.html" }, { label: "Shipper CRM" }]
  },
  "rfx-process": {
    title: "RFx Process",
    eyebrow: "Procurement design",
    crumbs: [
      { label: "Source", href: "./app.html" },
      { label: "Carrier CRM", href: "./vendors.html" },
      { label: "RFx Process" }
    ]
  },
  ratebook: {
    title: "Ratebook",
    eyebrow: "RFx route books",
    crumbs: [
      { label: "Source", href: "./app.html" },
      { label: "Shipper CRM", href: "./shipper-crm.html" },
      { label: "Ratebook" }
    ]
  },
  "rfx-events": {
    title: "Bid Room",
    eyebrow: "Private procurement room",
    crumbs: [
      { label: "Source", href: "./app.html" },
      { label: "Carrier CRM", href: "./vendors.html" },
      { label: "Bid Room" }
    ]
  },
  "vendor-support": {
    title: "Vendor Support",
    eyebrow: "Carrier assistance",
    crumbs: [
      { label: "Source", href: "./app.html" },
      { label: "Carrier CRM", href: "./vendors.html" },
      { label: "Vendor Support" }
    ]
  },
  "vendor-improvement": {
    title: "Vendor Continuous Improvement",
    eyebrow: "Vendor relationship management",
    crumbs: [
      { label: "Source", href: "./app.html" },
      { label: "Carrier CRM", href: "./vendors.html" },
      { label: "Vendor CI" }
    ]
  },
  outreach: {
    title: "Invitation Admin",
    eyebrow: "Templates and draft queue",
    crumbs: [
      { label: "Source", href: "./app.html" },
      { label: "Bid Room", href: "./rfx-events.html" },
      { label: "Invitation Admin" }
    ]
  },
  settings: {
    title: "Settings",
    eyebrow: "Workspace control",
    crumbs: [{ label: "Admin", href: "./app.html" }, { label: "Settings" }]
  },
  "interpretation-memory": {
    title: "Learning Rules",
    eyebrow: "AI interpretation memory",
    crumbs: [{ label: "Admin", href: "./settings.html" }, { label: "Learning Rules" }]
  },
  "catalog-workbench": {
    title: "Catalog",
    eyebrow: "Normalization control",
    crumbs: [{ label: "Admin", href: "./settings.html" }, { label: "Catalog" }]
  }
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getPageKey(pathname = window.location.pathname) {
  const raw = pathname.split("/").filter(Boolean).pop() || "app";
  return raw.replace(/\.html$/i, "") || "app";
}

function getHrefKey(href) {
  try {
    return getPageKey(new URL(href, window.location.href).pathname);
  } catch {
    return "";
  }
}

function isCurrentShellItem(item) {
  const current = getPageKey();
  const itemKey = getHrefKey(item.href);
  return itemKey === current || (current === "app" && itemKey === "app");
}

function renderShellCrumbs(crumbs = []) {
  return crumbs
    .map((crumb) => {
      const label = escapeHtml(crumb.label);
      return crumb.href ? `<a href="${escapeHtml(crumb.href)}">${label}</a>` : `<span>${label}</span>`;
    })
    .join("");
}

function initCommandPalette() {
  const shell = document.querySelector(".shell-layout");
  const sideNav = shell?.querySelector(".side-nav");
  if (!shell || !sideNav || document.querySelector("[data-command-palette]") || document.querySelector("[data-command-palette-trigger]")) return;

  const commands = SHELL_NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({ ...item, group: group.title }))
  );

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "shell-quick-open";
  trigger.dataset.commandPaletteTrigger = "true";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.innerHTML = '<span>Quick open</span><kbd>Ctrl+K</kbd>';
  sideNav.insertBefore(trigger, sideNav.querySelector(".nav-groups"));

  const palette = document.createElement("div");
  palette.className = "command-palette hidden";
  palette.dataset.commandPalette = "true";
  palette.setAttribute("aria-hidden", "true");
  palette.innerHTML = `
    <div class="command-palette-backdrop" data-command-close></div>
    <section class="command-palette-dialog" role="dialog" aria-modal="true" aria-labelledby="command-palette-title">
      <div class="command-palette-header">
        <div>
          <p class="eyebrow">Navigate</p>
          <h2 id="command-palette-title">Quick open</h2>
        </div>
        <button type="button" class="secondary small-button" data-command-close aria-label="Close quick open">Esc</button>
      </div>
      <label class="command-palette-search">
        <span class="sr-only">Search Rateware modules</span>
        <input type="search" data-command-search placeholder="Search modules" autocomplete="off" />
      </label>
      <div class="command-palette-results" data-command-results role="listbox" aria-label="Rateware modules"></div>
      <p class="command-palette-hint">Use arrow keys to move and Enter to open.</p>
    </section>
  `;
  document.body.append(palette);

  const search = palette.querySelector("[data-command-search]");
  const results = palette.querySelector("[data-command-results]");
  let visibleCommands = commands;
  let activeIndex = 0;

  const renderResults = () => {
    const query = String(search?.value || "").trim().toLowerCase();
    visibleCommands = commands.filter((command) => `${command.label} ${command.group}`.toLowerCase().includes(query));
    activeIndex = Math.min(activeIndex, Math.max(visibleCommands.length - 1, 0));
    if (!results) return;
    results.innerHTML = visibleCommands.length
      ? visibleCommands
          .map(
            (command, index) => `
              <a class="command-palette-item${index === activeIndex ? " is-active" : ""}" href="${escapeHtml(command.href)}" role="option" aria-selected="${index === activeIndex}" data-command-index="${index}">
                <span><strong>${escapeHtml(command.label)}</strong><small>${escapeHtml(command.group)}</small></span>
                <b>${escapeHtml(command.code)}</b>
              </a>
            `
          )
          .join("")
      : '<p class="command-palette-empty">No matching module.</p>';
  };

  const close = () => {
    palette.classList.add("hidden");
    palette.setAttribute("aria-hidden", "true");
    trigger.setAttribute("aria-expanded", "false");
  };

  const open = () => {
    palette.classList.remove("hidden");
    palette.setAttribute("aria-hidden", "false");
    trigger.setAttribute("aria-expanded", "true");
    activeIndex = 0;
    if (search) search.value = "";
    renderResults();
    window.requestAnimationFrame(() => search?.focus());
  };

  trigger.addEventListener("click", open);
  search?.addEventListener("input", () => {
    activeIndex = 0;
    renderResults();
  });
  results?.addEventListener("click", (event) => {
    const item = event.target.closest("[data-command-index]");
    if (item) close();
  });
  palette.addEventListener("click", (event) => {
    if (event.target.closest("[data-command-close]")) close();
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      palette.classList.contains("hidden") ? open() : close();
      return;
    }
    if (palette.classList.contains("hidden")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" && visibleCommands.length) {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % visibleCommands.length;
      renderResults();
    } else if (event.key === "ArrowUp" && visibleCommands.length) {
      event.preventDefault();
      activeIndex = (activeIndex - 1 + visibleCommands.length) % visibleCommands.length;
      renderResults();
    } else if (event.key === "Enter" && visibleCommands[activeIndex]) {
      event.preventDefault();
      window.location.href = visibleCommands[activeIndex].href;
    }
  });
  renderResults();
}

function initFocusMode() {
  const shell = document.querySelector(".shell-layout");
  const actions = document.querySelector(".page-header-actions");
  if (!shell || !actions || actions.querySelector("[data-shell-focus-toggle]")) return;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "shell-focus-toggle secondary";
  toggle.dataset.shellFocusToggle = "true";
  toggle.setAttribute("aria-pressed", "false");
  actions.prepend(toggle);

  const readFocusMode = () => {
    try {
      return window.localStorage.getItem(SHELL_FOCUS_MODE_KEY) === "true";
    } catch {
      return false;
    }
  };

  const writeFocusMode = (enabled) => {
    try {
      window.localStorage.setItem(SHELL_FOCUS_MODE_KEY, String(enabled));
    } catch {
      // The current page still supports focus mode when storage is blocked.
    }
  };

  const applyFocusMode = (enabled, persist = false) => {
    shell.classList.toggle("shell-focus-mode", enabled);
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.setAttribute("aria-label", enabled ? "Exit focus mode" : "Enter focus mode");
    toggle.title = enabled ? "Exit focus mode" : "Maximize workspace";
    toggle.textContent = enabled ? "Exit focus" : "Focus";
    if (persist) writeFocusMode(enabled);
  };

  toggle.addEventListener("click", () => applyFocusMode(!shell.classList.contains("shell-focus-mode"), true));
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      applyFocusMode(!shell.classList.contains("shell-focus-mode"), true);
    }
  });
  applyFocusMode(readFocusMode());
}

function initShellNavigation() {
  const nav = document.querySelector(".side-nav .nav-groups");
  if (!nav) return;

  nav.innerHTML = SHELL_NAV_GROUPS.map(
    (group) => `
      <section class="nav-group" data-nav-section="${escapeHtml(group.title.toLowerCase())}">
        <p>${escapeHtml(group.title)}</p>
        ${group.items
          .map(
            (item) => `
              <a${isCurrentShellItem(item) ? ' aria-current="page"' : ""} href="${escapeHtml(item.href)}" data-nav-id="${escapeHtml(item.id)}" data-nav-code="${escapeHtml(item.code)}">${escapeHtml(item.label)}</a>
            `
          )
          .join("")}
      </section>
    `
  ).join("");

  const sideNav = nav.closest(".side-nav");
  const shell = sideNav?.closest(".shell-layout");
  if (!sideNav || !shell) return;

  nav.id = nav.id || "rateware-shell-nav";
  nav.querySelectorAll("a[data-nav-code]").forEach((link) => {
    if (!link.title) link.title = link.textContent.trim();
  });

  const activeGroup = nav.querySelector(".nav-group a[aria-current=\"page\"]")?.closest(".nav-group");
  nav.querySelectorAll(".nav-group").forEach((group) => group.classList.toggle("is-active", group === activeGroup));

  let toggle = sideNav.querySelector("[data-shell-nav-toggle]");
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "side-nav-toggle";
    toggle.dataset.shellNavToggle = "true";
    toggle.setAttribute("aria-controls", nav.id);
    sideNav.insertBefore(toggle, nav);
  }

  const readCollapsed = () => {
    try {
      return window.localStorage.getItem(SHELL_NAV_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  };

  const writeCollapsed = (collapsed) => {
    try {
      window.localStorage.setItem(SHELL_NAV_COLLAPSED_KEY, String(collapsed));
    } catch {
      // The layout still works for the current session when storage is blocked.
    }
  };

  const applyCollapsed = (collapsed, persist = false) => {
    shell.classList.toggle("shell-nav-collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-label", collapsed ? "Expand navigation" : "Collapse navigation");
    toggle.title = collapsed ? "Expand navigation" : "Collapse navigation";
    toggle.textContent = collapsed ? "Expand" : "Collapse";
    if (persist) writeCollapsed(collapsed);
  };

  if (toggle.dataset.shellNavReady !== "true") {
    toggle.dataset.shellNavReady = "true";
    toggle.addEventListener("click", () => applyCollapsed(!shell.classList.contains("shell-nav-collapsed"), true));
  }
  applyCollapsed(readCollapsed());
}

function initShellHeader() {
  const meta = PAGE_META[getPageKey()];
  if (!meta) return;

  const header = document.querySelector(".page-header");
  const h1 = header?.querySelector("h1");
  const eyebrow = header?.querySelector(".eyebrow");
  const crumbs = header?.querySelector(".module-crumbs");

  if (h1) h1.textContent = meta.title;
  if (eyebrow) eyebrow.textContent = meta.eyebrow;
  if (crumbs) crumbs.innerHTML = renderShellCrumbs(meta.crumbs);
  document.title = `Rateware ${meta.title}`;
}

function initSaasShell() {
  initGlobalNotifications();
  initUnsavedChangesGuard();
  initShellNavigation();
  initShellHeader();
  initCommandPalette();
  initFocusMode();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSaasShell, { once: true });
} else {
  initSaasShell();
}

function initProxyActions() {
  document.querySelectorAll("[data-click-target]").forEach((button) => {
    if (button.dataset.proxyReady === "true") return;
    button.dataset.proxyReady = "true";
    button.addEventListener("click", () => {
      const target = document.querySelector(button.dataset.clickTarget);
      if (!target) return;
      target.click();
      if (typeof target.focus === "function") target.focus({ preventScroll: true });
    });
  });
}

function createUserMenu(form, signOutButton) {
  if (!form.classList.contains("auth-strip")) return null;

  let menu = form.querySelector(".user-menu");
  if (!menu) {
    menu = document.createElement("div");
    menu.className = "user-menu hidden";
    menu.innerHTML = `
      <button id="user-menu-button" class="user-menu-button" type="button" aria-haspopup="true" aria-expanded="false">
        <span id="user-menu-initials" class="user-avatar">RW</span>
        <span id="user-menu-label">User</span>
      </button>
      <div id="user-menu-panel" class="user-menu-panel hidden" role="menu">
        <div class="user-menu-summary">
          <strong id="user-menu-email">-</strong>
          <span id="user-menu-access">Full access</span>
        </div>
        <a href="./settings.html" role="menuitem">Settings</a>
        <div data-sign-out-slot></div>
      </div>
    `;
    form.appendChild(menu);
  }

  const signOutSlot = menu.querySelector("[data-sign-out-slot]");
  if (signOutSlot && !signOutSlot.contains(signOutButton)) {
    signOutSlot.appendChild(signOutButton);
  }

  signOutButton.classList.add("user-menu-sign-out");

  const button = menu.querySelector("#user-menu-button");
  const panel = menu.querySelector("#user-menu-panel");

  function closeMenu() {
    panel.classList.add("hidden");
    button.setAttribute("aria-expanded", "false");
  }

  if (button.dataset.menuReady !== "true") {
    button.dataset.menuReady = "true";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = panel.classList.toggle("hidden");
      button.setAttribute("aria-expanded", String(!open));
    });
    document.addEventListener("click", (event) => {
      if (!menu.contains(event.target)) closeMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });
  }

  return {
    menu,
    label: menu.querySelector("#user-menu-label"),
    initials: menu.querySelector("#user-menu-initials"),
    email: menu.querySelector("#user-menu-email"),
    access: menu.querySelector("#user-menu-access")
  };
}

export function initAuthControls() {
  const form = document.querySelector("#auth-form");
  const authButton = document.querySelector("#auth-button");
  const signOutButton = document.querySelector("#sign-out-button");
  const status = document.querySelector("#auth-status");

  if (!form || !authButton || !signOutButton || !status) return;
  if (form.dataset.authReady === "true") return;
  form.dataset.authReady = "true";

  initProxyActions();
  const userMenu = createUserMenu(form, signOutButton);
  let authControlActionRunning = false;

  function setStatus(message) {
    status.textContent = humanizeError(message);
  }

  async function renderSession(signedIn, user = null, { expired = false } = {}) {
    authButton.classList.toggle("hidden", signedIn);
    signOutButton.classList.toggle("hidden", !signedIn);
    userMenu?.menu.classList.toggle("hidden", !signedIn);

    if (!signedIn) {
      document.body.dataset.role = "";
      setStatus(expired ? "Your session expired. Sign in again to continue." : "Sign in to upload and view source files.");
      return;
    }

    document.body.dataset.role = "full-access";
    if (userMenu) {
      const email = user?.email || "Kinde user";
      userMenu.initials.textContent = getUserInitials(user);
      userMenu.label.textContent = getUserLabel(user);
      userMenu.email.textContent = email;
      userMenu.access.textContent = "Full access";
    }
    setStatus(`${user?.email || "Kinde user"} | full access`);
  }

  getKindeClient()
    .then(async (kinde) => {
      const locallyAuthenticated = await kinde.isAuthenticated();
      const signedIn = locallyAuthenticated && await hasUsableKindeSession();
      await renderSession(signedIn, signedIn ? kinde.getUser() : null, {
        expired: locallyAuthenticated && !signedIn
      });
      if (locallyAuthenticated && !signedIn) showSessionRecovery();
    })
    .catch((error) => {
      authButton.disabled = true;
      setStatus(error);
    });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (authControlActionRunning) return;
    authControlActionRunning = true;
    authButton.disabled = true;
    const authButtonLabel = authButton.textContent || "Log in";
    authButton.textContent = "Opening sign-in...";
    try {
      await reauthenticateKinde();
    } catch (error) {
      authButton.textContent = authButtonLabel;
      setStatus(error);
    } finally {
      authControlActionRunning = false;
      authButton.disabled = false;
    }
  });

  signOutButton.addEventListener("click", async () => {
    if (authControlActionRunning) return;
    authControlActionRunning = true;
    signOutButton.disabled = true;
    try {
      if (signOutButton.dataset.openApp !== undefined) {
        window.location.href = "./app.html";
        return;
      }

      const kinde = await getKindeClient();
      if (await kinde.isAuthenticated()) {
        await kinde.logout();
        return;
      }

      window.location.href = "./app.html";
    } catch (error) {
      setStatus(error);
    } finally {
      authControlActionRunning = false;
      signOutButton.disabled = false;
    }
  });
}
