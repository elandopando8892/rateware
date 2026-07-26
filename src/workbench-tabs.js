export function initWorkbenchTabs(options = {}) {
  const buttonSelector = options.buttonSelector || "[data-workbench-view-button]";
  const panelSelector = options.panelSelector || "[data-workbench-view-panel]";
  const paramName = options.paramName || "view";
  const defaultView = options.defaultView || "dashboard";
  const storageKey = options.storageKey || `rateware:workbench:${window.location.pathname}:${paramName}`;
  const buttons = [...document.querySelectorAll(buttonSelector)];
  const panels = [...document.querySelectorAll(panelSelector)];

  if (!buttons.length || !panels.length) return null;

  let lastKnownUrl = new URL(window.location.href);

  const panelViews = (panel) => String(panel.dataset.workbenchViewPanel || "")
    .split(/[\s,]+/)
    .map((view) => view.trim())
    .filter(Boolean);
  const panelViewCache = new Map(panels.map((panel) => [panel, panelViews(panel)]));
  const buttonViews = (button) => [
    ...String(button.dataset.workbenchViewButton || "")
      .split(/[\s,]+/)
      .map((view) => view.trim())
      .filter(Boolean),
    ...String(button.dataset.workbenchViewGroup || "")
      .split(/[\s,]+/)
      .map((view) => view.trim())
      .filter(Boolean)
  ].filter((view, index, views) => views.indexOf(view) === index);
  const slug = (value) => String(value || "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "workbench";
  const idPrefix = `${slug(window.location.pathname)}-${slug(paramName)}`;
  const panelForView = new Map();
  const firstTabForView = new Map();

  // Generate the tab/panel relationships once so every workbench gets the
  // same keyboard and screen-reader contract without duplicating HTML ids.
  panels.forEach((panel, panelIndex) => {
    const views = panelViewCache.get(panel) || [];
    if (!views.length) return;
    if (!panel.id) panel.id = `${idPrefix}-panel-${slug(views[0])}-${panelIndex}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("tabindex", "0");
    views.forEach((view) => {
      const currentPanel = panelForView.get(view);
      const currentViews = currentPanel ? panelViewCache.get(currentPanel) || [] : [];
      if (!currentPanel || views.length < currentViews.length) panelForView.set(view, panel);
    });
  });

  buttons.forEach((button, buttonIndex) => {
    if (button.getAttribute("role") !== "tab") return;
    const views = buttonViews(button);
    if (!views.length) return;
    const primaryView = button.dataset.workbenchActivate || views[0];
    if (!button.id) button.id = `${idPrefix}-tab-${slug(primaryView)}-${buttonIndex}`;
    const controlledPanelIds = views
      .map((view) => panelForView.get(view)?.id)
      .filter(Boolean)
      .filter((id, index, ids) => ids.indexOf(id) === index);
    if (controlledPanelIds.length) button.setAttribute("aria-controls", controlledPanelIds.join(" "));
    views.forEach((view) => {
      if (!firstTabForView.has(view)) firstTabForView.set(view, button.id);
    });
  });

  panels.forEach((panel) => {
    const labelTabId = (panelViewCache.get(panel) || [])
      .map((view) => firstTabForView.get(view))
      .find(Boolean);
    if (labelTabId) panel.setAttribute("aria-labelledby", labelTabId);
  });

  const availableViews = new Set([...panelViewCache.values()].flat());

  const readStoredView = () => {
    try {
      return window.localStorage.getItem(storageKey) || "";
    } catch {
      return "";
    }
  };

  const writeStoredView = (view) => {
    try {
      window.localStorage.setItem(storageKey, view);
    } catch {
      // URL navigation remains the source of truth when storage is blocked.
    }
  };

  function activate(view, activateOptions = {}) {
    const nextView = availableViews.has(view) ? view : defaultView;
    panels.forEach((panel) => {
      const isVisible = (panelViewCache.get(panel) || []).includes(nextView);
      panel.hidden = !isVisible;
      panel.setAttribute("aria-hidden", String(!isVisible));
    });
    buttons.forEach((button) => {
      const isActive = buttonViews(button).includes(nextView);
      button.classList.toggle("is-active", isActive);
      if (button.getAttribute("role") === "tab") {
        button.setAttribute("aria-selected", String(isActive));
        button.tabIndex = isActive ? 0 : -1;
      }
    });
    if (activateOptions.focusTarget) {
      window.requestAnimationFrame(() => document.querySelector(activateOptions.focusTarget)?.focus());
    }
    if (activateOptions.syncUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set(paramName, nextView);
      window.history.replaceState(window.history.state, "", url);
      lastKnownUrl = new URL(url);
      writeStoredView(nextView);
    }
    return nextView;
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      if (window.ratewareConfirmUnsavedChanges && !window.ratewareConfirmUnsavedChanges()) return;
      activate(
        button.dataset.workbenchActivate || String(button.dataset.workbenchViewButton || "").split(/[\s,]+/)[0],
        { focusTarget: button.dataset.workbenchFocusTarget, syncUrl: true }
      );
    });
    button.addEventListener("keydown", (event) => {
      if (button.getAttribute("role") !== "tab") return;
      const navigableButtons = buttons.filter((item) => item.getAttribute("role") === "tab" && !item.disabled);
      const currentIndex = navigableButtons.indexOf(button);
      if (currentIndex < 0) return;
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
      const nextIndex = direction
        ? (currentIndex + direction + navigableButtons.length) % navigableButtons.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? navigableButtons.length - 1
            : -1;
      if (nextIndex < 0 || nextIndex === currentIndex) return;
      event.preventDefault();
      navigableButtons[nextIndex].focus();
      navigableButtons[nextIndex].click();
    });
  });

  const applyBrowserView = () => {
    if (window.ratewareConfirmUnsavedChanges && !window.ratewareConfirmUnsavedChanges()) {
      window.history.pushState(window.history.state, "", lastKnownUrl);
      return;
    }
    const url = new URL(window.location.href);
    const nextView = url.searchParams.has(paramName) ? url.searchParams.get(paramName) : defaultView;
    const resolvedView = activate(nextView);
    lastKnownUrl = new URL(url);
    writeStoredView(resolvedView);
  };
  window.addEventListener("popstate", applyBrowserView);

  const explicitView = new URLSearchParams(window.location.search).get(paramName);
  const initialView = explicitView || readStoredView() || defaultView;
  const resolvedInitialView = activate(initialView);
  writeStoredView(resolvedInitialView);

  return {
    activate,
    current: () => buttons.find((button) => button.classList.contains("is-active"))?.dataset.workbenchViewButton || defaultView,
    initialView: resolvedInitialView
  };
}
