const GUARD_MESSAGE = "You have unsaved changes. Leave this page without saving?";
const READY_FLAG = "__ratewareUnsavedChangesReady";

function isNavigableSameOriginLink(link) {
  if (!link || link.target === "_blank" || link.hasAttribute("download")) return false;
  const href = link.getAttribute("href") || "";
  if (!href || href.startsWith("#") || href.startsWith("javascript:")) return false;
  try {
    return new URL(link.href, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function initUnsavedChangesGuard() {
  if (window[READY_FLAG]) return;
  window[READY_FLAG] = true;

  const dirtyForms = new Set();
  const forms = [...document.querySelectorAll("form[data-unsaved-guard]")];
  const setDirty = (form, dirty = true) => {
    if (!form) return;
    if (dirty) dirtyForms.add(form);
    else dirtyForms.delete(form);
    form.dataset.unsaved = dirty ? "true" : "false";
  };

  forms.forEach((form) => {
    form.dataset.unsaved = "false";
    form.addEventListener("input", (event) => {
      if (!event.target.closest("[data-unsaved-ignore]")) setDirty(form);
    });
    form.addEventListener("change", (event) => {
      if (!event.target.closest("[data-unsaved-ignore]")) setDirty(form);
    });
    form.addEventListener("submit", () => {
      // A successful page transition or the form's own success handler will
      // replace the current state; clear the browser-leave warning now.
      setDirty(form, false);
    });
  });

  window.ratewareMarkFormClean = (formOrId) => {
    const form = typeof formOrId === "string" ? document.getElementById(formOrId) : formOrId;
    setDirty(form, false);
  };

  const clearDirtyForms = () => {
    dirtyForms.clear();
    forms.forEach((form) => { form.dataset.unsaved = "false"; });
  };

  window.ratewareHasUnsavedChanges = () => dirtyForms.size > 0;
  window.ratewareConfirmUnsavedChanges = () => {
    if (!dirtyForms.size || window.confirm(GUARD_MESSAGE)) {
      clearDirtyForms();
      return true;
    }
    return false;
  };

  window.addEventListener("beforeunload", (event) => {
    if (!dirtyForms.size) return;
    event.preventDefault();
    event.returnValue = GUARD_MESSAGE;
    return GUARD_MESSAGE;
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!dirtyForms.size || !isNavigableSameOriginLink(link)) return;
    if (!window.ratewareConfirmUnsavedChanges()) event.preventDefault();
  }, true);
}
