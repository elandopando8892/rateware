import createKindeClient from "https://esm.sh/@kinde-oss/kinde-auth-pkce-js";
import { KINDE_CLIENT_ID, KINDE_DOMAIN } from "./config.js";
import { humanizeError } from "./error-copy.js";

let kindePromise;
let kindeRefreshPromise;

const AUTH_RETURN_URL_KEY = "rateware:kinde-return-url";
const SESSION_RECOVERY_ID = "rateware-session-recovery";

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
  if (!token) throw new Error("Sign in with Kinde before using Rateware.");
  if (tokenExpiresWithin(token, 0)) throw new Error("Sign in with Kinde before using Rateware.");
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
  const returnTo = currentReturnUrl();
  window.sessionStorage.setItem(AUTH_RETURN_URL_KEY, returnTo);
  clearSessionRecovery();

  // A stale PKCE client can report an old local session as authenticated.
  // Start a clean authorization request so Kinde evaluates its browser session.
  kindePromise = null;
  const kinde = await getKindeClient();
  await kinde.login({ app_state: { returnTo } });
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
    throw new Error("Sign in with Kinde before using Rateware.");
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
  initShellNavigation();
  initShellHeader();
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
      setStatus(error.message);
    });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await reauthenticateKinde();
  });

  signOutButton.addEventListener("click", async () => {
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
  });
}
