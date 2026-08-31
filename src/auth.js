import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";
import { humanizeError } from "./error-copy.js";
import { initGlobalNotifications } from "./ui-notifications.js";
import { initUnsavedChangesGuard } from "./unsaved-changes.js";
import { mountPlatform55Shell, updatePlatform55Shell } from "./platform55-shell.js";

const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const SESSION_RECOVERY_ID = "rateware-session-recovery";
let loginPromise;

export function getAuthClient() { return authClient; }

async function getSession() {
  const { data, error } = await authClient.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getAuthToken({ forceRefresh = false } = {}) {
  if (forceRefresh) {
    const { data, error } = await authClient.auth.refreshSession();
    if (error) throw error;
    if (data.session?.access_token) return data.session.access_token;
  }
  const active = await getSession();
  if (!active?.access_token) throw new Error("Log in before using Rateware.");
  return active.access_token;
}

function ensureLoginDialog() {
  let dialog = document.querySelector("#rateware-login-dialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "rateware-login-dialog";
  dialog.className = "rateware-login-dialog";
  dialog.innerHTML = `
    <form class="rateware-login-card">
      <header><div><span class="eyebrow">Rateware workspace</span><h2>Sign in</h2></div><button type="button" data-close class="secondary" aria-label="Close">Close</button></header>
      <p class="rateware-login-copy">Use your authorized Google account to access the Rateware workspace.</p>
      <p data-auth-error role="alert"></p>
      <button value="google" type="submit" class="google-sign-in"><span aria-hidden="true" class="google-mark">G</span>Continue with Google</button>
      <p class="rateware-login-note">Google is used only to verify your identity. Nothing is sent without confirmation.</p>
    </form>`;
  document.body.append(dialog);
  return dialog;
}

export function openLogin({ redirectTo = window.location.href } = {}) {
  if (loginPromise) return loginPromise;
  const dialog = ensureLoginDialog();
  dialog.showModal();
  loginPromise = new Promise((resolve, reject) => {
    const form = dialog.querySelector("form");
    const finish = (value) => {
      form.removeEventListener("submit", submit);
      dialog.close();
      resolve(value);
    };
    const close = () => finish(null);
    dialog.querySelector("[data-close]").addEventListener("click", close, { once: true });
    const submit = async (event) => {
      event.preventDefault();
      const errorNode = dialog.querySelector("[data-auth-error]");
      errorNode.textContent = "";
      try {
        const { data, error } = await authClient.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo }
        });
        if (error) throw error;
        finish(data);
      } catch (error) {
        errorNode.textContent = humanizeError(error);
      }
    };
    form.addEventListener("submit", submit);
  }).finally(() => { loginPromise = null; });
  return loginPromise;
}

function showSessionRecovery() {
  if (document.querySelector(`#${SESSION_RECOVERY_ID}`)) return;
  const banner = document.createElement("aside");
  banner.id = SESSION_RECOVERY_ID;
  banner.className = "session-recovery-banner";
  banner.setAttribute("role", "alert");
  banner.innerHTML = `<div><strong>Session expired</strong><span>Your page is preserved. Sign in again to continue.</span></div><button type="button">Sign in again</button>`;
  banner.querySelector("button").addEventListener("click", openLogin);
  document.body.append(banner);
}

function withBearerToken(init, token) {
  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

export async function authenticatedFetch(input, init = {}) {
  let token;
  try { token = await getAuthToken(); } catch (error) { showSessionRecovery(); throw error; }
  let response = await fetch(input, withBearerToken(init, token));
  if (response.status !== 401) return response;
  const fresh = await getAuthToken({ forceRefresh: true }).catch(() => null);
  if (fresh) response = await fetch(input, withBearerToken(init, fresh));
  if (response.status === 401) showSessionRecovery();
  return response;
}

function accessContext(user) {
  const metadata = user?.app_metadata || {};
  return { claims: metadata, roles: metadata.roles || [], permissions: metadata.permissions || [] };
}

export async function ensureSignedIn() {
  const active = await getSession();
  if (!active?.user) throw new Error("Log in before using Rateware.");
  return { token: active.access_token, user: active.user, access: accessContext(active.user) };
}

export async function getAccessContext() { return (await ensureSignedIn()).access; }

export async function requirePrivatePage() {
  try { return await ensureSignedIn(); }
  catch (error) { window.location.replace("./index.html"); throw error; }
}

export async function canUse() { await ensureSignedIn(); return true; }

export async function applyPermissionState(selector) {
  const allowed = await canUse().catch(() => false);
  document.querySelectorAll(selector).forEach((element) => {
    element.disabled = !allowed;
    element.title = allowed ? "" : "Sign in to use this action.";
    element.classList.toggle("permission-disabled", !allowed);
  });
  return allowed;
}

export function initAuthControls() {
  const form = document.querySelector("#auth-form");
  const authButton = document.querySelector("#auth-button");
  const signOutButton = document.querySelector("#sign-out-button");
  const status = document.querySelector("#auth-status");
  if (!form || !authButton || !signOutButton || !status || form.dataset.authReady === "true") return;
  form.dataset.authReady = "true";
  async function render() {
    const active = await getSession().catch(() => null);
    const signedIn = Boolean(active?.user);
    authButton.classList.toggle("hidden", signedIn);
    signOutButton.classList.toggle("hidden", !signedIn);
    status.textContent = signedIn ? `${active.user.email} | Rateware workspace` : "Sign in with your Rateware account.";
    document.body.dataset.role = signedIn ? "full-access" : "";
    updatePlatform55Shell({ user: active?.user || null, accessContext: signedIn ? accessContext(active.user) : {} });
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try { await openLogin(); await render(); } catch (error) { status.textContent = humanizeError(error); }
  });
  signOutButton.addEventListener("click", async () => {
    if (signOutButton.dataset.openApp !== undefined) { window.location.href = "./app.html"; return; }
    await authClient.auth.signOut();
    await render();
  });
  authClient.auth.onAuthStateChange(() => window.setTimeout(render, 0));
  render();
}

function initShell() {
  initGlobalNotifications();
  initUnsavedChangesGuard();
  if (document.body.dataset.platform55Shell === "tenant") mountPlatform55Shell({ pageKey: document.body.dataset.platform55Page });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initShell, { once: true });
else initShell();
