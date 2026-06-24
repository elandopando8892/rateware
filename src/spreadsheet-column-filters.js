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

  async function renderMenu(field, search = "") {
    const column = filterableColumns.find((item) => item.key === field);
    popover.innerHTML = `
      <div class="sheet-filter-popover-header">
        <strong>${escapeHtml(column?.label || field)}</strong>
        <button type="button" data-sheet-filter-close>Close</button>
      </div>
      <input class="sheet-filter-search" type="search" placeholder="Search values..." value="${escapeHtml(search)}" />
      <p class="muted-text">Loading values...</p>
    `;
    popover.dataset.field = field;
    popover.classList.remove("hidden");

    const values = await menuValues(field, search);
    const query = search.trim().toLowerCase();
    const visibleValues = values
      .filter((value) => !query || value.toLowerCase().includes(query))
      .slice(0, 160);
    const active = selected(field);

    popover.innerHTML = `
      <div class="sheet-filter-popover-header">
        <strong>${escapeHtml(column?.label || field)}</strong>
        <button type="button" data-sheet-filter-close>Close</button>
      </div>
      <input class="sheet-filter-search" type="search" placeholder="Search values..." value="${escapeHtml(search)}" />
      <div class="sheet-filter-popover-actions">
        <button type="button" data-sheet-filter-all>All</button>
        <button type="button" data-sheet-filter-none>None</button>
      </div>
      <div class="sheet-filter-options">
        ${visibleValues.map((value) => `
          <label title="${escapeHtml(value)}">
            <input type="checkbox" data-sheet-filter-value="${escapeHtml(valueKey(value))}" ${!active.size || active.has(valueKey(value)) ? "checked" : ""} />
            <span>${escapeHtml(value)}</span>
          </label>
        `).join("") || '<p class="muted-text">No values found.</p>'}
      </div>
    `;

    popover.dataset.field = field;
    popover.dataset.values = JSON.stringify(values.map(valueKey));
    popover.classList.remove("hidden");
    popover.querySelector(".sheet-filter-search")?.focus();
  }

  async function openMenu(button) {
    const field = button.dataset[`${scope}FilterMenu`];
    const rect = button.getBoundingClientRect();
    popover.style.left = `${Math.min(rect.left, window.innerWidth - 340)}px`;
    popover.style.top = `${rect.bottom + 4}px`;
    await renderMenu(field);
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
    renderMenu(popover.dataset.field, search.value);
  });

  popover.addEventListener("click", async (event) => {
    if (event.target.closest("[data-sheet-filter-close]")) {
      popover.classList.add("hidden");
      return;
    }

    const field = popover.dataset.field;
    if (!field) return;

    if (event.target.closest("[data-sheet-filter-all]")) {
      state.delete(field);
      updateButtons();
      await renderMenu(field);
      onChange?.();
      return;
    }

    if (event.target.closest("[data-sheet-filter-none]")) {
      state.set(field, new Set(["__none__"]));
      updateButtons();
      await renderMenu(field);
      onChange?.();
      return;
    }

    const checkbox = event.target.closest("[data-sheet-filter-value]");
    if (!checkbox) return;
    const allKeys = JSON.parse(popover.dataset.values || "[]");
    const current = selected(field);
    const active = current.size && !current.has("__none__") ? new Set(current) : new Set(allKeys);
    if (checkbox.checked) active.add(checkbox.dataset.sheetFilterValue);
    else active.delete(checkbox.dataset.sheetFilterValue);
    if (active.size === allKeys.length) state.delete(field);
    else if (active.size) state.set(field, active);
    else state.set(field, new Set(["__none__"]));
    updateButtons();
    onChange?.();
  });

  document.addEventListener("click", (event) => {
    if (popover.classList.contains("hidden")) return;
    if (popover.contains(event.target) || filterRow.contains(event.target)) return;
    popover.classList.add("hidden");
  });

  updateButtons();
  return { apply, clear, serialized, updateButtons, fieldHasFilter };
}
