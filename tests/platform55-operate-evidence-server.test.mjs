import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { startOperateEvidenceServer } from "../tools/platform55-operate-evidence-server.mjs";

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
});
