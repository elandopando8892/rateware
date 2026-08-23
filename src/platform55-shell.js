import { registerPlatform55Icons } from "./platform55-icons.js";
import { shellModel } from "./platform55-shell-model.js";
import { initPlatform55Search } from "./platform55-search.js";

const NAV_STORAGE_KEY = "rateware:shell-nav-collapsed";
const mountedShells = new WeakMap();
const PAGE_STATE_KEYS = new Set(["title", "subtitle", "breadcrumbs", "status", "busy", "actions"]);
const PAGE_ACTION_KEYS = new Set(["id", "label", "status", "busy"]);

function documentFor(root) {
  return root?.nodeType === 9 ? root : root?.ownerDocument || globalThis.document;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function pageStateText(value, field) {
  if (value == null) return "";
  if (!["string", "number"].includes(typeof value)) {
    throw new TypeError(`Platform55 page state ${field} must be text`);
  }
  return String(value).trim();
}

export function normalizePlatform55PageState(input = {}, { allowedActionIds = [] } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Platform55 page state must be an object");
  }
  for (const key of Object.keys(input)) {
    if (!PAGE_STATE_KEYS.has(key)) throw new TypeError(`Unknown Platform55 page state key: ${key}`);
  }
  const allowed = new Set(allowedActionIds);
  const breadcrumbs = input.breadcrumbs == null
    ? []
    : Array.isArray(input.breadcrumbs)
      ? input.breadcrumbs.map((value) => pageStateText(value, "breadcrumb")).filter(Boolean)
      : (() => { throw new TypeError("Platform55 page state breadcrumbs must be an array"); })();
  const actions = input.actions == null
    ? []
    : Array.isArray(input.actions)
      ? input.actions.map((action) => {
          if (!action || typeof action !== "object" || Array.isArray(action)) {
            throw new TypeError("Platform55 page action must be an object");
          }
          for (const key of Object.keys(action)) {
            if (!PAGE_ACTION_KEYS.has(key)) throw new TypeError(`Platform55 page action descriptor keys do not include: ${key}`);
          }
          const id = pageStateText(action.id, "action id");
          if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || !allowed.has(id)) {
            throw new TypeError(`Unknown Platform55 page action: ${id || "(empty)"}`);
          }
          return Object.freeze({
            id,
            label: pageStateText(action.label, "action label"),
            status: pageStateText(action.status, "action status"),
            busy: action.busy === true
          });
        })
      : (() => { throw new TypeError("Platform55 page state actions must be an array"); })();
  return Object.freeze({
    title: pageStateText(input.title, "title"),
    subtitle: pageStateText(input.subtitle, "subtitle"),
    breadcrumbs: Object.freeze(breadcrumbs),
    status: pageStateText(input.status, "status"),
    busy: input.busy === true,
    actions: Object.freeze(actions)
  });
}

export function platform55BreadcrumbText(breadcrumbs = []) {
  return breadcrumbs.join(" · ");
}

function allowedPageActionIds(doc) {
  return [...doc.querySelectorAll("[data-platform55-action]")]
    .map((element) => element.dataset.platform55Action || "")
    .filter(Boolean);
}

function applyPageState(state) {
  const pageState = state.pageState;
  if (!pageState) return;
  const content = state.doc.querySelector("[data-platform55-page-content]");
  if (!content) return;
  const title = content.querySelector("[data-platform55-page-title]");
  const subtitle = content.querySelector("[data-platform55-page-subtitle]");
  const breadcrumbs = content.querySelector("[data-platform55-breadcrumbs]");
  if (title && pageState.title) title.textContent = pageState.title;
  if (subtitle) subtitle.textContent = pageState.subtitle;
  if (breadcrumbs) {
    breadcrumbs.textContent = platform55BreadcrumbText(pageState.breadcrumbs);
  }
  content.setAttribute("aria-busy", String(pageState.busy));
  for (const action of pageState.actions) {
    const element = content.querySelector(`[data-platform55-action="${action.id}"]`);
    if (!element) continue;
    element.dataset.platform55ActionStatus = action.status;
    element.setAttribute("aria-busy", String(action.busy));
    const label = element.querySelector("[data-platform55-action-label]");
    const status = element.querySelector("[data-platform55-action-status]");
    if (label && action.label) label.textContent = action.label;
    if (status) status.textContent = action.status;
  }
}

function groupedNavigation(routes) {
  const groups = new Map();
  for (const route of routes) {
    const rows = groups.get(route.group) || [];
    rows.push(route);
    groups.set(route.group, rows);
  }
  return groups;
}

function navMarkup(model) {
  return [...groupedNavigation(model.navigation)].map(([group, routes]) => `
    <section class="rw-nav-group${routes.some((route) => route.key === model.activeRoute.key) ? " is-active" : ""}">
      <p>${escapeHtml(group)}</p>
      ${routes.map((route) => `
        <a class="rw-nav-link" href="${escapeHtml(route.path)}" title="${escapeHtml(route.label)}"${route.key === model.activeRoute.key ? ' aria-current="page"' : ""}>
          <rw-icon name="${escapeHtml(route.icon)}"></rw-icon>
          <span>${escapeHtml(route.label)}</span>
        </a>`).join("")}
    </section>`).join("");
}

function renderSidebar(state) {
  const { sidebar, model } = state;
  sidebar.innerHTML = `
    <div class="rw-brand-row">
      <a class="rw-brand" href="./app.html" aria-label="Rateware Command Center"><span>R</span><strong>Rateware</strong></a>
      <button class="rw-icon-button rw-mobile-close" type="button" data-platform55-nav-close aria-label="Close navigation"><rw-icon name="close"></rw-icon></button>
    </div>
    <a class="rw-tenant" href="./app.html">
      <span>MX</span>
      <span><strong>MARKSMAN Network</strong><small>Production tenant</small></span>
      <rw-icon name="chevron"></rw-icon>
    </a>
    <button class="rw-nav-collapse" type="button" data-platform55-nav-collapse aria-controls="platform55-navigation">
      <rw-icon name="chevron"></rw-icon><span>Collapse navigation</span>
    </button>
    <nav id="platform55-navigation" class="rw-nav" aria-label="Product navigation">${navMarkup(model)}</nav>
    <div class="rw-sidebar-footer">
      <span>Design state: Command Center</span>
      <small>Platform 55 · P2-S1</small>
    </div>`;
}

function renderTopbar(state) {
  const { topbar, authForm } = state;
  topbar.replaceChildren();
  topbar.insertAdjacentHTML("afterbegin", `
    <button class="rw-icon-button rw-mobile-menu" type="button" data-platform55-nav-open aria-label="Open navigation"><rw-icon name="menu"></rw-icon></button>
    <button class="rw-search-trigger" type="button" data-platform55-search-trigger aria-haspopup="dialog" aria-label="Search modules and actions">
      <rw-icon name="search"></rw-icon><span>Search modules and actions...</span><kbd>Ctrl K</kbd>
    </button>
    <div class="rw-topbar-actions">
      <span class="rw-system-status" data-platform55-system-status><i></i><span>Status unavailable</span></span>
      <button class="rw-icon-button rw-notification-button" type="button" data-platform55-notifications aria-label="Notifications">
        <rw-icon name="bell"></rw-icon><b data-platform55-notification-count hidden>0</b>
      </button>
      <a class="rw-ask-ai" href="./business-intelligence.html?view=analyst" aria-label="Ask AI"><rw-icon name="ai"></rw-icon><span>Ask AI</span></a>
      <div class="rw-auth-slot" data-platform55-auth-slot></div>
    </div>`);
  if (authForm) topbar.querySelector("[data-platform55-auth-slot]")?.append(authForm);
}

function renderNotificationDrawer(state) {
  const items = Array.isArray(state.options.notificationSummary?.items)
    ? state.options.notificationSummary.items.slice(0, 8)
    : [];
  const content = state.notificationDrawer.querySelector("[data-platform55-notification-items]");
  if (!content) return;
  content.innerHTML = items.length
    ? items.map((item) => `
        <article class="rw-notification-item">
          <rw-icon name="${escapeHtml(item.icon || "bell")}"></rw-icon>
          <span><strong>${escapeHtml(item.title || "Notification")}</strong><small>${escapeHtml(item.detail || "No additional detail.")}</small></span>
        </article>`).join("")
    : '<p class="rw-notification-empty">No unread shell notifications.</p>';
}

function createNotificationDrawer(state) {
  const host = state.doc.createElement("aside");
  host.className = "rw-notification-drawer";
  host.dataset.platform55NotificationDrawer = "true";
  host.hidden = true;
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("aria-labelledby", "rw-notification-title");
  host.innerHTML = `
    <header><div><small>Notifications</small><h2 id="rw-notification-title">Current workspace</h2></div><button class="rw-icon-button" type="button" data-platform55-notifications-close aria-label="Close notifications"><rw-icon name="close"></rw-icon></button></header>
    <div data-platform55-notification-items></div>
    <footer>Read-only summary · No notification state is changed here.</footer>`;
  state.doc.body.append(host);
  state.notificationDrawer = host;
  renderNotificationDrawer(state);
}

function closeNotifications(state, { returnFocus = false } = {}) {
  state.notificationDrawer.hidden = true;
  state.notificationDrawer.setAttribute("aria-hidden", "true");
  const trigger = state.topbar.querySelector("[data-platform55-notifications]");
  trigger?.setAttribute("aria-expanded", "false");
  if (returnFocus) trigger?.focus({ preventScroll: true });
}

function openNotifications(state) {
  state.notificationDrawer.hidden = false;
  state.notificationDrawer.setAttribute("aria-hidden", "false");
  state.topbar.querySelector("[data-platform55-notifications]")?.setAttribute("aria-expanded", "true");
  state.notificationDrawer.querySelector("[data-platform55-notifications-close]")?.focus({ preventScroll: true });
}

function readCollapsed(view) {
  try {
    return view?.localStorage?.getItem(NAV_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCollapsed(view, value) {
  try {
    view?.localStorage?.setItem(NAV_STORAGE_KEY, String(value));
  } catch {
    // The current session still supports collapse when browser storage is blocked.
  }
}

function setCollapsed(state, collapsed, persist = false) {
  state.app.dataset.navCollapsed = String(Boolean(collapsed));
  const toggle = state.sidebar.querySelector("[data-platform55-nav-collapse]");
  toggle?.setAttribute("aria-expanded", String(!collapsed));
  toggle?.setAttribute("aria-label", collapsed ? "Expand navigation" : "Collapse navigation");
  if (toggle) toggle.querySelector("span").textContent = collapsed ? "Expand navigation" : "Collapse navigation";
  if (persist) writeCollapsed(state.doc.defaultView, collapsed);
}

export function mobileNavigationAccessibility({ isMobile, isOpen }) {
  const hidden = Boolean(isMobile && !isOpen);
  return {
    ariaHidden: isMobile ? String(hidden) : null,
    inert: hidden
  };
}

function syncMobileNavigationAccessibility(state) {
  const isMobile = Boolean(state.doc.defaultView?.matchMedia?.("(max-width: 900px)").matches);
  const accessibility = mobileNavigationAccessibility({
    isMobile,
    isOpen: state.app.dataset.mobileNavOpen === "true"
  });
  if (accessibility.ariaHidden === null) state.sidebar.removeAttribute("aria-hidden");
  else state.sidebar.setAttribute("aria-hidden", accessibility.ariaHidden);
  state.sidebar.inert = accessibility.inert;
  for (const element of state.sidebar.querySelectorAll("a, button, input, select, textarea, [tabindex]")) {
    if (accessibility.inert) element.setAttribute("tabindex", "-1");
    else element.removeAttribute("tabindex");
  }
}

function closeMobileNavigation(state, { returnFocus = false } = {}) {
  state.app.dataset.mobileNavOpen = "false";
  syncMobileNavigationAccessibility(state);
  state.topbar.querySelector("[data-platform55-nav-open]")?.setAttribute("aria-expanded", "false");
  if (returnFocus) state.mobileTrigger?.focus({ preventScroll: true });
}

function openMobileNavigation(state) {
  state.mobileTrigger = state.doc.activeElement;
  state.app.dataset.mobileNavOpen = "true";
  syncMobileNavigationAccessibility(state);
  state.topbar.querySelector("[data-platform55-nav-open]")?.setAttribute("aria-expanded", "true");
  state.sidebar.querySelector("[data-platform55-nav-close]")?.focus({ preventScroll: true });
}

function bindShell(state) {
  const signal = state.abort.signal;
  state.sidebar.addEventListener("click", (event) => {
    const collapse = event.target.closest("[data-platform55-nav-collapse]");
    if (collapse) setCollapsed(state, state.app.dataset.navCollapsed !== "true", true);
    if (event.target.closest("[data-platform55-nav-close]")) closeMobileNavigation(state, { returnFocus: true });
    if (event.target.closest("a.rw-nav-link")) closeMobileNavigation(state);
  }, { signal });
  state.topbar.addEventListener("click", (event) => {
    if (event.target.closest("[data-platform55-nav-open]")) openMobileNavigation(state);
    if (event.target.closest("[data-platform55-notifications]")) {
      state.notificationDrawer.hidden ? openNotifications(state) : closeNotifications(state, { returnFocus: true });
    }
  }, { signal });
  state.notificationDrawer.addEventListener("click", (event) => {
    if (event.target.closest("[data-platform55-notifications-close]")) closeNotifications(state, { returnFocus: true });
  }, { signal });
  state.scrim.addEventListener("click", () => closeMobileNavigation(state, { returnFocus: true }), { signal });
  state.doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.app.dataset.mobileNavOpen === "true") {
      event.preventDefault();
      closeMobileNavigation(state, { returnFocus: true });
    } else if (event.key === "Escape" && !state.notificationDrawer.hidden) {
      event.preventDefault();
      closeNotifications(state, { returnFocus: true });
    }
  }, { signal });
  state.doc.defaultView?.addEventListener("resize", () => {
    if (!state.doc.defaultView.matchMedia("(max-width: 900px)").matches) {
      state.app.dataset.mobileNavOpen = "false";
      state.topbar.querySelector("[data-platform55-nav-open]")?.setAttribute("aria-expanded", "false");
    }
    syncMobileNavigationAccessibility(state);
  }, { signal });
}

function applyModel(state) {
  const { model, doc } = state;
  const current = state.sidebar.querySelector('[aria-current="page"]');
  if (!current || current.getAttribute("href") !== model.activeRoute.path) renderSidebar(state);
  const userLabel = state.topbar.querySelector("#user-menu-label");
  if (userLabel && state.options.user) userLabel.textContent = model.userLabel;
  const count = state.topbar.querySelector("[data-platform55-notification-count]");
  if (count) {
    count.textContent = String(model.notificationCount);
    count.hidden = model.notificationCount === 0;
  }
  const status = state.topbar.querySelector("[data-platform55-system-status] span");
  if (status) status.textContent = state.pageState?.status || state.options.status || "Status unavailable";
  applyPageState(state);
  renderNotificationDrawer(state);
  doc.title = `Rateware ${model.activeRoute.title}`;
}

export function mountPlatform55Shell({
  pageKey,
  user = null,
  accessContext = {},
  notificationSummary = {},
  status = "",
  pageState = null,
  root = globalThis.document
} = {}) {
  const doc = documentFor(root);
  if (!doc?.body || doc.body.dataset.platform55Shell !== "tenant") return null;
  if (mountedShells.has(doc)) {
    updatePlatform55Shell({ pageKey, user, accessContext, notificationSummary, status }, { root: doc });
    return mountedShells.get(doc);
  }

  const app = doc.querySelector("[data-platform55-app]");
  const sidebar = doc.querySelector("[data-platform55-sidebar]");
  const topbar = doc.querySelector("[data-platform55-topbar]");
  const main = app?.querySelector("main") || doc.querySelector("main");
  if (!app || !sidebar || !topbar || !main) return null;

  registerPlatform55Icons({ root: doc });
  const originalMainId = main.id;
  if (!main.id) main.id = "platform55-main-content";
  const skipLink = doc.createElement("a");
  skipLink.className = "rw-skip-link";
  skipLink.setAttribute("href", `#${main.id}`);
  skipLink.textContent = "Skip to main content";
  doc.body.prepend(skipLink);
  const authForm = doc.querySelector("#auth-form");
  const scrim = doc.createElement("button");
  scrim.type = "button";
  scrim.className = "rw-nav-scrim";
  scrim.setAttribute("aria-label", "Close navigation");
  app.append(scrim);

  const options = { pageKey: pageKey || doc.body.dataset.platform55Page || "app", user, accessContext, notificationSummary, status };
  const state = {
    doc, app, sidebar, topbar, main, originalMainId, skipLink, authForm, scrim, options,
    model: shellModel(options),
    pageState: pageState
      ? normalizePlatform55PageState(pageState, { allowedActionIds: allowedPageActionIds(doc) })
      : null,
    abort: new AbortController(),
    mobileTrigger: null
  };
  mountedShells.set(doc, state);
  renderSidebar(state);
  renderTopbar(state);
  createNotificationDrawer(state);
  setCollapsed(state, readCollapsed(doc.defaultView));
  closeMobileNavigation(state);
  bindShell(state);
  state.search = initPlatform55Search({
    trigger: state.topbar.querySelector("[data-platform55-search-trigger]"),
    routes: state.model.navigation,
    actions: [],
    accessContext: state.options.accessContext,
    root: doc
  });
  applyModel(state);
  app.dataset.platform55ShellRoot = "true";
  return state;
}

export function updatePlatform55Shell(patch = {}, { root = globalThis.document } = {}) {
  const doc = documentFor(root);
  const state = mountedShells.get(doc);
  if (!state) return null;
  const { pageState, ...shellPatch } = patch || {};
  const normalizedPageState = pageState === undefined
    ? state.pageState
    : normalizePlatform55PageState(pageState, { allowedActionIds: allowedPageActionIds(doc) });
  state.options = { ...state.options, ...shellPatch };
  state.pageState = normalizedPageState;
  state.model = shellModel(state.options);
  applyModel(state);
  return state;
}

export function unmountPlatform55Shell({ root = globalThis.document } = {}) {
  const doc = documentFor(root);
  const state = mountedShells.get(doc);
  if (!state) return;
  state.abort.abort();
  state.search?.destroy();
  state.notificationDrawer.remove();
  state.skipLink.remove();
  if (!state.originalMainId) state.main.removeAttribute("id");
  state.sidebar.replaceChildren();
  state.topbar.replaceChildren();
  if (state.authForm) state.topbar.append(state.authForm);
  state.scrim.remove();
  delete state.app.dataset.navCollapsed;
  delete state.app.dataset.mobileNavOpen;
  delete state.app.dataset.platform55ShellRoot;
  mountedShells.delete(doc);
}
