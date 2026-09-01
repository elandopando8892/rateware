import { initAuthControls, openLogin } from "./auth.js";
import { humanizeError } from "./error-copy.js";

const heroForm = document.querySelector("#hero-auth-form");
const heroButton = document.querySelector("#hero-auth-button");
let heroAuthRunning = false;

heroForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (heroAuthRunning) return;
  heroAuthRunning = true;
  const heroButtonLabel = heroButton?.textContent || "Sign in to Rateware";
  if (heroButton) {
    heroButton.disabled = true;
    heroButton.textContent = "Opening sign-in...";
  }

  try {
    await openLogin({ redirectTo: new URL("./app.html", window.location.href).href });
  } catch (error) {
    heroAuthRunning = false;
    if (heroButton) {
      heroButton.disabled = false;
      heroButton.textContent = humanizeError(error) || heroButtonLabel;
    }
  }
});

initAuthControls();
