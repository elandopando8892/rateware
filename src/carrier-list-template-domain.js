function trimmedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export const CARRIER_TEMPLATE_IMPORT_MAX_ROWS = 1000;

export function createCarrierTemplateWizardAsyncController() {
  let session = 0;
  let context = Object.freeze({ open: false, template_id: "", expected_version: null });
  const operationVersions = new Map();

  function replaceContext(nextContext = {}, open) {
    session += 1;
    operationVersions.clear();
    context = Object.freeze({
      open,
      template_id: trimmedText(nextContext.template_id || nextContext.id),
      expected_version: templateVersion(nextContext)
    });
    return snapshot();
  }

  function snapshot() {
    return Object.freeze({ session, ...context });
  }

  function begin(operation) {
    const operationName = trimmedText(operation);
    if (!operationName) throw new Error("Wizard async operation name is required.");
    const operation_token = (operationVersions.get(operationName) || 0) + 1;
    operationVersions.set(operationName, operation_token);
    return Object.freeze({
      ...snapshot(),
      operation: operationName,
      operation_token
    });
  }

  function isCurrent(token) {
    return Boolean(
      token &&
      context.open &&
      token.open &&
      token.session === session &&
      token.template_id === context.template_id &&
      token.expected_version === context.expected_version &&
      operationVersions.get(token.operation) === token.operation_token
    );
  }

  async function run(operation, task, apply = () => {}) {
    const token = begin(operation);
    try {
      const value = await task(token);
      if (!isCurrent(token)) return { current: false, value };
      apply(value, token);
      return { current: true, value };
    } catch (error) {
      if (!isCurrent(token)) return { current: false, error };
      throw error;
    }
  }

  function invalidateOperations(predicate = () => true) {
    for (const operation of [...operationVersions.keys()]) {
      if (predicate(operation)) operationVersions.delete(operation);
    }
  }

  return Object.freeze({
    open: (nextContext = {}) => replaceContext(nextContext, true),
    close: () => replaceContext({}, false),
    begin,
    invalidateOperations,
    isCurrent,
    run,
    snapshot
  });
}

export function createCarrierTemplateModalFocusController({
  getActiveElement,
  getFocusable,
  getBackgroundElements,
  getBackgroundState,
  setBackgroundState,
  focusElement,
  fallbackFocus,
  isConnected,
  isInside
} = {}) {
  let openerResolver = null;
  let open = false;
  let backgroundSnapshot = [];
  const activeElement = typeof getActiveElement === "function" ? getActiveElement : () => null;
  const focusableElements = typeof getFocusable === "function" ? getFocusable : () => [];
  const backgroundElements = typeof getBackgroundElements === "function" ? getBackgroundElements : () => [];
  const readBackgroundState = typeof getBackgroundState === "function"
    ? getBackgroundState
    : (element) => ({
        inert: Boolean(element?.inert),
        ariaHidden: element?.getAttribute?.("aria-hidden")
      });
  const writeBackgroundState = typeof setBackgroundState === "function"
    ? setBackgroundState
    : (element, state) => {
        if (!element) return;
        element.inert = Boolean(state.inert);
        if (state.ariaHidden === null || state.ariaHidden === undefined) element.removeAttribute?.("aria-hidden");
        else element.setAttribute?.("aria-hidden", String(state.ariaHidden));
      };
  const focus = typeof focusElement === "function" ? focusElement : (element) => element?.focus?.();
  const fallback = typeof fallbackFocus === "function" ? fallbackFocus : () => null;
  const connected = typeof isConnected === "function" ? isConnected : (element) => element?.isConnected !== false;
  const inside = typeof isInside === "function"
    ? isInside
    : (element) => focusableElements().includes(element);

  function restoreBackground() {
    for (const { element, state } of backgroundSnapshot) writeBackgroundState(element, state);
    backgroundSnapshot = [];
  }

  return Object.freeze({
    open(initialFocus, openerOptions = {}) {
      restoreBackground();
      const initialOpener = activeElement();
      if (typeof openerOptions === "function") openerResolver = openerOptions;
      else if (typeof openerOptions?.resolveOpener === "function") openerResolver = openerOptions.resolveOpener;
      else if (openerOptions && !Object.keys(openerOptions).length) openerResolver = () => initialOpener;
      else openerResolver = () => openerOptions || initialOpener;
      backgroundSnapshot = backgroundElements().filter(Boolean).map((element) => ({
        element,
        state: readBackgroundState(element)
      }));
      for (const { element } of backgroundSnapshot) {
        writeBackgroundState(element, { inert: true, ariaHidden: "true" });
      }
      open = true;
      focus(initialFocus || focusableElements()[0] || null);
    },
    close({ restoreFocus = true } = {}) {
      const resolvedOpener = openerResolver?.() || null;
      openerResolver = null;
      open = false;
      restoreBackground();
      if (!restoreFocus) return;
      const restoreTarget = connected(resolvedOpener) ? resolvedOpener : fallback();
      if (restoreTarget) focus(restoreTarget);
    },
    containFocus() {
      if (!open || inside(activeElement())) return false;
      const target = focusableElements().filter(Boolean)[0] || null;
      if (!target) return false;
      focus(target);
      return true;
    },
    trapTab(event = {}) {
      if (event.key !== "Tab") return false;
      const elements = focusableElements().filter(Boolean);
      if (!elements.length) return false;
      const current = activeElement();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && current === first) {
        event.preventDefault?.();
        focus(last);
        return true;
      }
      if (!event.shiftKey && current === last) {
        event.preventDefault?.();
        focus(first);
        return true;
      }
      return false;
    }
  });
}

export function createCarrierTemplateCapabilityRecoveryController({
  isEditorOpen,
  isDirty,
  requestClose,
  retainRecovery,
  setWritable
} = {}) {
  let writable = false;
  const editorOpen = typeof isEditorOpen === "function" ? isEditorOpen : () => false;
  const dirty = typeof isDirty === "function" ? isDirty : () => false;
  const close = typeof requestClose === "function" ? requestClose : () => true;
  const retain = typeof retainRecovery === "function" ? retainRecovery : () => {};
  const updateWritable = typeof setWritable === "function" ? setWritable : () => {};

  return Object.freeze({
    get canMutate() {
      return writable;
    },
    transition(capability) {
      writable = capability === "enabled";
      updateWritable(writable);
      if (writable) {
        retain(false);
        return { retained: false, closed: false };
      }
      if (!editorOpen()) {
        retain(false);
        return { retained: false, closed: false };
      }
      const closed = dirty() ? close({ restoreFocus: false }) !== false : close({ confirmUnsaved: false, restoreFocus: false }) !== false;
      retain(!closed);
      return { retained: !closed, closed };
    }
  });
}

export function createCarrierTemplateNavigationCoordinator({
  beforeLeave,
  commit,
  restore
} = {}) {
  if (typeof beforeLeave !== "function" || typeof commit !== "function" || typeof restore !== "function") {
    throw new TypeError("Carrier template navigation requires leave, commit, and restore adapters.");
  }
  const attempt = (route, restoreRoute = null) => {
    if (beforeLeave(route) === false) {
      if (restoreRoute) restore(restoreRoute);
      return false;
    }
    commit(route);
    return true;
  };
  return Object.freeze({
    click: (route) => attempt(route),
    popstate: (route, restoreRoute) => attempt(route, restoreRoute)
  });
}

function defaultContactUsable(vendor) {
  return Boolean(trimmedText(vendor?.primary_email));
}

function defaultVendorAvailable(vendor) {
  const status = trimmedText(vendor?.status).toLowerCase();
  return Boolean(vendor) && status !== "archived" && status !== "deleted";
}

function templateName(template = {}) {
  return trimmedText(template.segment_name || template.name);
}

function templateDescription(template = {}) {
  return trimmedText(template.segment_description || template.description);
}

function templateId(template = {}) {
  return trimmedText(template.id || template.template_id);
}

function templateVersion(template = {}) {
  const version = Number(template.template_version || template.expected_version);
  return Number.isSafeInteger(version) && version >= 1 ? version : null;
}

function cloneResolutionRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    candidate_vendor_ids: Array.isArray(row?.candidate_vendor_ids) ? [...row.candidate_vendor_ids] : []
  }));
}

function cloneMemberSources(sources = {}) {
  return Object.fromEntries(
    Object.entries(sources).map(([id, values]) => [id, [...(Array.isArray(values) ? values : [])]])
  );
}

export function carrierTemplateDraftContentKey(state = {}) {
  return JSON.stringify({
    name: trimmedText(state.name),
    description: trimmedText(state.description),
    vendor_ids: templateMemberIds({ vendor_ids: state.vendor_ids }),
    resolution_rows: cloneResolutionRows(state.resolution_rows),
    manual_resolutions: { ...(state.manual_resolutions || {}) }
  });
}

function refreshDirty(state) {
  return {
    ...state,
    dirty: carrierTemplateDraftContentKey(state) !== state.loaded_content_key
  };
}

function cloneDraftState(state) {
  return {
    ...state,
    vendor_ids: [...state.vendor_ids],
    resolution_rows: cloneResolutionRows(state.resolution_rows),
    manual_resolutions: { ...state.manual_resolutions },
    member_sources: cloneMemberSources(state.member_sources)
  };
}

function addMemberSource(state, vendorId, source) {
  const id = trimmedText(vendorId);
  if (!id) return;
  if (!state.vendor_ids.includes(id)) state.vendor_ids.push(id);
  const sources = new Set(state.member_sources[id] || []);
  sources.add(source);
  state.member_sources[id] = [...sources];
}

function removeMemberSource(state, vendorId, source) {
  const id = trimmedText(vendorId);
  if (!id || !state.member_sources[id]) return;
  state.member_sources[id] = state.member_sources[id].filter((value) => value !== source);
  if (!state.member_sources[id].length) {
    delete state.member_sources[id];
    state.vendor_ids = state.vendor_ids.filter((value) => value !== id);
  }
}

function removeResolutionSources(state) {
  for (const [vendorId, sources] of Object.entries(state.member_sources)) {
    for (const source of [...sources]) {
      if (source.startsWith("import:") || source.startsWith("manual-resolution:")) {
        removeMemberSource(state, vendorId, source);
      }
    }
  }
}

function resolutionRowNumber(row = {}, index = 0) {
  const rowNumber = Number(row.source_row_number);
  return Number.isFinite(rowNumber) && rowNumber > 0 ? rowNumber : index + 2;
}

export function createCarrierTemplateDraftState(template = {}) {
  const vendorIds = templateMemberIds(template);
  const state = {
    step: 0,
    id: templateId(template),
    expected_version: templateVersion(template),
    lifecycle_status: trimmedText(template.lifecycle_status || template.status).toLowerCase() || "draft",
    name: templateName(template),
    description: templateDescription(template),
    vendor_ids: vendorIds,
    resolution_rows: cloneResolutionRows(template.resolution_rows),
    manual_resolutions: { ...(template.manual_resolutions || {}) },
    member_sources: Object.fromEntries(vendorIds.map((id) => [id, ["loaded"]])),
    loaded_content_key: "",
    dirty: false
  };
  state.loaded_content_key = carrierTemplateDraftContentKey(state);
  return state;
}

export function reduceCarrierTemplateDraft(state, action = {}) {
  const next = cloneDraftState(state);
  if (action.type === "set_details") {
    next.name = typeof action.name === "string" ? action.name : next.name;
    next.description = typeof action.description === "string" ? action.description : next.description;
  } else if (action.type === "add_members") {
    for (const id of Array.isArray(action.vendor_ids) ? action.vendor_ids : []) {
      addMemberSource(next, id, "direct");
    }
  } else if (action.type === "remove_member") {
    const id = trimmedText(action.vendor_id);
    next.vendor_ids = next.vendor_ids.filter((value) => value !== id);
    delete next.member_sources[id];
  } else if (action.type === "reorder_member") {
    const id = trimmedText(action.vendor_id);
    const fromIndex = next.vendor_ids.indexOf(id);
    const requestedIndex = Number(action.to_index);
    if (fromIndex >= 0 && Number.isInteger(requestedIndex)) {
      const toIndex = Math.max(0, Math.min(requestedIndex, next.vendor_ids.length - 1));
      next.vendor_ids.splice(fromIndex, 1);
      next.vendor_ids.splice(toIndex, 0, id);
    }
  } else if (action.type === "apply_resolution_preview") {
    removeResolutionSources(next);
    next.resolution_rows = cloneResolutionRows(action.rows);
    next.manual_resolutions = {};
    next.resolution_rows.forEach((row, index) => {
      if (row.status !== "matched") return;
      const rowNumber = resolutionRowNumber(row, index);
      addMemberSource(next, row.vendor_id, `import:${rowNumber}`);
    });
  } else if (action.type === "confirm_manual_match") {
    const rowNumber = Number(action.source_row_number);
    const vendorId = trimmedText(action.vendor_id);
    const requiredIdentity = trimmedText(action.resolution_row_identity);
    const requiredGeneration = Number(action.reconciliation_generation);
    const index = next.resolution_rows.findIndex((row, rowIndex) => (
      resolutionRowNumber(row, rowIndex) === rowNumber &&
      (!requiredIdentity || trimmedText(row.resolution_row_identity) === requiredIdentity) &&
      (!Number.isFinite(requiredGeneration) || Number(row.reconciliation_generation) === requiredGeneration)
    ));
    if (vendorId && index >= 0 && next.resolution_rows[index].status === "ambiguous") {
      const source = `manual-resolution:${rowNumber}`;
      for (const memberId of [...next.vendor_ids]) removeMemberSource(next, memberId, source);
      addMemberSource(next, vendorId, source);
      next.manual_resolutions[String(rowNumber)] = vendorId;
      next.resolution_rows[index] = { ...next.resolution_rows[index], chosen_vendor_id: vendorId };
    }
  } else if (action.type === "go_to_step") {
    const requestedStep = Number(action.step);
    if (Number.isInteger(requestedStep)) next.step = Math.max(0, Math.min(requestedStep, 3));
    return next;
  } else if (action.type === "accept_saved") {
    const saved = action.template || {};
    next.id = templateId(saved) || next.id;
    next.expected_version = templateVersion(saved) || next.expected_version;
    next.lifecycle_status = trimmedText(saved.lifecycle_status || saved.status).toLowerCase() || next.lifecycle_status;
    if (saved.segment_name !== undefined || saved.name !== undefined) next.name = templateName(saved);
    if (saved.segment_description !== undefined || saved.description !== undefined) next.description = templateDescription(saved);
    if (Array.isArray(saved.vendor_ids)) next.vendor_ids = templateMemberIds(saved);
    next.member_sources = Object.fromEntries(next.vendor_ids.map((id) => [id, ["loaded"]]));
    next.loaded_content_key = carrierTemplateDraftContentKey(next);
    next.dirty = false;
    return next;
  }
  return refreshDirty(next);
}

export function createCarrierTemplateDraftMutationController({ readDraft, writeDraft } = {}) {
  if (typeof readDraft !== "function" || typeof writeDraft !== "function") {
    throw new TypeError("Carrier template draft mutation control requires readDraft and writeDraft adapters.");
  }
  let saveSequence = 0;
  let activeSave = null;

  function beginSave(context = {}) {
    if (activeSave) return null;
    activeSave = Object.freeze({
      save_sequence: ++saveSequence,
      session: Number(context.session),
      template_id: trimmedText(context.template_id),
      expected_version: context.expected_version ?? null,
      content_key: carrierTemplateDraftContentKey(readDraft())
    });
    return activeSave;
  }

  function sameSave(token, context = {}) {
    return Boolean(
      token &&
      token === activeSave &&
      token.session === Number(context.session) &&
      token.template_id === trimmedText(context.template_id) &&
      token.expected_version === (context.expected_version ?? null) &&
      token.content_key === carrierTemplateDraftContentKey(readDraft())
    );
  }

  return Object.freeze({
    get saving() {
      return Boolean(activeSave);
    },
    mutate(action) {
      if (activeSave) return false;
      writeDraft(action);
      return true;
    },
    beginSave,
    matchesSave: sameSave,
    completeSave(token, context = {}) {
      if (token !== activeSave) return false;
      const accepted = sameSave(token, context);
      activeSave = null;
      if (accepted) context.acceptSaved?.(context.serverRow);
      else context.retainComparison?.(context.serverRow);
      return accepted;
    },
    cancelSave(token) {
      if (token !== activeSave) return false;
      activeSave = null;
      return true;
    },
    invalidate() {
      activeSave = null;
    }
  });
}

function reconciliationRowIdentity(generation, row = {}, index = 0) {
  const evidence = JSON.stringify({
    source_row_number: resolutionRowNumber(row, index),
    source_row: row.source_row || {},
    status: trimmedText(row.status),
    reason: trimmedText(row.reason),
    candidate_vendor_ids: Array.isArray(row.candidate_vendor_ids) ? row.candidate_vendor_ids : []
  });
  let hash = 2166136261;
  for (let offset = 0; offset < evidence.length; offset += 1) {
    hash ^= evidence.charCodeAt(offset);
    hash = Math.imul(hash, 16777619);
  }
  return `${generation}:${resolutionRowNumber(row, index)}:${(hash >>> 0).toString(36)}`;
}

export function createCarrierTemplateReconciliationController() {
  let generation = 0;
  const choices = new Map();

  function startUpload() {
    generation += 1;
    choices.clear();
    return generation;
  }

  function identifyRows(uploadGeneration, rows = []) {
    return (Array.isArray(rows) ? rows : []).map((row, index) => ({
      ...row,
      reconciliation_generation: uploadGeneration,
      resolution_row_identity: reconciliationRowIdentity(uploadGeneration, row, index)
    }));
  }

  function tokenCurrent(token = {}) {
    return Number(token.generation) === generation && Boolean(trimmedText(token.row_identity));
  }

  return Object.freeze({
    get generation() {
      return generation;
    },
    startUpload,
    identifyRows,
    commitPreview(uploadGeneration, commit) {
      if (Number(uploadGeneration) !== generation) return false;
      commit?.();
      return true;
    },
    storeChoices(token, rows = []) {
      if (!tokenCurrent(token)) return false;
      choices.set(trimmedText(token.row_identity), [...(Array.isArray(rows) ? rows : [])]);
      return true;
    },
    choicesFor(row = {}) {
      if (Number(row.reconciliation_generation) !== generation) return [];
      return [...(choices.get(trimmedText(row.resolution_row_identity)) || [])];
    },
    isCurrent(token = {}) {
      return tokenCurrent(token);
    },
    reset: startUpload
  });
}

export function validateCarrierTemplateDraft(state = {}, lifecycleStatus = "draft") {
  const errors = [];
  if (!trimmedText(state.name)) {
    errors.push({ code: "name_required", message: "Template name is required." });
  }
  if (trimmedText(lifecycleStatus).toLowerCase() === "active" && !templateMemberIds({ vendor_ids: state.vendor_ids }).length) {
    errors.push({ code: "active_requires_member", message: "Activate template requires at least one carrier." });
  }
  return { valid: errors.length === 0, errors };
}

export function carrierTemplateDraftPayload(state = {}, lifecycleStatus = "draft") {
  return {
    segment_name: trimmedText(state.name),
    segment_description: trimmedText(state.description),
    lifecycle_status: trimmedText(lifecycleStatus).toLowerCase() || "draft",
    vendor_ids: templateMemberIds({ vendor_ids: state.vendor_ids })
  };
}

export function carrierTemplateDraftDiff(state = {}) {
  let loadedVendorIds = [];
  try {
    loadedVendorIds = JSON.parse(state.loaded_content_key || "{}").vendor_ids || [];
  } catch {
    loadedVendorIds = [];
  }
  const currentVendorIds = templateMemberIds({ vendor_ids: state.vendor_ids });
  const loadedSet = new Set(loadedVendorIds);
  const currentSet = new Set(currentVendorIds);
  return {
    added_vendor_ids: currentVendorIds.filter((id) => !loadedSet.has(id)),
    removed_vendor_ids: loadedVendorIds.filter((id) => !currentSet.has(id))
  };
}

export function carrierTemplateConflictSummary(localState = {}, currentTemplate = {}) {
  const localIds = templateMemberIds({ vendor_ids: localState.vendor_ids });
  const currentIds = templateMemberIds(currentTemplate);
  const localSet = new Set(localIds);
  const currentSet = new Set(currentIds);
  return {
    local_version: localState.expected_version,
    current_version: templateVersion(currentTemplate),
    local_member_count: localIds.length,
    current_member_count: currentIds.length,
    only_local_vendor_ids: localIds.filter((id) => !currentSet.has(id)),
    only_current_vendor_ids: currentIds.filter((id) => !localSet.has(id))
  };
}

export function carrierTemplateImportValidation(file = {}, {
  row_count: rowCount = null,
  max_bytes: maxBytes = 5 * 1024 * 1024,
  max_rows: maxRows = CARRIER_TEMPLATE_IMPORT_MAX_ROWS
} = {}) {
  const enforcedMaxRows = Math.min(
    Math.max(Number(maxRows) || CARRIER_TEMPLATE_IMPORT_MAX_ROWS, 1),
    CARRIER_TEMPLATE_IMPORT_MAX_ROWS
  );
  const name = trimmedText(file?.name).toLowerCase();
  const supported = name.endsWith(".csv") || name.endsWith(".xlsx");
  if (!supported) {
    return { valid: false, code: "unsupported_file_type", message: "Choose a CSV or XLSX file." };
  }
  if (Number(file?.size) > maxBytes) {
    return { valid: false, code: "file_too_large", message: `The file exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB limit.` };
  }
  if (rowCount !== null && Number(rowCount) > enforcedMaxRows) {
    return { valid: false, code: "too_many_rows", message: `The file exceeds the ${enforcedMaxRows.toLocaleString()} row limit.` };
  }
  return { valid: true, code: "", message: "" };
}

function sourceRowEvidence(row = {}, index = 0) {
  return {
    source_row_number: resolutionRowNumber(row, index),
    vendor_id: trimmedText(row.vendor_id),
    crm_id: trimmedText(row.crm_id),
    usdot_number: trimmedText(row.usdot_number || row.usdot),
    mc_number: trimmedText(row.mc_number || row.mc),
    primary_email: trimmedText(row.primary_email || row.email),
    vendor_name: trimmedText(row.vendor_name || row.name)
  };
}

export function mergeCarrierTemplateResolutionRows(sourceRows = [], resolutionRows = []) {
  const sources = Array.isArray(sourceRows) ? sourceRows : [];
  const sourceByNumber = new Map(
    sources.map((row, index) => [resolutionRowNumber(row, index), sourceRowEvidence(row, index)])
  );
  return (Array.isArray(resolutionRows) ? resolutionRows : []).map((row, index) => {
    const sourceRowNumber = resolutionRowNumber(row, index);
    const merged = {
      source_row_number: sourceRowNumber,
      status: trimmedText(row?.status),
      reason: trimmedText(row?.reason),
      candidate_vendor_ids: Array.isArray(row?.candidate_vendor_ids) ? [...row.candidate_vendor_ids] : [],
      source_row: sourceByNumber.get(sourceRowNumber) || sourceRowEvidence(sources[index], index)
    };
    if (row?.vendor_id !== undefined) merged.vendor_id = row.vendor_id;
    if (row?.requires_manual_confirmation !== undefined) {
      merged.requires_manual_confirmation = Boolean(row.requires_manual_confirmation);
    }
    if (row?.chosen_vendor_id !== undefined) merged.chosen_vendor_id = row.chosen_vendor_id;
    return merged;
  });
}

export function templateMemberIds(template = {}) {
  const seen = new Set();
  const ids = [];
  for (const value of Array.isArray(template?.vendor_ids) ? template.vendor_ids : []) {
    const id = trimmedText(value);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export function partitionCarrierTemplateMembers({
  template = {},
  vendors = [],
  participantVendorIds = [],
  isContactUsable = defaultContactUsable,
  isVendorAvailable = defaultVendorAvailable,
  passesFilters = () => true
} = {}) {
  const rows = {
    eligible: [],
    already_in_rfx: [],
    missing_contact: [],
    unavailable: []
  };
  const vendorById = new Map(
    (Array.isArray(vendors) ? vendors : [])
      .filter((vendor) => trimmedText(vendor?.id))
      .map((vendor) => [trimmedText(vendor.id), vendor])
  );
  const participantIds = new Set(
    (Array.isArray(participantVendorIds) ? participantVendorIds : [])
      .map(trimmedText)
      .filter(Boolean)
  );
  const filteredOutIds = [];

  for (const vendorId of templateMemberIds(template)) {
    const vendor = vendorById.get(vendorId);
    let primaryState = "eligible";
    if (participantIds.has(vendorId)) {
      primaryState = "already_in_rfx";
    } else if (!vendor || !isVendorAvailable(vendor)) {
      primaryState = "unavailable";
    } else if (!isContactUsable(vendor)) {
      primaryState = "missing_contact";
    }

    const row = vendor
      ? { ...vendor, vendor_id: vendorId, primary_state: primaryState }
      : { vendor_id: vendorId, id: vendorId, unavailable: true, primary_state: primaryState };
    rows[primaryState].push(row);
    if (!passesFilters(row)) filteredOutIds.push(vendorId);
  }

  const counts = {
    total: templateMemberIds(template).length,
    eligible: rows.eligible.length,
    already_in_rfx: rows.already_in_rfx.length,
    missing_contact: rows.missing_contact.length,
    unavailable: rows.unavailable.length,
    filtered_out: filteredOutIds.length
  };
  return { rows, counts, filtered_out_ids: filteredOutIds };
}
