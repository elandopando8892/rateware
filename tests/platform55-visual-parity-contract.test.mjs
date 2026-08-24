import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const contractUrl = new URL("../tools/platform55-visual-parity-contract.mjs", import.meta.url);
let contract = Object.freeze({});
let contractImportError = null;
const evidenceUrl = new URL("../tools/platform55-p3v1-evidence.mjs", import.meta.url);
let evidence = Object.freeze({});
let evidenceImportError = null;

try {
  contract = await import(contractUrl);
} catch (error) {
  contractImportError = error;
}

try {
  evidence = await import(evidenceUrl);
} catch (error) {
  evidenceImportError = error;
}

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PRODUCT_SHA = "e962b54ee1ed049b0c020fd8278f48711105477e";
const PRODUCT_TREE = "db331c5d482e629df24feb5e02697066ecf2282f";
const REVIEWED_EVIDENCE_COMMIT = "83ea271e2e93ddc7c99b22be1458cad2549f82c2";
const EVIDENCE_DIRECTORY = `docs/platform55-visual-parity/evidence/p3v1/${PRODUCT_SHA}`;
const INDEPENDENT_REVIEW_PATH = `${EVIDENCE_DIRECTORY}/independent-review.md`;
const INDEPENDENT_REVIEW_SHA256 = "9c46da3be7c39632584c2de04a87ff5f834a6f06294fb6e65867d214fc426479";
const EXPECTED_CAPTURE_FILES = Object.freeze([
  ...["data", "loading", "empty", "error"].flatMap((state) => ["1440x900", "1024x768", "390x844"].map((viewport) => `app-${state}-${viewport}.png`)),
  ...["loaded", "error"].flatMap((state) => ["1440x900", "1024x768", "390x844"].map((viewport) => `rateware-${state}-${viewport}.png`)),
].sort());

function git(...args) {
  return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function trackedIndexBlob(path) {
  git("ls-files", "--error-unmatch", "--", path);
  const indexBlob = git("rev-parse", `:${path}`);
  const workingBlob = git("hash-object", "--", path);
  assert.equal(workingBlob, indexBlob, `${path} must match its tracked index blob`);
  return indexBlob;
}

function exactReviewField(body, name) {
  const matches = [...body.matchAll(new RegExp(`^${name}:\\s*(\\S+)\\s*$`, "gm"))];
  assert.equal(matches.length, 1, `${name} must occur exactly once`);
  return matches[0][1];
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

test("accredits P3-V1 only from the exact independently reviewed product and evidence", async () => {
  assert.ifError(evidenceImportError);
  assert.equal(typeof evidence.loadP3V1Evidence, "function");
  assert.equal(typeof evidence.validateP3V1Evidence, "function");

  git("cat-file", "-e", `${PRODUCT_SHA}^{commit}`);
  assert.equal(git("rev-parse", `${PRODUCT_SHA}^{tree}`), PRODUCT_TREE);
  git("cat-file", "-e", `${REVIEWED_EVIDENCE_COMMIT}^{commit}`);
  execFileSync("git", ["-C", ROOT, "merge-base", "--is-ancestor", REVIEWED_EVIDENCE_COMMIT, "HEAD"], { stdio: "pipe" });

  const loaded = evidence.loadP3V1Evidence(ROOT);
  const result = evidence.validateP3V1Evidence({
    rootDir: ROOT,
    manifest: loaded.manifest,
    designReview: loaded.designReview,
    evidenceDirectory: loaded.evidenceDirectory,
    requireTracked: true,
  });
  assert.deepEqual(result, { captures: 18, scores: { "app.html": 91, "rateware.html": 90 } });
  assert.deepEqual(loaded.manifest.captures.map((capture) => capture.file).sort(), EXPECTED_CAPTURE_FILES);

  const reviewedEvidencePaths = [
    `${EVIDENCE_DIRECTORY}/manifest.json`,
    `${EVIDENCE_DIRECTORY}/design-review.md`,
    ...loaded.manifest.captures.map((capture) => `${EVIDENCE_DIRECTORY}/${capture.file}`),
  ];
  for (const path of reviewedEvidencePaths) {
    assert.equal(
      git("rev-parse", `HEAD:${path}`),
      git("rev-parse", `${REVIEWED_EVIDENCE_COMMIT}:${path}`),
      `${path} must remain byte-identical to the independently reviewed commit`,
    );
  }
  for (const path of [
    ...reviewedEvidencePaths,
    ...Object.keys(loaded.manifest.source_blobs),
    ...loaded.manifest.captures.map((capture) => capture.reference_path),
  ]) {
    git("ls-files", "--error-unmatch", "--", path);
  }

  const independentReview = await readFile(new URL(`../${INDEPENDENT_REVIEW_PATH}`, import.meta.url), "utf8");
  const normalizedReview = independentReview.replace(/\r\n/g, "\n");
  assert.equal(createHash("sha256").update(normalizedReview).digest("hex"), INDEPENDENT_REVIEW_SHA256);
  trackedIndexBlob(INDEPENDENT_REVIEW_PATH);
  assert.equal(exactReviewField(normalizedReview, "reviewed_product_sha"), PRODUCT_SHA);
  assert.equal(exactReviewField(normalizedReview, "reviewed_product_tree"), PRODUCT_TREE);
  assert.equal(exactReviewField(normalizedReview, "reviewed_evidence_commit"), REVIEWED_EVIDENCE_COMMIT);
  assert.equal(exactReviewField(normalizedReview, "reviewer_verdict"), "GO");
  assert.equal(exactReviewField(normalizedReview, "p0"), "0");
  assert.equal(exactReviewField(normalizedReview, "p1"), "0");
  assert.equal(exactReviewField(normalizedReview, "p2"), "0");
  assert.match(normalizedReview, /Capture matrix:\s*`18\/18`/);
  assert.match(normalizedReview, /Command Center \(`app\.html`\):\s*`91\/100`/);
  assert.match(normalizedReview, /Rateware \(`rateware\.html`\):\s*`90\/100`/);

  const rows = await canonicalRows();
  assert.deepEqual(
    rows.filter((row) => row.parity_status === "accepted").map((row) => row.route).sort(),
    ["app.html", "rateware.html"],
    "P3-V1 closure must accredit only the two independently reviewed routes",
  );
  for (const [route, representative] of [["app.html", "app-data-1440x900.png"], ["rateware.html", "rateware-loaded-1440x900.png"]]) {
    const row = rows.find((candidate) => candidate.route === route);
    assert.equal(row.parity_status, "accepted", `${route} must be accepted only after independent GO`);
    assert.equal(row.verification, "accepted", `${route} verification must be accepted`);
    assert.equal(row.current_baseline, `${EVIDENCE_DIRECTORY}/${representative}`);
    assert.match(row.gap_summary, new RegExp(EVIDENCE_DIRECTORY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const board = await readFile(new URL("../docs/platform55-visual-parity/README.md", import.meta.url), "utf8");
  assert.match(board, /P3-V visual parity track:\s*`25%`/);
  assert.match(board, /Formal release progress:\s*General `83%`; P0-P2 `100%`; P3-P5 `0%`/);

  const ledger = JSON.parse(await readFile(new URL("../docs/release/production-readiness-ledger.json", import.meta.url), "utf8"));
  const p3 = ledger.sprints.find((sprint) => sprint.id === "P3");
  assert.equal(p3.progress, 0);
  assert.deepEqual(p3.evidence, {});
});

test("rejects a P3-V1 closure summary that only names the evidence directory", async () => {
  assert.ifError(evidenceImportError);
  assert.equal(
    typeof evidence.validateP3V1ClosureAccreditation,
    "function",
    "P3-V1 closure must expose a reusable semantic accreditation validator",
  );

  const rows = await canonicalRows();
  const fabricated = structuredClone(rows);
  fabricated.find((row) => row.route === "app.html").gap_summary = EVIDENCE_DIRECTORY;

  assert.throws(
    () => evidence.validateP3V1ClosureAccreditation({
      rootDir: ROOT,
      rows: fabricated,
      requireTracked: true,
    }),
    /gap summary|semantic accreditation/i,
  );
});

test("rejects noncanonical route sets before P3-V1 semantic accreditation", async () => {
  assert.ifError(evidenceImportError);
  const rows = structuredClone(await canonicalRows());
  const extra = [
    ...structuredClone(rows),
    { ...structuredClone(rows.at(-1)), route: "extra.html", page_key: "extra" },
  ];
  const missing = structuredClone(rows.slice(0, -1));
  const duplicate = [
    ...structuredClone(rows.slice(0, -1)),
    structuredClone(rows[1]),
  ];

  const rejected = [];
  for (const [label, candidateRows] of [
    ["extra full-shape route", extra],
    ["missing canonical route", missing],
    ["duplicate canonical route", duplicate],
  ]) {
    try {
      evidence.validateP3V1ClosureAccreditation({
        rootDir: ROOT,
        rows: candidateRows,
        requireTracked: true,
      });
      rejected.push(false);
    } catch (error) {
      assert.match(error.message, /route matrix/i, label);
      rejected.push(true);
    }
  }
  assert.deepEqual(rejected, [true, true, true]);
});

test("binds P3-V1 semantic accreditation to the exact independent GO review", async () => {
  assert.ifError(evidenceImportError);
  const rows = await canonicalRows();
  const independentReview = await readFile(new URL(`../${INDEPENDENT_REVIEW_PATH}`, import.meta.url), "utf8");

  assert.deepEqual(
    evidence.validateP3V1ClosureAccreditation({
      rootDir: ROOT,
      rows,
      independentReview,
      requireTracked: true,
    }),
    { captures: 18, scores: { "app.html": 91, "rateware.html": 90 }, routes: ["app.html", "rateware.html"] },
  );
  assert.throws(
    () => evidence.validateP3V1ClosureAccreditation({
      rootDir: ROOT,
      rows,
      independentReview: independentReview.replace("reviewer_verdict: GO", "reviewer_verdict: NO-GO"),
      requireTracked: true,
    }),
    /independent review|verdict|digest/i,
  );
});

test("binds P3-V1 semantic accreditation to the validated visual result", async () => {
  assert.ifError(evidenceImportError);
  const rows = await canonicalRows();
  const loaded = evidence.loadP3V1Evidence(ROOT);
  const independentReview = await readFile(new URL(`../${INDEPENDENT_REVIEW_PATH}`, import.meta.url), "utf8");

  assert.deepEqual(
    evidence.validateP3V1ClosureAccreditation({
      rootDir: ROOT,
      rows,
      independentReview,
      ...loaded,
      requireTracked: true,
    }),
    { captures: 18, scores: { "app.html": 91, "rateware.html": 90 }, routes: ["app.html", "rateware.html"] },
  );

  const scoreDrift = loaded.designReview.replace('"shell_frame":18', '"shell_frame":1');
  assert.throws(
    () => evidence.validateP3V1ClosureAccreditation({
      rootDir: ROOT,
      rows,
      independentReview,
      ...loaded,
      designReview: scoreDrift,
    }),
    /score|accepted/i,
  );
});
