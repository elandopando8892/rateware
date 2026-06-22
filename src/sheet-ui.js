function storageAvailable() {
  try {
    window.localStorage.setItem("__rateware_sheet_test", "1");
    window.localStorage.removeItem("__rateware_sheet_test");
    return true;
  } catch {
    return false;
  }
}

function readStoredVisibility(storageKey) {
  if (!storageKey || !storageAvailable()) return {};
  try {
    return JSON.parse(window.localStorage.getItem(storageKey) || "{}");
  } catch {
    return {};
  }
}

function writeStoredVisibility(storageKey, visibility) {
  if (!storageKey || !storageAvailable()) return;
  window.localStorage.setItem(storageKey, JSON.stringify(visibility));
}

export function initColumnVisibility({ table, menu, columns = [], storageKey = "" }) {
  if (!table || !menu || !columns.length) return;
  const list = menu.querySelector("[data-column-toggle-list]");
  const stored = readStoredVisibility(storageKey);
  const visibility = {};

  columns.forEach((column) => {
    visibility[column.key] = column.locked ? true : stored[column.key] !== false;
  });

  function applyVisibility() {
    columns.forEach((column) => {
      const visible = visibility[column.key] !== false || column.locked;
      table.querySelectorAll(`[data-col="${CSS.escape(column.key)}"]`).forEach((cell) => {
        cell.classList.toggle("column-hidden", !visible);
      });
    });
    writeStoredVisibility(storageKey, visibility);
  }

  if (list) {
    list.innerHTML = columns
      .filter((column) => !column.locked)
      .map((column) => `
        <label>
          <input type="checkbox" data-column-toggle="${column.key}" ${visibility[column.key] !== false ? "checked" : ""} />
          ${column.label}
        </label>
      `)
      .join("");
  }

  menu.addEventListener("change", (event) => {
    const input = event.target.closest("[data-column-toggle]");
    if (!input) return;
    visibility[input.dataset.columnToggle] = input.checked;
    applyVisibility();
  });

  applyVisibility();
  return { applyVisibility };
}

export function initDrawer({ drawer, openButton, closeButton }) {
  if (!drawer) return;
  openButton?.addEventListener("click", () => {
    drawer.classList.remove("hidden");
  });
  closeButton?.addEventListener("click", () => {
    drawer.classList.add("hidden");
  });
}
