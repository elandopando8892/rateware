import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { startOperateEvidenceServer } from "../tools/platform55-operate-evidence-server.mjs";
import {
  loadPlatform55SourceSupersessions,
  validateHistoricalSourceParity,
} from "../tools/platform55-s6-source-supersession.mjs";

test("serves actual Operate routes while replacing only auth and data boundaries", async (t) => {
  const instance = await startOperateEvidenceServer({ rootDir: process.cwd(), port: 0 });
  t.after(() => instance.close());

  const routeResponse = await fetch(`${instance.origin}/upload-center.html?qa_state=loaded`);
  assert.equal(routeResponse.status, 200);
  assert.equal(await routeResponse.text(), await readFile("upload-center.html", "utf8"));

  const moduleResponse = await fetch(`${instance.origin}/src/upload-center.js?qa_state=loaded`);
  assert.equal(moduleResponse.status, 200);
  assert.equal(await moduleResponse.text(), await readFile("src/upload-center.js", "utf8"));

  const authResponse = await fetch(`${instance.origin}/src/auth.js?qa_state=loaded`);
  const authSource = await authResponse.text();
  assert.equal(authResponse.status, 200);
  assert.match(authSource, /RATEWARE_OPERATE_QA_BOUNDARY/);
  assert.doesNotMatch(authSource, /kinde|oauth|supabase/i);

  const dataResponse = await fetch(`${instance.origin}/src/upload-service.js?qa_state=error`);
  const dataSource = await dataResponse.text();
  assert.equal(dataResponse.status, 200);
  assert.match(dataSource, /RATEWARE_OPERATE_QA_BOUNDARY/);
  assert.doesNotMatch(dataSource, /SUPABASE_URL|authenticatedFetch|callRatewareApi/);

  const writeResponse = await fetch(`${instance.origin}/upload-center.html`, { method: "POST" });
  assert.equal(writeResponse.status, 405);

  const faviconResponse = await fetch(`${instance.origin}/favicon.ico`);
  assert.equal(faviconResponse.status, 204);
});

test("anchors the complete actual-route capture matrix to its immutable subject", async () => {
  const evidence = await readFile("docs/release/evidence/2026-08-21-p2-s2-operate.md", "utf8");
  const subject = evidence.match(/Final candidate SHA:\s*`([0-9a-f]{40})`/i)?.[1];
  assert.ok(subject, "evidence must name the immutable final candidate SHA");

  const directory = `docs/platform55-evidence/p2-s2/${subject}`;
  const manifest = JSON.parse(await readFile(`${directory}/manifest.json`, "utf8"));
  assert.equal(manifest.schema_version, 4);
  assert.equal(manifest.subject_sha, subject);
  assert.deepEqual(manifest.routes, ["upload-center", "upload-history", "staging-review", "rateware"]);
  assert.deepEqual(manifest.states, ["loaded", "error"]);
  assert.deepEqual(manifest.viewports, ["1440x900", "1024x768", "390x844"]);
  assert.equal(manifest.captures.length, 24);

  const sourcePaths = [
    "upload-center.html",
    "upload-history.html",
    "staging-review.html",
    "rateware.html",
    "src/upload-center.js",
    "src/upload-history.js",
    "src/staging-review.js",
    "src/rateware.js",
    "src/platform55-shell.js",
    "src/platform55-operate.css"
  ];
  assert.deepEqual(Object.keys(manifest.source_git_blobs), sourcePaths);
  const subjectBlobs = [];
  const currentBlobs = [];
  const workingBlobs = [];
  for (const sourcePath of sourcePaths) {
    const subjectBlob = execFileSync("git", ["rev-parse", `${subject}:${sourcePath}`], { encoding: "utf8" }).trim();
    const currentBlob = execFileSync("git", ["rev-parse", `HEAD:${sourcePath}`], { encoding: "utf8" }).trim();
    const workingBlob = execFileSync("git", ["hash-object", "--", sourcePath], { encoding: "utf8" }).trim();
    assert.equal(manifest.source_git_blobs[sourcePath], subjectBlob, `${sourcePath} must be anchored to the subject Git blob`);
    subjectBlobs.push(subjectBlob);
    currentBlobs.push(currentBlob);
    workingBlobs.push(workingBlob);
  }
  validateHistoricalSourceParity({
    sourcePaths,
    manifestBlobs: manifest.source_git_blobs,
    subjectBlobs,
    currentBlobs,
    workingBlobs,
    supersession: loadPlatform55SourceSupersessions(),
  });

  for (const capture of manifest.captures) {
    assert.equal(capture.exact_viewport, true, `${capture.file} must use the requested viewport`);
    assert.equal(capture.document_overflow, false, `${capture.file} must not contain horizontal overflow`);
    assert.equal(capture.active_routes, 1, `${capture.file} must expose one active route`);
    assert.equal(capture.page_module_declared, true, `${capture.file} must load the actual page module`);
    assert.equal(capture.console_errors, 0, `${capture.file} must have zero browser console errors`);
    assert.equal(capture.http_errors, 0, `${capture.file} must have zero HTTP responses at or above 400`);
    assert.ok(Number.isFinite(capture.content_width_ratio), `${capture.file} must record its content width ratio`);
    assert.ok(capture.content_width_ratio >= 0.65, `${capture.file} must not collapse into a narrow fraction of the viewport`);
    assert.ok(capture.layout_stability_samples >= 3, `${capture.file} must be captured only after three stable layout samples`);
    assert.equal(capture.state_visible, true, `${capture.file} must visibly contain its requested state`);
    assert.match(capture.state_marker, /\S/, `${capture.file} must record the visible state marker`);
    assert.match(capture.state_selector, /\S/, `${capture.file} must record the target state selector`);
    assert.ok(capture.state_intersection_ratio >= 0.8, `${capture.file} must keep at least 80% of the requested state inside the viewport`);
    if (capture.state === "error") {
      assert.equal(capture.scrolled_to_state, true, `${capture.file} must place its non-happy state inside the captured viewport`);
    }
    assert.match(capture.sha256, /^[0-9a-f]{64}$/);
    const capturePath = `${directory}/${capture.file}`;
    await access(capturePath);
    const png = await readFile(capturePath);
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", `${capture.file} must be a PNG`);
    const expectedViewport = capture.file.match(/-(\d+)x(\d+)\.png$/);
    assert.ok(expectedViewport, `${capture.file} must encode its viewport in the filename`);
    assert.equal(png.readUInt32BE(16), Number(expectedViewport[1]), `${capture.file} width must match its requested viewport`);
    assert.equal(png.readUInt32BE(20), Number(expectedViewport[2]), `${capture.file} height must match its requested viewport`);
    assert.equal(createHash("sha256").update(png).digest("hex"), capture.sha256, `${capture.file} hash must match its bytes`);
  }
});
