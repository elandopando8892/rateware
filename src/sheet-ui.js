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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function columnCellText(cell) {
  const control = cell?.querySelector("input:not([type='hidden']), select, textarea");
  if (control) {
    if (control.type === "checkbox") return control.checked ? "Checked" : "";
    if (control.tagName === "SELECT") {
      return control.selectedOptions?.[0]?.textContent || control.value || "";
    }
    return control.value || "";
  }
  return (cell?.innerText || cell?.textContent || "").trim();
}

function normalizeStoredLayout(raw, columns) {
  const columnKeys = columns.map((column) => column.key);
  const keySet = new Set(columnKeys);
  const isNewLayout = raw && (raw.visibility || raw.order || raw.widths);
  const legacyVisibility = isNewLayout ? {} : raw || {};
  const visibility = { ...(isNewLayout ? raw.visibility || {} : legacyVisibility) };
  const order = Array.isArray(raw?.order)
    ? raw.order.filter((key) => keySet.has(key))
    : [];
  const missing = columnKeys.filter((key) => !order.includes(key));
  return {
    visibility,
    order: [...order, ...missing],
    widths: isNewLayout && raw.widths ? raw.widths : {},
    extra: isNewLayout && raw.extra && typeof raw.extra === "object" ? raw.extra : {}
  };
}

export function initColumnVisibility({ table, menu, columns = [], storageKey = "", viewPresets = [], getExtraState = null, applyExtraState = null }) {
  if (!table || !menu || !columns.length) return;
  const list = menu.querySelector("[data-column-toggle-list]");
  const stored = normalizeStoredLayout(readStoredVisibility(storageKey), columns);
  const viewsStorageKey = storageKey ? `${storageKey}:named-views` : "";
  const activeViewStorageKey = storageKey ? `${storageKey}:active-view` : "";
  const storedViews = readStoredVisibility(viewsStorageKey);
  const storedActiveView = readStoredVisibility(activeViewStorageKey);
  const lockedKeys = new Set(columns.filter((column) => column.locked).map((column) => column.key));
  const columnKeys = new Set(columns.map((column) => column.key));
  const labelRow = table.querySelector("thead tr");
  const visibility = {};
  let order = [...stored.order];
  let widths = { ...stored.widths };
  let draggedColumn = "";
  let resizingColumn = null;
  let layoutStatus = "";
  let savedViews = storedViews && typeof storedViews === "object" && !Array.isArray(storedViews) ? storedViews : {};
  let activeView = storedActiveView && typeof storedActiveView === "object" && !Array.isArray(storedActiveView)
    ? { name: storedActiveView.name || "Custom layout", kind: storedActiveView.kind || "custom" }
    : { name: "Custom layout", kind: "custom" };

  columns.forEach((column) => {
    visibility[column.key] = column.locked ? true : stored.visibility[column.key] !== false;
  });

  function readExtraState() {
    return typeof getExtraState === "function" ? getExtraState() || {} : {};
  }

  function persistLayout() {
    writeStoredVisibility(storageKey, { visibility, order, widths, extra: readExtraState() });
  }

  function persistActiveView() {
    writeStoredVisibility(activeViewStorageKey, activeView);
  }

  function layoutSnapshot() {
    return {
      visibility: { ...visibility },
      order: [...orderedColumns()],
      widths: { ...widths },
      extra: readExtraState()
    };
  }

  function persistNamedViews() {
    writeStoredVisibility(viewsStorageKey, savedViews);
  }

  function viewNames() {
    return Object.keys(savedViews).sort((a, b) => a.localeCompare(b));
  }

  function presetViews() {
    return Array.isArray(viewPresets) ? viewPresets.filter((preset) => preset?.name && preset.layout) : [];
  }

  function activeViewLabel() {
    return activeView?.name || "Custom layout";
  }

  function activeViewMeta() {
    if (activeView?.kind === "named") return "saved view";
    if (activeView?.kind === "starter") return "starter layout";
    return "local layout";
  }

  function setActiveView(name, kind = "custom", status = "") {
    activeView = { name: name || "Custom layout", kind };
    persistActiveView();
    if (status) layoutStatus = status;
    const statusElement = menu.querySelector("[data-column-layout-status]");
    if (status && statusElement) statusElement.textContent = status;
    updateViewIndicator();
  }

  function markCustomLayout(status = "Layout saved") {
    setActiveView("Custom layout", "custom", status);
  }

  function ensureViewIndicator() {
    if (!menu.parentElement) return null;
    let indicator = menu.parentElement.querySelector(`[data-column-active-view="${storageKey}"]`);
    if (!indicator) {
      indicator = document.createElement("button");
      indicator.type = "button";
      indicator.className = "column-active-view";
      indicator.dataset.columnActiveView = storageKey;
      indicator.addEventListener("click", () => {
        menu.open = true;
        list?.querySelector("[data-column-view-name]")?.focus();
      });
      menu.insertAdjacentElement("beforebegin", indicator);
    }
    return indicator;
  }

  function updateViewIndicator() {
    const indicator = ensureViewIndicator();
    if (indicator) {
      indicator.innerHTML = `<span>View</span><strong>${htmlEscape(activeViewLabel())}</strong><small>${htmlEscape(activeViewMeta())}</small>`;
      indicator.title = "Open view settings. Drag headers to reorder, pull header edges to resize, and save named views.";
    }
    const activeName = list?.querySelector("[data-column-active-name]");
    const activeMeta = list?.querySelector("[data-column-active-meta]");
    if (activeName) activeName.textContent = activeViewLabel();
    if (activeMeta) activeMeta.textContent = activeViewMeta();
  }

  function applyStoredLayout(layout) {
    const normalized = normalizeStoredLayout(layout || {}, columns);
    columns.forEach((column) => {
      visibility[column.key] = column.locked ? true : normalized.visibility[column.key] !== false;
    });
    order = [...normalized.order];
    widths = { ...normalized.widths };
    if (typeof applyExtraState === "function") applyExtraState(normalized.extra || {});
    applyVisibility();
  }

  function orderedColumns() {
    const current = order.filter((key) => columnKeys.has(key));
    const missing = columns.map((column) => column.key).filter((key) => !current.includes(key));
    order = [...current, ...missing];
    return order;
  }

  function syncToggleInputs() {
    if (!list) return;
    list.querySelectorAll("[data-column-toggle]").forEach((input) => {
      input.checked = visibility[input.dataset.columnToggle] !== false;
    });
  }

  function renderToggleInputs() {
    if (!list) return;
    const labels = orderedColumns()
      .map((key) => columns.find((column) => column.key === key))
      .filter((column) => column && !column.locked)
      .map((column) => `
        <label>
          <input type="checkbox" data-column-toggle="${column.key}" ${visibility[column.key] !== false ? "checked" : ""} />
          ${column.label}
        </label>
      `)
      .join("");
    list.innerHTML = `
      <div class="column-current-view">
        <span>Active view</span>
        <strong data-column-active-name>${htmlEscape(activeViewLabel())}</strong>
        <small data-column-active-meta>${htmlEscape(activeViewMeta())}</small>
      </div>
      <div class="column-layout-tools">
        <button type="button" data-column-save-layout>Save current</button>
        <button type="button" data-column-autofit>Auto-fit visible</button>
        <button type="button" data-column-reset-layout>Reset default</button>
        <span class="column-layout-status" data-column-layout-status>${layoutStatus}</span>
      </div>
      <div class="column-save-view-row">
        <input data-column-view-name placeholder="Save as named view" value="${activeView.kind === "named" ? htmlEscape(activeView.name) : ""}" />
        <button type="button" data-column-save-named-view>Save named</button>
      </div>
      ${viewNames().length ? `
        <div class="column-saved-views">
          <strong>Saved views</strong>
          ${viewNames().map((name) => `
            <span>
              <button type="button" data-column-apply-view="${htmlEscape(name)}">${htmlEscape(name)}</button>
              <button type="button" data-column-delete-view="${htmlEscape(name)}" aria-label="Delete ${htmlEscape(name)}">x</button>
            </span>
          `).join("")}
        </div>
      ` : ""}
      ${presetViews().length ? `
        <details class="column-starter-views">
          <summary>Starter layouts</summary>
          <div>
            ${presetViews().map((preset) => `
              <button type="button" data-column-apply-preset="${htmlEscape(preset.name)}">${htmlEscape(preset.name)}</button>
            `).join("")}
          </div>
        </details>
      ` : ""}
      <p class="column-layout-help">Drag headers to reorder. Pull the right edge to resize. Double-click a header to auto-fit one column.</p>
      ${labels}
    `;
    updateViewIndicator();
  }

  function setLayoutStatus(message) {
    layoutStatus = message;
    const status = menu.querySelector("[data-column-layout-status]");
    if (status) status.textContent = message;
  }

  function applyOrder() {
    const ordered = orderedColumns();
    table.querySelectorAll("tr").forEach((row) => {
      ordered.forEach((key) => {
        const cell = row.querySelector(`[data-col="${CSS.escape(key)}"]`);
        if (cell) row.appendChild(cell);
      });
    });
  }

  function applyHeaderDragState() {
    labelRow?.querySelectorAll("th[data-col]").forEach((cell) => {
      const key = cell.dataset.col;
      const draggable = key && !lockedKeys.has(key);
      cell.draggable = Boolean(draggable);
      cell.classList.toggle("draggable-column", Boolean(draggable));
      if (draggable) {
        cell.title = "Drag to reorder. Pull the right edge to resize. Double-click to auto-fit this column.";
      }
      ensureResizeHandle(cell);
    });
  }

  function ensureResizeHandle(cell) {
    if (!cell?.dataset?.col || cell.querySelector(":scope > .column-resize-handle")) return;
    const handle = document.createElement("span");
    handle.className = "column-resize-handle";
    handle.dataset.columnResizeHandle = cell.dataset.col;
    handle.setAttribute("aria-hidden", "true");
    cell.appendChild(handle);
  }

  function applyWidths() {
    columns.forEach((column) => {
      const width = Number(widths[column.key]);
      table.querySelectorAll(`[data-col="${CSS.escape(column.key)}"]`).forEach((cell) => {
        if (Number.isFinite(width) && width > 0) {
          cell.style.width = `${width}px`;
          cell.style.minWidth = `${width}px`;
        } else {
          cell.style.removeProperty("width");
          cell.style.removeProperty("min-width");
        }
        cell.style.removeProperty("max-width");
      });
    });
  }

  function applyVisibility() {
    applyOrder();
    columns.forEach((column) => {
      const visible = visibility[column.key] !== false || column.locked;
      table.querySelectorAll(`[data-col="${CSS.escape(column.key)}"]`).forEach((cell) => {
        cell.classList.toggle("column-hidden", !visible);
      });
    });
    applyWidths();
    applyHeaderDragState();
    persistLayout();
    renderToggleInputs();
    syncToggleInputs();
  }

  function visibleKeys() {
    return orderedColumns().filter((key) => visibility[key] !== false || lockedKeys.has(key));
  }

  function measureColumnWidth(key) {
    const canvas = measureColumnWidth.canvas || (measureColumnWidth.canvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    const tableStyle = getComputedStyle(table);
    context.font = `${tableStyle.fontWeight || "400"} ${tableStyle.fontSize || "12px"} ${tableStyle.fontFamily || "Arial"}`;
    const header = labelRow?.querySelector(`[data-col="${CSS.escape(key)}"]`);
    const values = [columnCellText(header)];
    table.querySelectorAll(`tbody [data-col="${CSS.escape(key)}"]`).forEach((cell, index) => {
      if (index < 120) values.push(columnCellText(cell));
    });
    const maxText = values.reduce((max, value) => Math.max(max, context.measureText(String(value || "")).width), 0);
    const isSelect = key === "select";
    const min = columnMinWidth(key);
    const max = columnMaxWidth(key);
    return Math.round(clamp(maxText + (isSelect ? 12 : 22), min, max));
  }

  function columnMinWidth(key) {
    return key === "select" ? 34 : 56;
  }

  function columnMaxWidth(key) {
    return ["origin", "destination", "vendor"].includes(key) ? 360 : 280;
  }

  function autofit(keys = visibleKeys()) {
    keys.forEach((key) => {
      widths[key] = measureColumnWidth(key);
    });
    applyVisibility();
    markCustomLayout("Auto-fit saved");
  }

  function resetLayout() {
    columns.forEach((column) => {
      visibility[column.key] = true;
    });
    order = columns.map((column) => column.key);
    widths = {};
    applyVisibility();
    markCustomLayout("Default saved");
  }

  menu.addEventListener("change", (event) => {
    const input = event.target.closest("[data-column-toggle]");
    if (!input) return;
    visibility[input.dataset.columnToggle] = input.checked;
    applyVisibility();
    markCustomLayout("Layout saved");
  });

  menu.addEventListener("click", (event) => {
    if (event.target.closest("[data-column-save-layout]")) {
      persistLayout();
      markCustomLayout("Saved");
      return;
    }
    if (event.target.closest("[data-column-save-named-view]")) {
      const input = menu.querySelector("[data-column-view-name]");
      const name = String(input?.value || "").trim();
      if (!name) {
        setLayoutStatus("Name required");
        input?.focus();
        return;
      }
      savedViews[name] = { ...layoutSnapshot(), saved_at: new Date().toISOString() };
      persistNamedViews();
      setActiveView(name, "named", "View saved");
      if (input) input.value = "";
      renderToggleInputs();
      return;
    }
    const applyViewButton = event.target.closest("[data-column-apply-view]");
    if (applyViewButton) {
      const name = applyViewButton.dataset.columnApplyView;
      if (!savedViews[name]) return;
      applyStoredLayout(savedViews[name]);
      setActiveView(name, "named", "View applied");
      return;
    }
    const applyPresetButton = event.target.closest("[data-column-apply-preset]");
    if (applyPresetButton) {
      const name = applyPresetButton.dataset.columnApplyPreset;
      const preset = presetViews().find((item) => item.name === name);
      if (!preset) return;
      applyStoredLayout(preset.layout);
      setActiveView(name, "starter", "Layout applied");
      return;
    }
    const deleteViewButton = event.target.closest("[data-column-delete-view]");
    if (deleteViewButton) {
      const name = deleteViewButton.dataset.columnDeleteView;
      delete savedViews[name];
      persistNamedViews();
      renderToggleInputs();
      if (activeView.kind === "named" && activeView.name === name) {
        markCustomLayout("View deleted");
      } else {
        setLayoutStatus("View deleted");
        updateViewIndicator();
      }
      return;
    }
    if (event.target.closest("[data-column-autofit]")) {
      autofit();
      return;
    }
    if (event.target.closest("[data-column-reset-layout]")) {
      resetLayout();
    }
  });

  labelRow?.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-column-resize-handle]");
    if (!handle) return;
    const cell = handle.closest("th[data-col]");
    const key = cell?.dataset.col;
    if (!cell || !key) return;
    event.preventDefault();
    event.stopPropagation();
    resizingColumn = {
      key,
      startX: event.clientX,
      startWidth: cell.getBoundingClientRect().width
    };
    cell.classList.add("is-resizing-column");
    document.body.classList.add("is-column-resizing");

    const onMove = (moveEvent) => {
      if (!resizingColumn) return;
      const nextWidth = clamp(resizingColumn.startWidth + moveEvent.clientX - resizingColumn.startX, columnMinWidth(key), columnMaxWidth(key));
      widths[key] = Math.round(nextWidth);
      applyWidths();
    };

    const onUp = () => {
      if (!resizingColumn) return;
      resizingColumn = null;
      cell.classList.remove("is-resizing-column");
      document.body.classList.remove("is-column-resizing");
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      persistLayout();
      markCustomLayout("Width saved");
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
  });

  labelRow?.addEventListener("dragstart", (event) => {
    const cell = event.target.closest("th[data-col]");
    if (!cell || lockedKeys.has(cell.dataset.col)) return;
    draggedColumn = cell.dataset.col;
    cell.classList.add("is-dragging-column");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedColumn);
  });

  labelRow?.addEventListener("dragover", (event) => {
    const cell = event.target.closest("th[data-col]");
    if (!cell || !draggedColumn || lockedKeys.has(cell.dataset.col)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    labelRow.querySelectorAll(".column-drop-before, .column-drop-after").forEach((item) => {
      item.classList.remove("column-drop-before", "column-drop-after");
    });
    const rect = cell.getBoundingClientRect();
    cell.classList.add(event.clientX < rect.left + rect.width / 2 ? "column-drop-before" : "column-drop-after");
  });

  labelRow?.addEventListener("drop", (event) => {
    const cell = event.target.closest("th[data-col]");
    if (!cell || !draggedColumn) return;
    event.preventDefault();
    const target = cell.dataset.col;
    if (!target || target === draggedColumn || lockedKeys.has(target)) return;
    const nextOrder = orderedColumns().filter((key) => key !== draggedColumn);
    const targetIndex = nextOrder.indexOf(target);
    const rect = cell.getBoundingClientRect();
    const insertAfter = event.clientX >= rect.left + rect.width / 2;
    nextOrder.splice(targetIndex + (insertAfter ? 1 : 0), 0, draggedColumn);
    order = nextOrder;
    applyVisibility();
    markCustomLayout("Order saved");
  });

  labelRow?.addEventListener("dragend", () => {
    draggedColumn = "";
    labelRow.querySelectorAll(".is-dragging-column, .column-drop-before, .column-drop-after").forEach((cell) => {
      cell.classList.remove("is-dragging-column", "column-drop-before", "column-drop-after");
    });
  });

  labelRow?.addEventListener("dblclick", (event) => {
    const cell = event.target.closest("th[data-col]");
    if (!cell?.dataset.col) return;
    autofit([cell.dataset.col]);
  });

  updateViewIndicator();
  renderToggleInputs();
  applyVisibility();
  return { applyVisibility, autofit, resetLayout };
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

function autocompleteKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function locationValue(option) {
  return typeof option === "string" ? option : option.value || option.label || option.raw_value || "";
}

function locationSearchFields(option) {
  if (typeof option === "string") return [option];
  return [
    option.value,
    option.label,
    option.raw_value,
    option.city,
    option.metro_city,
    option.state_code,
    option.state_name,
    option.zip_prefix,
    option.market,
    option.region,
    option.country,
    [option.city, option.state_code].filter(Boolean).join(", "),
    [option.metro_city, option.state_code].filter(Boolean).join(", "),
    [option.city, option.state_name].filter(Boolean).join(", ")
  ].filter(Boolean);
}

function scoreLocation(option, query) {
  const lookup = autocompleteKey(query);
  if (!lookup) return 1;
  const fields = locationSearchFields(option).map(autocompleteKey).filter(Boolean);
  if (fields.some((field) => field === lookup)) return 100;
  if (fields.some((field) => field.startsWith(lookup))) return 86;
  if (fields.some((field) => field.includes(lookup))) return 72;
  if (fields.some((field) => lookup.includes(field) && field.length > 2)) return 58;
  return 0;
}

function locationMatchReason(option, query) {
  const lookup = autocompleteKey(query);
  if (!lookup || typeof option === "string") return "Catalog match";
  const candidates = [
    ["Exact city", option.city],
    ["Exact metro", option.metro_city],
    ["ZIP prefix", option.zip_prefix],
    ["State", option.state_code || option.state_name],
    ["Market", option.market],
    ["Region", option.region],
    ["Alias", option.raw_value || option.label || option.value]
  ];
  const exact = candidates.find(([, value]) => autocompleteKey(value) === lookup);
  if (exact) return exact[0];
  const partial = candidates.find(([, value]) => {
    const key = autocompleteKey(value);
    return key && (key.includes(lookup) || lookup.includes(key));
  });
  return partial ? partial[0] : "Fuzzy catalog match";
}

function locationOptionLabelRich(option) {
  if (typeof option === "string") {
    return { title: option, chips: [], badge: "", reason: "Catalog match" };
  }
  const title = locationValue(option);
  const zipState = [option.zip_prefix, option.state_code || option.state_name].filter(Boolean).join(" / ");
  const chips = [
    zipState ? `ZIP/ST ${zipState}` : "",
    option.market ? `Market ${option.market}` : "",
    option.region ? `Region ${option.region}` : "",
    option.metro_city && option.metro_city !== option.city ? `Metro ${option.metro_city}` : ""
  ].filter(Boolean);
  return {
    title,
    chips,
    badge: option.country || "",
    reason: "Catalog match"
  };
}

export function initLocationAutocomplete({ container, inputSelector, getOptions, onSelect }) {
  if (!container || !inputSelector || !getOptions) return;
  const panel = document.createElement("div");
  panel.className = "location-autocomplete-panel hidden";
  document.body.appendChild(panel);
  let activeInput = null;
  let activeItems = [];
  let activeIndex = -1;

  function hide() {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    activeInput = null;
    activeItems = [];
    activeIndex = -1;
  }

  function positionPanel(input) {
    const rect = input.getBoundingClientRect();
    panel.style.left = `${Math.max(8, rect.left + window.scrollX)}px`;
    panel.style.top = `${rect.bottom + window.scrollY + 4}px`;
    panel.style.width = `${Math.max(300, rect.width)}px`;
  }

  function syncActiveOption() {
    panel.querySelectorAll("[data-location-suggestion]").forEach((button) => {
      const isActive = Number(button.dataset.locationSuggestion) === activeIndex;
      button.classList.toggle("is-active", isActive);
      if (isActive) button.scrollIntoView({ block: "nearest" });
    });
  }

  function selectActiveOption() {
    if (!activeInput || activeIndex < 0) return false;
    const option = activeItems[activeIndex];
    if (!option) return false;
    activeInput.value = locationValue(option);
    onSelect?.({ input: activeInput, option });
    activeInput.dispatchEvent(new Event("input", { bubbles: true }));
    activeInput.dispatchEvent(new Event("change", { bubbles: true }));
    hide();
    return true;
  }

  function render(input) {
    const query = input.value || "";
    const options = getOptions(input) || [];
    activeItems = options
      .map((option) => ({ option, score: scoreLocation(option, query) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || String(locationValue(a.option)).localeCompare(String(locationValue(b.option))))
      .slice(0, 8)
      .map((item) => item.option);

    if (!activeItems.length) {
      activeIndex = -1;
      panel.innerHTML = '<div class="location-autocomplete-empty">No catalog match</div>';
    } else {
      activeIndex = 0;
      panel.innerHTML = activeItems
        .map((option, index) => {
          const label = locationOptionLabelRich(option);
          const reason = locationMatchReason(option, query);
          return `
            <button type="button" data-location-suggestion="${index}">
              <span>
                <strong>${htmlEscape(label.title)}</strong>
                <small>${htmlEscape(reason)}</small>
                <span class="location-autocomplete-chips">
                  ${(label.chips || []).map((chip) => `<b>${htmlEscape(chip)}</b>`).join("")}
                </span>
              </span>
              ${label.badge ? `<em>${htmlEscape(label.badge)}</em>` : ""}
            </button>
          `;
        })
        .join("");
    }
    positionPanel(input);
    panel.classList.remove("hidden");
    syncActiveOption();
  }

  container.addEventListener("focusin", (event) => {
    const input = event.target.closest(inputSelector);
    if (!input) return;
    activeInput = input;
    render(input);
  });

  container.addEventListener("input", (event) => {
    const input = event.target.closest(inputSelector);
    if (!input) return;
    activeInput = input;
    render(input);
  });

  panel.addEventListener("pointerdown", (event) => {
    event.preventDefault();
  });

  panel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-location-suggestion]");
    if (!button || !activeInput) return;
    activeIndex = Number(button.dataset.locationSuggestion);
    selectActiveOption();
  });

  container.addEventListener("keydown", (event) => {
    const input = event.target.closest(inputSelector);
    if (!input || input !== activeInput || panel.classList.contains("hidden")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      hide();
      return;
    }
    if (!activeItems.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      activeIndex = Math.min(activeItems.length - 1, activeIndex + 1);
      syncActiveOption();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      activeIndex = Math.max(0, activeIndex - 1);
      syncActiveOption();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      selectActiveOption();
    }
  }, true);

  document.addEventListener("click", (event) => {
    if (panel.contains(event.target) || event.target.closest(inputSelector)) return;
    hide();
  });

  window.addEventListener("scroll", () => {
    if (activeInput && !panel.classList.contains("hidden")) positionPanel(activeInput);
  }, true);
}
