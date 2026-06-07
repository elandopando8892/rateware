import createKindeClient from "https://esm.sh/@kinde-oss/kinde-auth-pkce-js";
import { KINDE_CLIENT_ID, KINDE_DOMAIN } from "./config.js";

let kindePromise;

function getAppUrl() {
  return `${window.location.origin}/app.html`;
}

function normalizeRole(role) {
  if (!role) return "";
  if (typeof role === "string") return role.toLowerCase();
  return String(role.key || role.name || "").toLowerCase();
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
      on_redirect_callback: () => {}
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
  const signedIn = await kinde.isAuthenticated();

  if (!signedIn) {
    window.location.replace("./index.html");
    throw new Error("Authentication required.");
  }

  return ensureSignedIn();
}

export async function canUse(action) {
  const access = await getAccessContext();
  const roles = access.roles.map(normalizeRole);
  const permissions = access.permissions.map((permission) => String(permission).toLowerCase());

  if (roles.includes("admin") || permissions.includes(action)) return true;

  const roleRules = {
    "uploads:create": ["analyst"],
    "uploads:interpret": ["analyst"],
    "staging:review": ["reviewer", "analyst"],
    "staging:approve": ["reviewer"],
    "dashboard:read": ["admin", "analyst", "reviewer", "viewer"]
  };

  return (roleRules[action] || []).some((role) => roles.includes(role));
}

export async function applyPermissionState(selector, action) {
  const allowed = await canUse(action);
  document.querySelectorAll(selector).forEach((element) => {
    element.disabled = !allowed;
    element.title = allowed ? "" : "Your role does not allow this action.";
  });
  return allowed;
}

export function initAuthControls() {
  const form = document.querySelector("#auth-form");
  const authButton = document.querySelector("#auth-button");
  const signOutButton = document.querySelector("#sign-out-button");
  const status = document.querySelector("#auth-status");

  if (!form || !authButton || !signOutButton || !status) return;

  function setStatus(message) {
    status.textContent = message;
  }

  async function renderSession(signedIn, user = null) {
    authButton.classList.toggle("hidden", signedIn);
    signOutButton.classList.toggle("hidden", !signedIn);

    if (!signedIn) {
      setStatus("Sign in to upload and view source files.");
      return;
    }

    const access = await getAccessContext();
    const role = access.roles[0]?.name || access.roles[0]?.key || access.roles[0] || "user";
    document.body.dataset.role = role;
    setStatus(`${user?.email || "Kinde user"} | ${role}`);
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
