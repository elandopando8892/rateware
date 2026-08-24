import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contractUrl = new URL("../tools/platform55-visual-parity-contract.mjs", import.meta.url);
let contract = Object.freeze({});
let contractImportError = null;

try {
  contract = await import(contractUrl);
} catch (error) {
  contractImportError = error;
}

const EXPECTED_FIELDS = Object.freeze([
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

const EXPECTED_ROUTES = Object.freeze([
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

const ACCEPTED_SCORE = Object.freeze({
  dimensions: Object.freeze({
    shell_frame: 19,
    interior_hierarchy: 23,
    visual_system: 18,
    components_states: 18,
    responsive_accessibility: 14,
  }),
  viewports: Object.freeze([
    Object.freeze([1440, 900]),
    Object.freeze([1024, 768]),
    Object.freeze([390, 844]),
  ]),
  states: Object.freeze(["loaded", "error"]),
  required_states: Object.freeze(["loaded", "error"]),
  reviewer_verdict: "GO",
  reference_sha256: "a".repeat(64),
  screenshot_sha256: "b".repeat(64),
  candidate_sha: "c".repeat(40),
});

function requireFunction(name) {
  assert.equal(typeof contract[name], "function", `${name} must be exported`);
  return contract[name];
}

async function canonicalRows() {
  const parseRouteMatrix = requireFunction("parseRouteMatrix");
  const text = await readFile(new URL("../docs/platform55-visual-parity/p3v-route-matrix.csv", import.meta.url), "utf8");
  return parseRouteMatrix(text);
}

function mutableRows(rows) {
  return rows.map((row) => ({ ...row }));
}

test("loads the visual parity contract module", () => {
  assert.ifError(contractImportError);
});

test("exports the exact score weights and viewports", () => {
  assert.deepEqual(contract.P3V_DIMENSIONS, {
    shell_frame: 20,
    interior_hierarchy: 25,
    visual_system: 20,
    components_states: 20,
    responsive_accessibility: 15,
  });
  assert.deepEqual(contract.P3V_VIEWPORTS, [[1440, 900], [1024, 768], [390, 844]]);
  assert.deepEqual(contract.P3V_MATRIX_FIELDS, EXPECTED_FIELDS);
});

test("parses quoted CSV fields without corrupting commas or escaped quotes", () => {
  const parseRouteMatrix = requireFunction("parseRouteMatrix");
  const header = EXPECTED_FIELDS.join(",");
  const row = [
    "app.html",
    "app",
    "authenticated",
    "Home",
    "command-center",
    "docs/reference.png",
    "docs/secondary.png",
    "docs/current.png",
    "partial",
    'Hierarchy, spacing, and "density" remain',
    "P3-V1",
    "unverified",
  ].map((value) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value).join(",");
  const [parsed] = parseRouteMatrix(`${header}\r\n${row}\r\n`);
  assert.equal(parsed.gap_summary, 'Hierarchy, spacing, and "density" remain');
  assert.equal(parsed.route, "app.html");
  assert.ok(Object.isFrozen(parsed));
});

test("rejects malformed CSV before route validation", () => {
  const parseRouteMatrix = requireFunction("parseRouteMatrix");
  assert.throws(() => parseRouteMatrix(""), /non-empty/i);
  assert.throws(() => parseRouteMatrix("wrong,header\na,b"), /header/i);
  assert.throws(() => parseRouteMatrix(`${EXPECTED_FIELDS.join(",")}\napp.html`), /ragged/i);
  assert.throws(() => parseRouteMatrix(`${EXPECTED_FIELDS.join(",")}\n"app.html`), /unterminated/i);
});

test("accepts the canonical board as exactly 29 unique in-repo routes", async () => {
  const validateRouteMatrix = requireFunction("validateRouteMatrix");
  const rows = await canonicalRows();
  assert.equal(rows.length, 29);
  assert.deepEqual([...new Set(rows.map((row) => row.route))].sort(), EXPECTED_ROUTES);
  assert.deepEqual(validateRouteMatrix(rows, { rootDir: new URL("../", import.meta.url) }), { ok: true, errors: [] });
});

test("rejects missing, duplicate, unknown, and malformed route records", async () => {
  const validateRouteMatrix = requireFunction("validateRouteMatrix");
  const rows = mutableRows(await canonicalRows());

  const missing = rows.slice(1);
  assert.equal(validateRouteMatrix(missing, { rootDir: new URL("../", import.meta.url) }).ok, false);

  const duplicate = mutableRows(rows);
  duplicate[1].route = duplicate[0].route;
  duplicate[1].page_key = duplicate[0].page_key;
  const duplicateErrors = validateRouteMatrix(duplicate, { rootDir: new URL("../", import.meta.url) }).errors;
  assert.ok(duplicateErrors.some((error) => error.includes("cardinality")));
  assert.ok(duplicateErrors.some((error) => error.includes("page_key")));

  const malformed = mutableRows(rows);
  Object.assign(malformed[0], {
    route: "unknown.html",
    access: "internal",
    family: " ",
    visual_archetype: "",
    parity_status: "done",
    gap_summary: "",
    p3v_wave: "P3-V7",
    verification: "trusted",
  });
  const malformedErrors = validateRouteMatrix(malformed, { rootDir: new URL("../", import.meta.url) }).errors;
  for (const fragment of ["route", "access", "family", "visual_archetype", "parity_status", "gap_summary", "wave", "verification"]) {
    assert.ok(malformedErrors.some((error) => error.includes(fragment)), `missing ${fragment} rejection`);
  }
});

test("rejects unsafe, missing, and unpinned accepted evidence paths", async () => {
  const validateRouteMatrix = requireFunction("validateRouteMatrix");
  const rows = mutableRows(await canonicalRows());
  rows[0].current_baseline = "../outside.png";
  assert.ok(validateRouteMatrix(rows, { rootDir: new URL("../", import.meta.url) }).errors.some((error) => error.includes("outside")));

  const missing = mutableRows(await canonicalRows());
  missing[0].current_baseline = "docs/platform55-visual-parity/baseline/missing.png";
  assert.ok(validateRouteMatrix(missing, { rootDir: new URL("../", import.meta.url) }).errors.some((error) => error.includes("file")));

  const accepted = mutableRows(await canonicalRows());
  const sourceRow = accepted.find((row) => row.primary_reference.startsWith("source://rateware/"));
  sourceRow.parity_status = "accepted";
  sourceRow.verification = "accepted";
  assert.ok(validateRouteMatrix(accepted, { rootDir: new URL("../", import.meta.url) }).errors.some((error) => error.includes("unpinned")));
});

test("accepts only a score at or above 90 with every dimension at 80 percent", () => {
  const evaluateVisualParityScore = requireFunction("evaluateVisualParityScore");
  const result = evaluateVisualParityScore(ACCEPTED_SCORE);
  assert.equal(result.total, 92);
  assert.equal(result.status, "accepted");
  assert.deepEqual(result.errors, []);

  const weakDimension = evaluateVisualParityScore({
    ...ACCEPTED_SCORE,
    dimensions: { ...ACCEPTED_SCORE.dimensions, shell_frame: 15, interior_hierarchy: 25 },
  });
  assert.equal(weakDimension.total, 90);
  assert.equal(weakDimension.status, "blocked");
  assert.ok(weakDimension.errors.includes("shell_frame:minimum"));

  const lowTotal = evaluateVisualParityScore({
    ...ACCEPTED_SCORE,
    dimensions: {
      shell_frame: 16,
      interior_hierarchy: 20,
      visual_system: 16,
      components_states: 16,
      responsive_accessibility: 12,
    },
  });
  assert.equal(lowTotal.total, 80);
  assert.equal(lowTotal.status, "blocked");
  assert.ok(lowTotal.errors.includes("score:threshold"));
});

test("rejects missing viewports, states, GO verdict, and immutable hashes", () => {
  const evaluateVisualParityScore = requireFunction("evaluateVisualParityScore");
  const cases = [
    [{ ...ACCEPTED_SCORE, viewports: [[1440, 900], [1024, 768]] }, "viewports:missing"],
    [{ ...ACCEPTED_SCORE, viewports: [[1440, 900], [1024, 768], [390, 844], [390, 844]] }, "viewports:missing"],
    [{ ...ACCEPTED_SCORE, states: ["loaded"] }, "state:error:missing"],
    [{ ...ACCEPTED_SCORE, reviewer_verdict: "NO-GO" }, "review:go_required"],
    [{ ...ACCEPTED_SCORE, reference_sha256: "source://rateware/example.png" }, "reference:sha256"],
    [{ ...ACCEPTED_SCORE, screenshot_sha256: "b".repeat(63) }, "screenshot:sha256"],
    [{ ...ACCEPTED_SCORE, candidate_sha: `${"c".repeat(40)}\n` }, "candidate:sha"],
  ];
  for (const [record, expectedError] of cases) {
    const result = evaluateVisualParityScore(record);
    assert.equal(result.status, "blocked");
    assert.ok(result.errors.includes(expectedError), `${expectedError} was not reported`);
  }
});

test("rejects non-integer, non-finite, inherited, accessor, and extra score data", () => {
  const evaluateVisualParityScore = requireFunction("evaluateVisualParityScore");
  for (const value of ["19", true, null, Number.NaN, Number.POSITIVE_INFINITY, 19.5, -1, 21]) {
    const result = evaluateVisualParityScore({
      ...ACCEPTED_SCORE,
      dimensions: { ...ACCEPTED_SCORE.dimensions, shell_frame: value },
    });
    assert.equal(result.status, "blocked");
    assert.ok(result.errors.includes("shell_frame:points"));
  }

  const inherited = Object.create({ shell_frame: 19 });
  Object.assign(inherited, {
    interior_hierarchy: 23,
    visual_system: 18,
    components_states: 18,
    responsive_accessibility: 14,
  });
  assert.equal(evaluateVisualParityScore({ ...ACCEPTED_SCORE, dimensions: inherited }).status, "blocked");

  let getterCalls = 0;
  const accessor = { ...ACCEPTED_SCORE.dimensions };
  Object.defineProperty(accessor, "shell_frame", { enumerable: true, get() { getterCalls += 1; return 19; } });
  assert.equal(evaluateVisualParityScore({ ...ACCEPTED_SCORE, dimensions: accessor }).status, "blocked");
  assert.equal(getterCalls, 0);

  assert.equal(evaluateVisualParityScore({ ...ACCEPTED_SCORE, unexpected: "trusted" }).status, "blocked");
});

test("fails closed for invalid top-level score inputs without throwing", () => {
  const evaluateVisualParityScore = requireFunction("evaluateVisualParityScore");
  for (const input of [null, undefined, true, [], "score", Object.create(null)]) {
    const result = evaluateVisualParityScore(input);
    assert.equal(result.status, "blocked");
    assert.ok(result.errors.length > 0);
  }
});
