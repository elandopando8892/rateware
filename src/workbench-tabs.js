export function initWorkbenchTabs(options = {}) {
  const buttonSelector = options.buttonSelector || "[data-workbench-view-button]";
  const panelSelector = options.panelSelector || "[data-workbench-view-panel]";
  const paramName = options.paramName || "view";
  const defaultView = options.defaultView || "dashboard";
  const buttons = [...document.querySelectorAll(buttonSelector)];
  const panels = [...document.querySelectorAll(panelSelector)];

  if (!buttons.length || !panels.length) return null;

  const panelViews = (panel) => String(panel.dataset.workbenchViewPanel || "")
    .split(/[\s,]+/)
    .map((view) => view.trim())
    .filter(Boolean);
  const availableViews = new Set(panels.flatMap(panelViews));

  function activate(view, activateOptions = {}) {
    const nextView = availableViews.has(view) ? view : defaultView;
    panels.forEach((panel) => {
      panel.hidden = !panelViews(panel).includes(nextView);
    });
    buttons.forEach((button) => {
      const isActive = button.dataset.workbenchViewButton === nextView;
      button.classList.toggle("is-active", isActive);
      if (button.getAttribute("role") === "tab") button.setAttribute("aria-selected", String(isActive));
    });
    if (activateOptions.focusTarget) {
      window.requestAnimationFrame(() => document.querySelector(activateOptions.focusTarget)?.focus());
    }
    return nextView;
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const view = activate(button.dataset.workbenchViewButton, { focusTarget: button.dataset.workbenchFocusTarget });
      const url = new URL(window.location.href);
      url.searchParams.set(paramName, view);
      window.history.replaceState({}, "", url);
    });
  });

  return {
    activate,
    current: () => buttons.find((button) => button.classList.contains("is-active"))?.dataset.workbenchViewButton || defaultView,
    initialView: activate(new URLSearchParams(window.location.search).get(paramName) || defaultView)
  };
}
