const RELATIVE_PRODUCT_URL = /^\.\/[a-z0-9-]+\.html(?:[?#].*)?$/i;

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .trim();
}

function canShow(record, accessContext) {
  if (record.requiredAction == null) return true;
  return typeof accessContext?.can === "function" && accessContext.can(record.requiredAction) === true;
}

function normalizedRecord(record, kind) {
  const path = record.path || record.href || "";
  if (!RELATIVE_PRODUCT_URL.test(path)) throw new TypeError(`Shell ${kind} URLs must be relative Rateware HTML paths.`);
  return {
    key: String(record.key || ""),
    label: String(record.label || record.title || ""),
    group: String(record.group || (kind === "route" ? "Navigate" : "Action")),
    icon: String(record.icon || "command"),
    path,
    requiredAction: record.requiredAction ?? null,
    keywords: Array.isArray(record.keywords) ? record.keywords.map(String) : [],
    kind
  };
}

function scoreRecord(record, query) {
  const label = normalize(record.label);
  const group = normalize(record.group);
  const keywords = record.keywords.map(normalize);
  if (label === query) return 100;
  if (label.startsWith(query)) return 80;
  if (label.includes(query)) return 60;
  if (keywords.some((keyword) => keyword.startsWith(query))) return 45;
  if (keywords.some((keyword) => keyword.includes(query))) return 35;
  if (group.includes(query)) return 20;
  return 0;
}

export function searchShellCommands(query, {
  routes = [],
  actions = [],
  accessContext = {},
  limit = 12
} = {}) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return Object.freeze([]);
  const boundedLimit = Number.isInteger(limit) ? Math.max(0, Math.min(limit, 50)) : 12;
  const records = [
    ...routes.map((record) => normalizedRecord(record, "route")),
    ...actions.map((record) => normalizedRecord(record, "action"))
  ];

  const results = records
    .filter((record) => canShow(record, accessContext))
    .map((record) => ({ record, score: scoreRecord(record, normalizedQuery) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.record.label.localeCompare(right.record.label))
    .slice(0, boundedLimit)
    .map(({ record }) => Object.freeze({ ...record, keywords: Object.freeze([...record.keywords]) }));
  return Object.freeze(results);
}

function focusableElements(dialog) {
  return [...dialog.querySelectorAll('input, a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function resultRow(record, index, doc) {
  const link = doc.createElement("a");
  link.className = "rw-search-result";
  link.href = record.path;
  link.dataset.shellSearchIndex = String(index);
  link.setAttribute("role", "option");
  link.setAttribute("aria-selected", "false");
  const icon = doc.createElement("rw-icon");
  icon.setAttribute("name", record.icon);
  const copy = doc.createElement("span");
  const label = doc.createElement("strong");
  const group = doc.createElement("small");
  label.textContent = record.label;
  group.textContent = record.group;
  copy.append(label, group);
  link.append(icon, copy);
  return link;
}

export function initPlatform55Search({
  trigger,
  routes = [],
  actions = [],
  accessContext = {},
  root = globalThis.document
} = {}) {
  const doc = root?.nodeType === 9 ? root : root?.ownerDocument || globalThis.document;
  if (!doc?.body || !trigger) return null;
  const existing = doc.querySelector("[data-platform55-search-dialog]");
  if (existing) existing.remove();

  const host = doc.createElement("div");
  host.className = "rw-search-overlay";
  host.dataset.platform55SearchDialog = "true";
  host.hidden = true;
  host.setAttribute("aria-hidden", "true");
  host.innerHTML = `
    <button class="rw-search-backdrop" type="button" data-shell-search-close tabindex="-1" aria-label="Close global search"></button>
    <section class="rw-search-dialog" role="dialog" aria-modal="true" aria-labelledby="rw-search-title">
      <header><div><small>Global search</small><h2 id="rw-search-title">Find a workspace</h2></div><button class="rw-icon-button" type="button" data-shell-search-close aria-label="Close search"><rw-icon name="close"></rw-icon></button></header>
      <label class="rw-search-input"><rw-icon name="search"></rw-icon><span class="sr-only">Search modules and actions</span><input type="search" autocomplete="off" placeholder="Search modules and actions" /></label>
      <div class="rw-search-results" role="listbox" aria-label="Search results"></div>
      <p class="rw-search-hint">Arrow keys move · Enter opens · Escape closes</p>
    </section>`;
  doc.body.append(host);

  const dialog = host.querySelector(".rw-search-dialog");
  const input = host.querySelector("input");
  const results = host.querySelector(".rw-search-results");
  const abort = new AbortController();
  let activeIndex = 0;
  let visible = [];
  let returnTarget = trigger;

  const setActive = (next) => {
    if (!visible.length) return;
    activeIndex = (next + visible.length) % visible.length;
    results.querySelectorAll("[data-shell-search-index]").forEach((row, index) => {
      const active = index === activeIndex;
      row.classList.toggle("is-active", active);
      row.setAttribute("aria-selected", String(active));
      if (active) row.scrollIntoView({ block: "nearest" });
    });
  };

  const render = () => {
    visible = searchShellCommands(input.value, { routes, actions, accessContext, limit: 12 });
    results.replaceChildren();
    if (!input.value.trim()) {
      const note = doc.createElement("p");
      note.className = "rw-search-empty";
      note.textContent = "Start typing to search Rateware workspaces.";
      results.append(note);
      return;
    }
    if (!visible.length) {
      const note = doc.createElement("p");
      note.className = "rw-search-empty";
      note.textContent = "No matching workspace or allowed action.";
      results.append(note);
      return;
    }
    visible.forEach((record, index) => results.append(resultRow(record, index, doc)));
    activeIndex = 0;
    setActive(0);
  };

  const close = ({ restoreFocus = true } = {}) => {
    host.hidden = true;
    host.setAttribute("aria-hidden", "true");
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) returnTarget?.focus({ preventScroll: true });
  };

  const open = () => {
    returnTarget = doc.activeElement || trigger;
    host.hidden = false;
    host.setAttribute("aria-hidden", "false");
    trigger.setAttribute("aria-expanded", "true");
    input.value = "";
    render();
    doc.defaultView?.requestAnimationFrame(() => input.focus());
  };

  trigger.addEventListener("click", open, { signal: abort.signal });
  input.addEventListener("input", render, { signal: abort.signal });
  host.addEventListener("click", (event) => {
    if (event.target.closest("[data-shell-search-close]")) close();
  }, { signal: abort.signal });
  results.addEventListener("click", (event) => {
    if (event.target.closest("[data-shell-search-index]")) close({ restoreFocus: false });
  }, { signal: abort.signal });
  doc.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase("en") === "k") {
      event.preventDefault();
      host.hidden ? open() : close();
      return;
    }
    if (host.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(activeIndex - 1);
    } else if (event.key === "Enter" && doc.activeElement === input && visible[activeIndex]) {
      event.preventDefault();
      results.querySelector(`[data-shell-search-index="${activeIndex}"]`)?.click();
    } else if (event.key === "Tab") {
      const focusable = focusableElements(dialog);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }, { signal: abort.signal });
  render();

  return Object.freeze({ open, close, destroy: () => { abort.abort(); host.remove(); } });
}
