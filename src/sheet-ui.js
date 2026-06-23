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

export function initColumnVisibility({ table, menu, columns = [], storageKey = "", presets = [], presetContainer = null, defaultPreset = "" }) {
  if (!table || !menu || !columns.length) return;
  const list = menu.querySelector("[data-column-toggle-list]");
  const stored = readStoredVisibility(storageKey);
  const presetStorageKey = storageKey ? `${storageKey}:preset` : "";
  const lockedKeys = new Set(columns.filter((column) => column.locked).map((column) => column.key));
  const columnKeys = new Set(columns.map((column) => column.key));
  const visibility = {};

  columns.forEach((column) => {
    visibility[column.key] = column.locked ? true : stored[column.key] !== false;
  });

  function storedPreset() {
    if (!presetStorageKey || !storageAvailable()) return "";
    return window.localStorage.getItem(presetStorageKey) || "";
  }

  let activePreset = storedPreset() || defaultPreset || "";

  function writePreset(value) {
    activePreset = value || "";
    if (!presetStorageKey || !storageAvailable()) return;
    if (activePreset) window.localStorage.setItem(presetStorageKey, activePreset);
    else window.localStorage.removeItem(presetStorageKey);
  }

  function syncToggleInputs() {
    if (!list) return;
    list.querySelectorAll("[data-column-toggle]").forEach((input) => {
      input.checked = visibility[input.dataset.columnToggle] !== false;
    });
  }

  function syncPresetButtons() {
    if (!presetContainer) return;
    presetContainer.querySelectorAll("[data-column-preset]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.columnPreset === activePreset);
    });
  }

  function applyVisibility() {
    columns.forEach((column) => {
      const visible = visibility[column.key] !== false || column.locked;
      table.querySelectorAll(`[data-col="${CSS.escape(column.key)}"]`).forEach((cell) => {
        cell.classList.toggle("column-hidden", !visible);
      });
    });
    writeStoredVisibility(storageKey, visibility);
    syncToggleInputs();
    syncPresetButtons();
  }

  function applyPreset(name, { persist = true } = {}) {
    const preset = presets.find((item) => item.name === name);
    if (!preset) return;
    const visibleKeys = new Set([...(preset.columns || []), ...lockedKeys].filter((key) => columnKeys.has(key)));
    columns.forEach((column) => {
      visibility[column.key] = column.locked || visibleKeys.has(column.key);
    });
    if (persist) writePreset(preset.name);
    applyVisibility();
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

  if (presetContainer && presets.length) {
    presetContainer.innerHTML = presets
      .map((preset) => `<button class="review-filter" type="button" data-column-preset="${preset.name}">${preset.label}</button>`)
      .join("");
    presetContainer.addEventListener("click", (event) => {
      const button = event.target.closest("[data-column-preset]");
      if (!button) return;
      applyPreset(button.dataset.columnPreset);
    });
  }

  menu.addEventListener("change", (event) => {
    const input = event.target.closest("[data-column-toggle]");
    if (!input) return;
    visibility[input.dataset.columnToggle] = input.checked;
    writePreset("");
    applyVisibility();
  });

  if (activePreset && presets.some((preset) => preset.name === activePreset)) {
    applyPreset(activePreset, { persist: false });
  } else {
    applyVisibility();
  }
  return { applyVisibility, applyPreset };
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
