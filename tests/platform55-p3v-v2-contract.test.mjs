import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseRouteMatrix } from "../tools/platform55-visual-parity-contract.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const ids = (source) => [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]).sort();
const digest = (values) => createHash("sha256").update(values.join("\n")).digest("hex");

const routes = Object.freeze({
  "upload-center.html": Object.freeze({ count: 19, sha256: "566593409b964dee101d20316307cfdd096b6529c33287b2eb4419fee69ced11", pageClass: "p55-vp-page--upload-center", requiredStates: Object.freeze(["loaded", "empty", "validation-error"]) }),
  "upload-history.html": Object.freeze({ count: 36, sha256: "b02043fee5e60ef2a0b225b15bc8bd71b9c24ede745c4fe5a96d45afc44a656f", pageClass: "p55-vp-page--source-files", requiredStates: Object.freeze(["loaded", "empty", "processing-error"]) }),
  "staging-review.html": Object.freeze({ count: 89, sha256: "e7484a7fe7217b501d19e6eeeb69f1467d3ca9acd541ae8a9d257adba07e4d49", pageClass: "p55-vp-page--review-queue", requiredStates: Object.freeze(["loaded", "empty", "review-required"]) }),
});

test("P3-V2 contains exactly the three governed Operate routes", async () => {
  const rows = parseRouteMatrix(await read("docs/platform55-visual-parity/p3v-route-matrix.csv"));
  assert.deepEqual(rows.filter((row) => row.p3v_wave === "P3-V2").map((row) => row.route).sort(), Object.keys(routes).sort());
});

test("P3-V2 preserves every controller ID", async () => {
  for (const [path, expected] of Object.entries(routes)) {
    const values = ids(await read(path));
    assert.equal(values.length, expected.count, path);
    assert.equal(digest(values), expected.sha256, path);
  }
});

test("P3-V2 routes load the shared visual layer and expose real state hooks", async () => {
  for (const [path, expected] of Object.entries(routes)) {
    const source = await read(path);
    assert.match(source, /platform55-operate\.css[\s\S]*platform55-visual-parity\.css/, path);
    assert.match(source, new RegExp(`class="[^"]*p55-vp-page[^"]*${expected.pageClass}`), path);
    assert.equal((source.match(/data-platform55-page-content/g) || []).length, 1, path);
    for (const state of expected.requiredStates) assert.match(source, new RegExp(`data-p3v2-state="${state}"`), `${path}:${state}`);
  }
});

test("P3-V2 preserves staging-first and human-approval boundaries", async () => {
  const upload = await read("upload-center.html");
  const review = await read("staging-review.html");
  assert.match(upload, /Preserve source files before interpretation and human review/);
  assert.match(upload, /id="file-input"[\s\S]*name="files"/);
  assert.match(review, /Human approval is required before any production Rateware insert/);
  assert.match(review, /id="bulk-selection-count"/);
  assert.match(review, /id="staging-filtered-count"/);
  assert.match(review, /id="bulk-approve-button"[^>]*disabled/);
  assert.match(review, /id="bulk-approve-filtered-button"/);
});

test("P3-V2 keeps page selection and filtered database actions distinct", async () => {
  const review = await read("staging-review.html");
  const pageScope = review.indexOf('id="bulk-selection-count"');
  const filteredScope = review.indexOf('id="staging-filtered-count"');
  const selectedApproval = review.indexOf('id="bulk-approve-button"');
  const filteredApproval = review.indexOf('id="bulk-approve-filtered-button"');
  assert.ok(pageScope >= 0 && filteredScope > pageScope);
  assert.ok(selectedApproval >= 0 && filteredApproval > selectedApproval);
  assert.match(review, /data-p3v2-selection-scope="page"/);
  assert.match(review, /data-p3v2-selection-scope="filtered-database"/);
});
