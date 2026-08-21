const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const ICON_NAMES = new Set([
  "command", "work", "bell", "search", "ai", "chevron", "menu",
  "close", "check", "warning", "error", "shipper", "carrier", "rfx",
  "review", "rate", "upload", "source", "settings", "catalog", "user"
]);

// Paths are copied from the approved cumulative Platform 55 blueprint. Aliased
// IDs retain the source geometry where the blueprint used a different name.
const SPRITE_MARKUP = `
  <symbol id="rw-i-command" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M14 17h7M17.5 13.5v7"/></symbol>
  <symbol id="rw-i-work" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h5M8 16h7"/><path d="m15 15 1.5 1.5L19 14"/></symbol>
  <symbol id="rw-i-bell" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></symbol>
  <symbol id="rw-i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></symbol>
  <symbol id="rw-i-ai" viewBox="0 0 24 24"><path d="m12 3 1.2 3.2L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3-3.3-1.2 3.3-1.3L12 3Z"/><path d="m18.5 12 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/><path d="m6 14 1 2.5L9.5 18 7 19 6 21.5 5 19l-2.5-1L5 16.5 6 14Z"/></symbol>
  <symbol id="rw-i-chevron" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></symbol>
  <symbol id="rw-i-menu" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></symbol>
  <symbol id="rw-i-close" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></symbol>
  <symbol id="rw-i-check" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></symbol>
  <symbol id="rw-i-warning" viewBox="0 0 24 24"><path d="M12 3 2.5 20h19z"/><path d="M12 9v5M12 17h.01"/></symbol>
  <symbol id="rw-i-error" viewBox="0 0 24 24"><path d="M7 7a7 7 0 0 1 11 2l2-2v6h-6l2-2M17 17A7 7 0 0 1 6 15l-2 2v-6h6l-2 2"/><path d="M12 9v4M12 16h.01"/></symbol>
  <symbol id="rw-i-shipper" viewBox="0 0 24 24"><path d="M4 21V6l8-3v18M12 8h8v13M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2M2 21h20"/></symbol>
  <symbol id="rw-i-carrier" viewBox="0 0 24 24"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></symbol>
  <symbol id="rw-i-rfx" viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h5M9 12h6M9 16h4"/><circle cx="17.5" cy="17.5" r="3.5"/><path d="m20 20 2 2"/></symbol>
  <symbol id="rw-i-review" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h5M8 16h4"/><path d="m15 15 1.5 1.5L20 13"/></symbol>
  <symbol id="rw-i-rate" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 9h10M7 13h5M15 13h2M7 16h3"/></symbol>
  <symbol id="rw-i-upload" viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 14v6h14v-6"/></symbol>
  <symbol id="rw-i-source" viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></symbol>
  <symbol id="rw-i-settings" viewBox="0 0 24 24"><path d="M4 5h16l-6 7v6l-4 2v-8z"/></symbol>
  <symbol id="rw-i-catalog" viewBox="0 0 24 24"><path d="m4 7 5-3 5 3-5 3zM4 7v6l5 3 5-3V7M14 11l3-2 3 2-3 2zM14 11v5l3 2 3-2v-5"/></symbol>
  <symbol id="rw-i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></symbol>`;

function ownerDocument(root) {
  return root?.nodeType === 9 ? root : root?.ownerDocument || globalThis.document;
}

export function registerPlatform55Icons({ root = globalThis.document } = {}) {
  const doc = ownerDocument(root);
  if (!doc?.createElementNS) return;

  if (!doc.querySelector("[data-platform55-icon-sprite]")) {
    const sprite = doc.createElementNS(SVG_NS, "svg");
    sprite.setAttribute("aria-hidden", "true");
    sprite.setAttribute("data-platform55-icon-sprite", "true");
    sprite.setAttribute("style", "display:none");
    const template = doc.createElement("template");
    template.innerHTML = `<svg xmlns="${SVG_NS}">${SPRITE_MARKUP}</svg>`;
    const source = template.content.firstElementChild;
    while (source?.firstChild) sprite.append(source.firstChild);
    (doc.body || doc.documentElement).prepend(sprite);
  }

  const customElements = doc.defaultView?.customElements || globalThis.customElements;
  if (!customElements || customElements.get("rw-icon")) return;
  const HTMLElementBase = doc.defaultView?.HTMLElement || globalThis.HTMLElement;

  customElements.define("rw-icon", class RatewareIcon extends HTMLElementBase {
    connectedCallback() {
      const requested = this.getAttribute("name") || "command";
      const name = ICON_NAMES.has(requested) ? requested : "command";
      this.replaceChildren();
      const svg = doc.createElementNS(SVG_NS, "svg");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
      svg.setAttribute("viewBox", "0 0 24 24");
      const use = doc.createElementNS(SVG_NS, "use");
      const href = `#rw-i-${name}`;
      use.setAttribute("href", href);
      use.setAttributeNS(XLINK_NS, "xlink:href", href);
      svg.append(use);
      this.append(svg);
    }
  });
}
