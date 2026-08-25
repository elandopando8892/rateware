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
  "vendors.html": Object.freeze({ count: 211, sha256: "d529e5f3adf565717c6973f014ac4c275e0c8ab517a15b4d6a46336dfd015924", pageClass: "p55-vp-page--carrier-network", states: Object.freeze(["loaded", "empty", "duplicate-review"]) }),
  "rfx-process.html": Object.freeze({ count: 21, sha256: "51460f321f4e0633967f17f1ee50d435670a1bb4a08189dc64dab5e91ca9293c", pageClass: "p55-vp-page--rfx-process", states: Object.freeze(["loaded", "empty", "readiness-blocked"]) }),
  "rfx-events.html": Object.freeze({ count: 285, sha256: "7af26a443aa3770c91045bd27ca51eed4f2a5b01169bfe4de1231a14b4c3ad67", pageClass: "p55-vp-page--bid-room", states: Object.freeze(["loaded", "empty", "launch-blocked"]) }),
  "ratebook.html": Object.freeze({ count: 53, sha256: "39e3cd7f516866b9003b51a167800c9f2c623c8ded6828d9cc9272c2caf1efe9", pageClass: "p55-vp-page--ratebook", states: Object.freeze(["loaded", "empty", "validity-warning"]) }),
  "outreach.html": Object.freeze({ count: 58, sha256: "835b5526aa22d2c061d45a18222cb1958061cb1060f44a255e6731923fa53b04", pageClass: "p55-vp-page--outreach", states: Object.freeze(["loaded", "empty", "review-required"]) }),
});

test("P3-V3 contains exactly the five Procurement and Network routes", async () => {
  const rows = parseRouteMatrix(await read("docs/platform55-visual-parity/p3v-route-matrix.csv"));
  assert.deepEqual(rows.filter((row) => row.p3v_wave === "P3-V3").map((row) => row.route).sort(), Object.keys(routes).sort());
});

test("P3-V3 preserves every existing controller ID", async () => {
  for (const [path, expected] of Object.entries(routes)) {
    const values = ids(await read(path));
    assert.equal(values.length, expected.count, path);
    assert.equal(digest(values), expected.sha256, path);
  }
});

test("P3-V3 routes load the shared visual layer and declare real comparison states", async () => {
  for (const [path, expected] of Object.entries(routes)) {
    const source = await read(path);
    assert.match(source, /platform55-procurement\.css[\s\S]*platform55-visual-parity\.css/, path);
    assert.match(source, new RegExp(`class="[^"]*p55-vp-page[^"]*${expected.pageClass}`), path);
    assert.equal((source.match(/data-platform55-page-content/g) || []).length, 1, path);
    const declared = source.match(/data-p3v3-states="([^"]+)"/)?.[1]?.split(/\s+/) || [];
    for (const state of expected.states) assert.ok(declared.includes(state), `${path}:${state}`);
  }
});

test("P3-V3 exposes the Platform 55 Procurement and Network composition primitives", async () => {
  const css = await read("src/platform55-visual-parity.css");
  for (const selector of [
    ".p55-vp-identity-grid",
    ".p55-vp-lifecycle-rail",
    ".p55-vp-procurement-workspace",
    ".p55-vp-evidence-boundary",
    ".p55-vp-network-detail",
  ]) assert.match(css, new RegExp(selector.replaceAll(".", "\\.")), selector);
  assert.doesNotMatch(css, /!important/);
  assert.match(css, /@media \(max-width: 1100px\)/);
  assert.match(css, /@media \(max-width: 680px\)/);
});

test("Carrier Network separates canonical identity from procurement readiness", async () => {
  const source = await read("vendors.html");
  assert.match(source, /data-p3v3-boundary="canonical-carrier-identity"/);
  assert.match(source, /id="vendor-metric-total"/);
  assert.match(source, /id="vendors-body"/);
  assert.match(source, /id="vendor-drawer"[^>]*class="[^"]*vendor-profile-drawer/);
  assert.match(source, /Canonical identity does not grant procurement eligibility/);
});

test("RFx lifecycle keeps readiness, bid operations, and human award authority explicit", async () => {
  const process = await read("rfx-process.html");
  const events = await read("rfx-events.html");
  assert.match(process, /data-p3v3-boundary="rfx-readiness"/);
  assert.match(process, /id="rfx-process-readiness"/);
  assert.match(events, /data-p3v3-boundary="human-award-authority"/);
  assert.match(events, /id="rfx-ops-stage-rail"/);
  assert.match(events, /id="rfx-launch-readiness"/);
  assert.match(events, /A human owns award approval/);
});

test("Ratebook and Outreach expose validity, review, and delivery boundaries", async () => {
  const ratebook = await read("ratebook.html");
  const outreach = await read("outreach.html");
  assert.match(ratebook, /data-p3v3-boundary="rate-validity"/);
  assert.match(ratebook, /class="[^"]*ratebook-health-summary/);
  assert.match(ratebook, /id="export-ratebook-routes"/);
  assert.match(outreach, /data-p3v3-boundary="communication-review"/);
  assert.match(outreach, /id="outreach-ops-health"/);
  assert.match(outreach, /id="create-campaign-button"/);
  assert.match(outreach, /Drafting does not authorize delivery/);
});
