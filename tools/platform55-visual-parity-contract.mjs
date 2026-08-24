import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const P3V_DIMENSIONS = Object.freeze({
  shell_frame: 20,
  interior_hierarchy: 25,
  visual_system: 20,
  components_states: 20,
  responsive_accessibility: 15,
});

export const P3V_VIEWPORTS = Object.freeze([
  Object.freeze([1440, 900]),
  Object.freeze([1024, 768]),
  Object.freeze([390, 844]),
]);

export const P3V_MATRIX_FIELDS = Object.freeze([
  "route",
  "page_key",
  "access",
  "family",
  "visual_archetype",
  "primary_reference",
  "secondary_reference",
  "current_baseline",
  "parity_status",
  "gap_summary",
  "p3v_wave",
  "verification",
]);

export const P3V_ROUTES = Object.freeze([
  "app.html",
  "bid-room-board.html",
  "business-intelligence.html",
  "carrier-profile.html",
  "catalog-workbench.html",
  "customer-rfi.html",
  "growth-hacking.html",
  "index.html",
  "interpretation-memory.html",
  "outreach.html",
  "provider-communications.html",
  "provider-gmail.html",
  "provider-onboarding.html",
  "provider-service.html",
  "ratebook-carrier.html",
  "ratebook.html",
  "rateware.html",
  "rfx-bid.html",
  "rfx-events.html",
  "rfx-process.html",
  "settings.html",
  "shipper-crm.html",
  "shipper-profile.html",
  "staging-review.html",
  "upload-center.html",
  "upload-history.html",
  "vendor-improvement.html",
  "vendor-support.html",
  "vendors.html",
]);

const ROUTES = new Set(P3V_ROUTES);
const ACCESS = new Set(["authenticated", "public", "public_entry"]);
const WAVES = new Set(["P3-V1", "P3-V2", "P3-V3", "P3-V4", "P3-V5"]);
const PARITY = new Set(["unscored", "low", "partial", "blocked", "accepted"]);
const VERIFICATION = new Set(["unverified", "blocked", "reviewed", "accepted"]);
const SCORE_FIELDS = new Set([
  "dimensions",
  "viewports",
  "states",
  "required_states",
  "reviewer_verdict",
  "reference_sha256",
  "screenshot_sha256",
  "candidate_sha",
]);

function frozenErrors(errors) {
  return Object.freeze([...new Set(errors)]);
}

function pathFrom(value) {
  return value instanceof URL ? fileURLToPath(value) : value;
}

function inside(root, candidate) {
  const value = relative(root, candidate);
  return value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value);
}

function ownDataDescriptors(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => !("value" in descriptor))) return null;
  return descriptors;
}

function dataValue(descriptors, key) {
  return descriptors?.[key] && "value" in descriptors[key] ? descriptors[key].value : undefined;
}

function plainDenseArray(value) {
  if (!Array.isArray(value)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor)) return false;
  }
  return Object.keys(descriptors).every((key) => key === "length" || /^(0|[1-9]\d*)$/.test(key));
}

function exactViewportMatrix(value) {
  if (!plainDenseArray(value) || value.length !== P3V_VIEWPORTS.length) return false;
  return value.every((viewport, index) => (
    plainDenseArray(viewport)
    && viewport.length === 2
    && viewport[0] === P3V_VIEWPORTS[index][0]
    && viewport[1] === P3V_VIEWPORTS[index][1]
  ));
}

function sha(value, length) {
  return typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`, "i").test(value);
}

export function parseRouteMatrix(text) {
  if (typeof text !== "string" || !text.trim()) throw new TypeError("route matrix must be non-empty text");
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  let quoteClosed = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        quoteClosed = true;
      } else {
        field += character;
      }
      continue;
    }

    if (quoteClosed && ![",", "\r", "\n"].includes(character)) {
      throw new Error("quoted CSV field must end before a delimiter");
    }
    if (character === '"') {
      if (field) throw new Error("quote must start at beginning of CSV field");
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
      quoteClosed = false;
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
      quoteClosed = false;
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("unterminated quoted CSV field");
  if (field || record.length) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }

  const nonEmptyRecords = records.filter((cells) => cells.some((cell) => cell !== ""));
  const [header, ...rows] = nonEmptyRecords;
  if (!header || JSON.stringify(header) !== JSON.stringify(P3V_MATRIX_FIELDS)) {
    throw new Error("unexpected route matrix header");
  }

  return Object.freeze(rows.map((cells, rowIndex) => {
    if (cells.length !== header.length) throw new Error(`ragged CSV row ${rowIndex + 2}`);
    return Object.freeze(Object.fromEntries(header.map((name, columnIndex) => [name, cells[columnIndex]])));
  }));
}

export function validateRouteMatrix(rows, { rootDir = process.cwd() } = {}) {
  const errors = [];
  let root;
  try {
    root = realpathSync(resolve(pathFrom(rootDir)));
  } catch {
    return Object.freeze({ ok: false, errors: Object.freeze(["root:invalid"]) });
  }

  const routeCounts = new Map();
  const pageKeys = new Set();
  if (!Array.isArray(rows) || rows.length !== ROUTES.size) errors.push("routes:count");

  for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
    const label = `row:${index + 2}`;
    const descriptors = ownDataDescriptors(row);
    if (!descriptors) {
      errors.push(`${label}:object`);
      continue;
    }
    const values = Object.fromEntries(P3V_MATRIX_FIELDS.map((name) => [name, dataValue(descriptors, name)]));
    routeCounts.set(values.route, (routeCounts.get(values.route) || 0) + 1);
    if (!ROUTES.has(values.route)) errors.push(`${label}:route`);
    if (!values.page_key || pageKeys.has(values.page_key)) errors.push(`${label}:page_key`);
    pageKeys.add(values.page_key);
    if (!ACCESS.has(values.access)) errors.push(`${label}:access`);
    if (!WAVES.has(values.p3v_wave)) errors.push(`${label}:wave`);
    if (!PARITY.has(values.parity_status)) errors.push(`${label}:parity_status`);
    if (!VERIFICATION.has(values.verification)) errors.push(`${label}:verification`);
    for (const fieldName of ["family", "visual_archetype", "gap_summary"]) {
      if (typeof values[fieldName] !== "string" || !values[fieldName].trim()) errors.push(`${label}:${fieldName}`);
    }

    if (typeof values.route === "string" && !values.route.split(/[\\/]+/).includes("..")) {
      const routePath = resolve(root, values.route);
      if (!inside(root, routePath) || !existsSync(routePath) || !statSync(routePath).isFile()) errors.push(`${label}:route:file`);
    }

    for (const fieldName of ["primary_reference", "secondary_reference", "current_baseline"]) {
      const value = values[fieldName];
      if (typeof value !== "string" || !value.trim()) {
        errors.push(`${label}:${fieldName}:missing`);
        continue;
      }
      if (value.startsWith("source://rateware/")) {
        if (values.parity_status === "accepted") errors.push(`${label}:${fieldName}:unpinned`);
        continue;
      }
      if (isAbsolute(value) || value.split(/[\\/]+/).includes("..")) {
        errors.push(`${label}:${fieldName}:outside`);
        continue;
      }
      const candidate = resolve(root, value);
      if (!inside(root, candidate) || !existsSync(candidate) || !statSync(candidate).isFile()) {
        errors.push(`${label}:${fieldName}:file`);
        continue;
      }
      let realCandidate;
      try {
        realCandidate = realpathSync(candidate);
      } catch {
        errors.push(`${label}:${fieldName}:file`);
        continue;
      }
      if (!inside(root, realCandidate)) errors.push(`${label}:${fieldName}:outside`);
    }
    if (values.parity_status === "accepted" && values.verification !== "accepted") {
      errors.push(`${label}:accepted_without_verification`);
    }
  }

  for (const route of ROUTES) {
    if (routeCounts.get(route) !== 1) errors.push(`route:${route}:cardinality`);
  }
  const resultErrors = frozenErrors(errors);
  return Object.freeze({ ok: resultErrors.length === 0, errors: resultErrors });
}

export function evaluateVisualParityScore(record) {
  const errors = [];
  let recordDescriptors;
  try {
    recordDescriptors = ownDataDescriptors(record);
  } catch {
    recordDescriptors = null;
  }
  if (!recordDescriptors) {
    return Object.freeze({ dimensions: Object.freeze({}), total: 0, errors: Object.freeze(["record:object"]), status: "blocked" });
  }

  const recordKeys = Object.keys(recordDescriptors);
  if (recordKeys.length !== SCORE_FIELDS.size || recordKeys.some((key) => !SCORE_FIELDS.has(key))) errors.push("record:keys");
  const dimensionsValue = dataValue(recordDescriptors, "dimensions");
  let dimensionDescriptors;
  try {
    dimensionDescriptors = ownDataDescriptors(dimensionsValue);
  } catch {
    dimensionDescriptors = null;
  }
  if (!dimensionDescriptors) errors.push("dimensions:object");
  const dimensionKeys = Object.keys(dimensionDescriptors || {});
  if (dimensionKeys.length !== Object.keys(P3V_DIMENSIONS).length || dimensionKeys.some((key) => !(key in P3V_DIMENSIONS))) {
    errors.push("dimensions:keys");
  }

  const dimensions = {};
  let total = 0;
  for (const [name, maximum] of Object.entries(P3V_DIMENSIONS)) {
    const value = dataValue(dimensionDescriptors, name);
    dimensions[name] = value;
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > maximum) {
      errors.push(`${name}:points`);
      continue;
    }
    total += value;
    if (value < maximum * 0.8) errors.push(`${name}:minimum`);
  }
  if (total < 90 || total > 100) errors.push("score:threshold");

  const viewports = dataValue(recordDescriptors, "viewports");
  if (!exactViewportMatrix(viewports)) errors.push("viewports:missing");

  const states = dataValue(recordDescriptors, "states");
  const requiredStates = dataValue(recordDescriptors, "required_states");
  if (!plainDenseArray(states) || states.some((state) => typeof state !== "string" || !state.trim()) || new Set(states).size !== states.length) {
    errors.push("states:invalid");
  }
  if (!plainDenseArray(requiredStates) || !requiredStates.length || requiredStates.some((state) => typeof state !== "string" || !state.trim()) || new Set(requiredStates).size !== requiredStates.length) {
    errors.push("required_states:invalid");
  } else {
    const observed = new Set(plainDenseArray(states) ? states : []);
    for (const state of requiredStates) {
      if (!observed.has(state)) errors.push(`state:${state}:missing`);
    }
  }

  if (dataValue(recordDescriptors, "reviewer_verdict") !== "GO") errors.push("review:go_required");
  if (!sha(dataValue(recordDescriptors, "reference_sha256"), 64)) errors.push("reference:sha256");
  if (!sha(dataValue(recordDescriptors, "screenshot_sha256"), 64)) errors.push("screenshot:sha256");
  if (!sha(dataValue(recordDescriptors, "candidate_sha"), 40)) errors.push("candidate:sha");

  const resultErrors = frozenErrors(errors);
  return Object.freeze({
    dimensions: Object.freeze({ ...dimensions }),
    total,
    errors: resultErrors,
    status: resultErrors.length ? "blocked" : "accepted",
  });
}
