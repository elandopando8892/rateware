import { requireSupabase, supabase } from "./supabase-client.js";

export async function getCurrentSession() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function ensureSignedIn() {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error("Sign in before uploading or viewing source files.");
  }
  return session;
}

export function initAuthControls() {
  const form = document.querySelector("#auth-form");
  const emailInput = document.querySelector("#auth-email");
  const authButton = document.querySelector("#auth-button");
  const signOutButton = document.querySelector("#sign-out-button");
  const status = document.querySelector("#auth-status");

  if (!form || !emailInput || !authButton || !signOutButton || !status) return;

  function setStatus(message) {
    status.textContent = message;
  }

  function renderSession(session) {
    const signedIn = Boolean(session);
    emailInput.disabled = signedIn;
    authButton.classList.toggle("hidden", signedIn);
    signOutButton.classList.toggle("hidden", !signedIn);
    setStatus(signedIn ? `Signed in as ${session.user.email}` : "Sign in to upload and view source files.");
  }

  if (!supabase) {
    emailInput.disabled = true;
    authButton.disabled = true;
    setStatus("Supabase is not configured.");
    return;
  }

  getCurrentSession()
    .then(renderSession)
    .catch((error) => setStatus(error.message));

  supabase.auth.onAuthStateChange((_event, session) => {
    renderSession(session);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();

    if (!email) {
      setStatus("Enter an email address.");
      return;
    }

    authButton.disabled = true;
    setStatus("Sending sign-in link...");

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.href
        }
      });
      if (error) throw error;
      setStatus("Check your email for the sign-in link.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      authButton.disabled = false;
    }
  });

  signOutButton.addEventListener("click", async () => {
    await supabase.auth.signOut();
  });
}
