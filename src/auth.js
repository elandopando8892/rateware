import createKindeClient from "https://esm.sh/@kinde-oss/kinde-auth-pkce-js";
import { KINDE_CLIENT_ID, KINDE_DOMAIN } from "./config.js";

let kindePromise;

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
      on_redirect_callback: () => {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    });
  }

  return kindePromise;
}

export async function getKindeToken() {
  const kinde = await getKindeClient();
  const token = await kinde.getToken();
  if (!token) throw new Error("Sign in with Kinde before using Rateware.");
  return token;
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

  return ensureSignedIn();
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

  initProxyActions();
  const userMenu = createUserMenu(form, signOutButton);

  function setStatus(message) {
    status.textContent = message;
  }

  async function renderSession(signedIn, user = null) {
    authButton.classList.toggle("hidden", signedIn);
    signOutButton.classList.toggle("hidden", !signedIn);
    userMenu?.menu.classList.toggle("hidden", !signedIn);

    if (!signedIn) {
      setStatus("Sign in to upload and view source files.");
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
      const signedIn = await kinde.isAuthenticated();
      await renderSession(signedIn, signedIn ? kinde.getUser() : null);
    })
    .catch((error) => {
      authButton.disabled = true;
      setStatus(error.message);
    });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const kinde = await getKindeClient();
    await kinde.login();
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
