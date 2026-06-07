import createKindeClient from "https://esm.sh/@kinde-oss/kinde-auth-pkce-js";
import { KINDE_CLIENT_ID, KINDE_DOMAIN } from "./config.js";

let kindePromise;

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
      redirect_uri: window.location.origin,
      logout_uri: window.location.origin
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
    await kinde.login({
      app_state: { redirectTo: window.location.pathname }
    });
  });

  signOutButton.addEventListener("click", async () => {
    const kinde = await getKindeClient();
    await kinde.logout();
  });
}
