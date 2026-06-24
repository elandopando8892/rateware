const BLANK_LABEL = "(blank)";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function valueLabel(value) {
  const label = String(value ?? "").trim();
  return label || BLANK_LABEL;
}

function valueKey(value) {
  return valueLabel(value).toLowerCase();
}

function uniqueValues(rows, field, getValues) {
  const seen = new Map();
  rows.forEach((row) => {
    const values = getValues(row, field);
    const list = values.length ? values : [BLANK_LABEL];
    list.forEach((value) => {
      const label = valueLabel(value);
      const key = valueKey(label);
      if (!seen.has(key)) seen.set(key, label);
    });
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function initSpreadsheetColumnFilters({ table, columns = [], getRows, getValues, getMenuValues = null, onChange, scope = "sheet" }) {
  if (!table || !columns.length) return null;

  const state = new Map();
  const filterableColumns = columns.filter((column) => column.key !== "select" && column.filterable !== false);
  const header = table.querySelector("thead");
  const labelRow = header?.querySelector("tr");
  const filterRow = document.createElement("tr");
  const popover = document.createElement("div");
  let activeMenu = null;
  let menuRequestId = 0;

  filterRow.className = "sheet-column-filter-row";
  filterRow.innerHTML = columns.map((column) => {
    if (column.key === "select") {
      return `<th data-col="${escapeHtml(column.key)}"><button class="sheet-filter-clear" type="button" data-${scope}-filter-clear title="Clear all column filters">Clear</button></th>`;
    }
    if (column.filterable === false) return `<th data-col="${escapeHtml(column.key)}"></th>`;
    return `
      <th data-col="${escapeHtml(column.key)}">
        <button class="sheet-filter-button" type="button" data-${scope}-filter-menu="${escapeHtml(column.key)}" title="Filter ${escapeHtml(column.label || column.key)}">
          All
        </button>
      </th>
    `;
  }).join("");

  labelRow?.after(filterRow);
  popover.className = "sheet-filter-popover hidden";
  document.body.appendChild(popover);

  function selected(field) {
    return state.get(field) || new Set();
  }

  function fieldHasFilter(field) {
    return selected(field).size > 0;
  }

  function rowMatches(row, field) {
    const active = selected(field);
    if (!active.size) return true;
    if (active.has("__none__")) return false;
    const values = getValues(row, field);
    const list = values.length ? values : [BLANK_LABEL];
    return list.some((value) => active.has(valueKey(value)));
  }

  function apply(rows) {
    const activeFields = [...state.keys()].filter((field) => state.get(field)?.size);
    if (!activeFields.length) return rows;
    return rows.filter((row) => activeFields.every((field) => rowMatches(row, field)));
  }

  function serialized() {
    const result = {};
    state.forEach((values, field) => {
      if (values.size) result[field] = [...values];
    });
    return result;
  }

  function updateButtons() {
    filterableColumns.forEach((column) => {
      const button = filterRow.querySelector(`[data-${scope}-filter-menu="${CSS.escape(column.key)}"]`);
      if (!button) return;
      const active = selected(column.key);
      const count = active.size;
      button.textContent = active.has("__none__") ? "None" : count ? `${count} selected` : "All";
      button.classList.toggle("is-active", count > 0);
    });
  }

  async function menuValues(field, search = "") {
    if (typeof getMenuValues === "function") {
      const values = await getMenuValues(field, search);
      return Array.isArray(values) ? values.map(valueLabel).sort((a, b) => a.localeCompare(b)) : [];
    }
    return uniqueValues(getRows(), field, getValues);
  }

  function renderLoadingMenu(field) {
    const column = filterableColumns.find((item) => item.key === field);
    popover.innerHTML = `
      <div class="sheet-filter-popover-header">
        <strong>${escapeHtml(column?.label || field)}</strong>
        <button type="button" data-sheet-filter-close>Close</button>
      </div>
      <input class="sheet-filter-search" type="search" placeholder="Search values..." value="" />
      <p class="muted-text">Loading values...</p>
    `;
    popover.dataset.field = field;
    popover.classList.remove("hidden");
  }

  function menuVisibleValues(search = "") {
    if (!activeMenu) return [];
    const query = search.trim().toLowerCase();
    return activeMenu.values
      .filter((value) => !query || value.toLowerCase().includes(query))
      .slice(0, 220);
  }

  function updateDraftSummary() {
    if (!activeMenu) return;
    const summary = popover.querySelector("[data-sheet-filter-summary]");
    if (!summary) return;
    const selectedCount = activeMenu.draft.size;
    const totalCount = activeMenu.allKeys.length;
    summary.textContent = `${selectedCount.toLocaleString()} of ${totalCount.toLocaleString()} selected`;
  }

  function renderMenuContent(search = activeMenu?.search || "") {
    if (!activeMenu) return;
    activeMenu.search = search;
    const { field, column, draft } = activeMenu;
    const visibleValues = menuVisibleValues(search);

    popover.innerHTML = `
      <div class="sheet-filter-popover-header">
        <strong>${escapeHtml(column?.label || field)}</strong>
        <button type="button" data-sheet-filter-close>Close</button>
      </div>
      <div class="sheet-filter-popover-primary">
        <button type="button" data-sheet-filter-clear-column>Clear filter from ${escapeHtml(column?.label || field)}</button>
      </div>
      <input class="sheet-filter-search" type="search" placeholder="Search values..." value="${escapeHtml(search)}" />
      <div class="sheet-filter-popover-actions">
        <button type="button" data-sheet-filter-all>Select all</button>
        <button type="button" data-sheet-filter-none>Clear all</button>
      </div>
      <div class="sheet-filter-popover-actions sheet-filter-visible-actions">
        <button type="button" data-sheet-filter-visible-all>Select visible</button>
        <button type="button" data-sheet-filter-visible-none>Clear visible</button>
      </div>
      <p class="sheet-filter-summary" data-sheet-filter-summary></p>
      <div class="sheet-filter-options">
        ${visibleValues.map((value) => `
          <label title="${escapeHtml(value)}">
            <input type="checkbox" data-sheet-filter-value="${escapeHtml(valueKey(value))}" ${draft.has(valueKey(value)) ? "checked" : ""} />
            <span>${escapeHtml(value)}</span>
          </label>
        `).join("") || '<p class="muted-text">No values found.</p>'}
      </div>
      <div class="sheet-filter-popover-footer">
        <button type="button" class="secondary" data-sheet-filter-cancel>Cancel</button>
        <button type="button" data-sheet-filter-apply>Apply</button>
      </div>
    `;

    popover.dataset.values = JSON.stringify(activeMenu.allKeys);
    popover.classList.remove("hidden");
    updateDraftSummary();
    popover.querySelector(".sheet-filter-search")?.focus();
  }

  async function openMenu(button) {
    const field = button.dataset[`${scope}FilterMenu`];
    const rect = button.getBoundingClientRect();
    const requestId = ++menuRequestId;
    popover.style.left = `${Math.min(rect.left, window.innerWidth - 340)}px`;
    popover.style.top = `${rect.bottom + 4}px`;
    renderLoadingMenu(field);

    const values = await menuValues(field, "");
    if (requestId !== menuRequestId) return;
    const active = selected(field);
    const allKeys = values.map(valueKey);
    activeMenu = {
      field,
      column: filterableColumns.find((item) => item.key === field),
      values,
      allKeys,
      draft: active.has("__none__")
        ? new Set()
        : active.size
          ? new Set(active)
          : new Set(allKeys),
      search: ""
    };
    renderMenuContent();
  }

  function clear({ silent = false } = {}) {
    state.clear();
    updateButtons();
    if (!silent) onChange?.();
  }

  filterRow.addEventListener("click", (event) => {
    const clearButton = event.target.closest(`[data-${scope}-filter-clear]`);
    if (clearButton) {
      clear();
      return;
    }
    const button = event.target.closest(`[data-${scope}-filter-menu]`);
    if (button) openMenu(button);
  });

  popover.addEventListener("input", (event) => {
    const search = event.target.closest(".sheet-filter-search");
    if (!search) return;
    renderMenuContent(search.value);
  });

  popover.addEventListener("click", (event) => {
    event.stopPropagation();

    if (event.target.closest("[data-sheet-filter-close], [data-sheet-filter-cancel]")) {
      menuRequestId += 1;
      popover.classList.add("hidden");
      activeMenu = null;
      return;
    }

    const field = activeMenu?.field;
    if (!field) return;

    if (event.target.closest("[data-sheet-filter-clear-column]")) {
      state.delete(field);
      updateButtons();
      menuRequestId += 1;
      popover.classList.add("hidden");
      activeMenu = null;
      onChange?.();
      return;
    }

    if (event.target.closest("[data-sheet-filter-all]")) {
      activeMenu.draft = new Set(activeMenu.allKeys);
      renderMenuContent(activeMenu.search);
      return;
    }

    if (event.target.closest("[data-sheet-filter-none]")) {
      activeMenu.draft = new Set();
      renderMenuContent(activeMenu.search);
      return;
    }

    if (event.target.closest("[data-sheet-filter-visible-all]")) {
      menuVisibleValues(activeMenu.search).forEach((value) => activeMenu.draft.add(valueKey(value)));
      renderMenuContent(activeMenu.search);
      return;
    }

    if (event.target.closest("[data-sheet-filter-visible-none]")) {
      menuVisibleValues(activeMenu.search).forEach((value) => activeMenu.draft.delete(valueKey(value)));
      renderMenuContent(activeMenu.search);
      return;
    }

    if (event.target.closest("[data-sheet-filter-apply]")) {
      if (activeMenu.draft.size === activeMenu.allKeys.length) state.delete(field);
      else if (activeMenu.draft.size) state.set(field, new Set(activeMenu.draft));
      else state.set(field, new Set(["__none__"]));
      updateButtons();
      menuRequestId += 1;
      popover.classList.add("hidden");
      activeMenu = null;
      onChange?.();
      return;
    }

    const checkbox = event.target.closest("[data-sheet-filter-value]");
    if (!checkbox) return;
    if (checkbox.checked) activeMenu.draft.add(checkbox.dataset.sheetFilterValue);
    else activeMenu.draft.delete(checkbox.dataset.sheetFilterValue);
    updateDraftSummary();
  });

  document.addEventListener("click", (event) => {
    if (popover.classList.contains("hidden")) return;
    if (popover.contains(event.target) || filterRow.contains(event.target)) return;
    menuRequestId += 1;
    popover.classList.add("hidden");
    activeMenu = null;
  });

  updateButtons();
  return { apply, clear, serialized, updateButtons, fieldHasFilter };
}
