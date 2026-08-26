function cloneState(state) {
  return {
    capability: state.capability,
    lifecycleStatus: state.lifecycleStatus,
    rows: [...state.rows],
    selectedId: state.selectedId,
    detail: state.detail,
    error: state.error
  };
}

function rowId(row = {}) {
  return String(row.id || row.template_id || "").trim();
}

function errorStatus(error) {
  return Number(error?.status) || 0;
}

export function createCarrierListTemplateController({ fetchList, fetchDetail }) {
  if (typeof fetchList !== "function" || typeof fetchDetail !== "function") {
    throw new TypeError("Carrier template controller requires list and detail loaders.");
  }

  const state = {
    capability: "unknown",
    lifecycleStatus: "active",
    rows: [],
    selectedId: "",
    detail: null,
    error: null
  };
  let listRequestToken = 0;
  let detailRequestToken = 0;

  function snapshot() {
    return cloneState(state);
  }

  function invalidateDetail() {
    detailRequestToken += 1;
    state.detail = null;
  }

  async function load(lifecycleStatus = "active") {
    const requestedLifecycle = String(lifecycleStatus || "active");
    const requestToken = ++listRequestToken;
    state.lifecycleStatus = requestedLifecycle;
    state.error = null;
    try {
      const result = await fetchList(requestedLifecycle);
      if (requestToken !== listRequestToken || requestedLifecycle !== state.lifecycleStatus) {
        return { current: false, state: snapshot() };
      }
      if (result?.enabled === false) {
        state.capability = "disabled";
        state.rows = [];
        state.selectedId = "";
        invalidateDetail();
        return { current: true, state: snapshot() };
      }
      state.capability = "enabled";
      state.rows = Array.isArray(result?.rows) ? [...result.rows] : [];
      state.error = null;
      if (state.selectedId) {
        const selected = state.rows.find((row) => rowId(row) === state.selectedId);
        if (selected) state.detail = selected;
      }
      return { current: true, state: snapshot() };
    } catch (error) {
      if (requestToken !== listRequestToken || requestedLifecycle !== state.lifecycleStatus) {
        return { current: false, state: snapshot() };
      }
      state.rows = [];
      state.selectedId = "";
      invalidateDetail();
      if (errorStatus(error) === 404) {
        state.capability = "disabled";
        state.error = null;
      } else {
        state.capability = "error";
        state.error = error;
      }
      return { current: true, state: snapshot() };
    }
  }

  function retry() {
    return load(state.lifecycleStatus);
  }

  function replaceRow(row) {
    const id = rowId(row);
    if (!id) return;
    const index = state.rows.findIndex((item) => rowId(item) === id);
    if (index >= 0) state.rows.splice(index, 1, row);
    else state.rows.unshift(row);
    if (state.selectedId === id) state.detail = row;
  }

  async function loadSelected(id) {
    const requestToken = ++detailRequestToken;
    const capabilityRequestToken = listRequestToken;
    try {
      const result = await fetchDetail(id);
      if (
        requestToken !== detailRequestToken ||
        capabilityRequestToken !== listRequestToken ||
        state.selectedId !== id ||
        state.capability !== "enabled"
      ) {
        return { current: false, state: snapshot() };
      }
      if (!result?.row) throw new Error("The current carrier template could not be reloaded.");
      replaceRow(result.row);
      state.detail = result.row;
      return { current: true, row: result.row, state: snapshot() };
    } catch (error) {
      if (
        requestToken !== detailRequestToken ||
        capabilityRequestToken !== listRequestToken ||
        state.selectedId !== id
      ) {
        return { current: false, state: snapshot() };
      }
      return { current: true, error, state: snapshot() };
    }
  }

  async function select(id, { refresh = false } = {}) {
    const requestedId = String(id || "").trim();
    state.selectedId = requestedId;
    state.error = null;
    invalidateDetail();
    if (!requestedId || state.capability !== "enabled") {
      return { current: true, state: snapshot() };
    }
    const listed = state.rows.find((row) => rowId(row) === requestedId);
    if (listed && !refresh) {
      state.detail = listed;
      return { current: true, row: listed, state: snapshot() };
    }
    return await loadSelected(requestedId);
  }

  async function handleConflict(error, { id, displayedVersion, action }) {
    const code = String(error?.code || "");
    state.selectedId = String(id || "").trim();
    if (code === "template_name_conflict") {
      invalidateDetail();
      const listed = state.rows.find((row) => rowId(row) === state.selectedId);
      state.detail = listed || null;
      return {
        current: true,
        kind: "name",
        message: "That template name is already in use. Keep this row selected, choose a different duplicate name, and retry manually. No mutation was retried.",
        state: snapshot()
      };
    }
    if (code !== "template_version_conflict") {
      return { current: true, kind: "other", state: snapshot() };
    }
    const refreshed = await select(state.selectedId, { refresh: true });
    const currentVersion = Number(refreshed.row?.template_version) || "current";
    return {
      ...refreshed,
      kind: "version",
      message: refreshed.error
        ? `This template changed after displayed v${displayedVersion}, but its current row could not be refreshed. Keep the selection, reload the library, compare again, and retry ${action} manually. No mutation was retried.`
        : `This template changed after displayed v${displayedVersion}. Review the refreshed ${currentVersion === "current" ? "current version" : `v${currentVersion}`} against your intended ${action}, then retry manually. No mutation was retried.`
    };
  }

  return {
    snapshot,
    load,
    retry,
    select,
    replaceRow,
    handleConflict
  };
}
