const HOST_ID = "rateware-notification-host";
const DEFAULT_DURATION = 5200;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getHost() {
  let host = document.getElementById(HOST_ID);
  if (host) return host;

  host = document.createElement("aside");
  host.id = HOST_ID;
  host.className = "notification-host";
  host.setAttribute("aria-label", "Rateware notifications");
  host.setAttribute("aria-live", "polite");
  document.body.append(host);
  return host;
}

export function showNotification(notification, options = {}) {
  const detail = typeof notification === "string" ? { message: notification, ...options } : notification || {};
  const message = String(detail.message || "").trim();
  if (!message) return null;

  const tone = ["success", "warning", "danger", "neutral"].includes(detail.tone) ? detail.tone : "neutral";
  const title = String(detail.title || (tone === "danger" ? "Action failed" : tone === "success" ? "Saved" : "Rateware"));
  const duration = Number.isFinite(Number(detail.duration)) ? Math.max(0, Number(detail.duration)) : DEFAULT_DURATION;
  const item = document.createElement("div");
  item.className = "notification-toast";
  item.dataset.tone = tone;
  item.setAttribute("role", tone === "danger" ? "alert" : "status");
  item.innerHTML = `
    <div class="notification-toast-copy">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(message)}</span>
    </div>
    <button type="button" class="notification-toast-close" aria-label="Dismiss notification">Close</button>
  `;

  const host = getHost();
  const dismiss = () => {
    window.clearTimeout(item._dismissTimer);
    item.classList.add("is-leaving");
    window.setTimeout(() => item.remove(), 180);
  };
  item.querySelector(".notification-toast-close")?.addEventListener("click", dismiss);
  host.append(item);
  window.requestAnimationFrame(() => item.classList.add("is-visible"));
  if (duration > 0) item._dismissTimer = window.setTimeout(dismiss, duration);
  return dismiss;
}

export function initGlobalNotifications() {
  if (window.__ratewareNotificationsReady) return;
  window.__ratewareNotificationsReady = true;

  window.ratewareNotify = (notification, options = {}) => showNotification(notification, options);
  window.addEventListener("rateware:notify", (event) => showNotification(event.detail || {}));
}
