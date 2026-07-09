import { getKindeClient, initAuthControls } from "./auth.js";
import { humanizeError } from "./error-copy.js";

const heroForm = document.querySelector("#hero-auth-form");
const heroButton = document.querySelector("#hero-auth-button");

heroForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  heroButton.disabled = true;

  try {
    const kinde = await getKindeClient();
    await kinde.login();
  } catch (error) {
    heroButton.disabled = false;
    heroButton.textContent = humanizeError(error);
  }
});

initAuthControls();
