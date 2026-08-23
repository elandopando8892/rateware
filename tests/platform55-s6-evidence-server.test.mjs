import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import test from "node:test";
import { startS6CommandEvidenceServer } from "../tools/platform55-s6-command-evidence-server.mjs";

function rawStatus(origin, path, method = "GET") {
  return new Promise((resolve, reject) => {
    const target = new URL(origin);
    const call = request({ hostname: target.hostname, port: target.port, method, path }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
    });
    call.once("error", reject);
    call.end();
  });
}

test("serves the actual Command Center behind deterministic local boundaries", async () => {
  const server = await startS6CommandEvidenceServer({ rootDir: process.cwd() });
  try {
    const app = await fetch(`${server.origin}/app.html`);
    assert.equal(app.status, 200);
    assert.equal(await app.text(), await readFile("app.html", "utf8"));
    assert.equal((await fetch(`${server.origin}/favicon.ico`)).status, 204);
    for (const path of ["/src/auth.js", "/src/rateware-api.js"]) {
      const response = await fetch(`${server.origin}${path}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-rateware-qa-boundary"), "true");
      assert.match(await response.text(), /RATEWARE_S6_QA_BOUNDARY/);
    }
  } finally {
    await server.close();
  }
});

test("blocks mutation methods, traversal, and missing files without writing", async () => {
  const server = await startS6CommandEvidenceServer({ rootDir: process.cwd() });
  try {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert.equal(await rawStatus(server.origin, "/app.html", method), 405);
    }
    assert.equal(await rawStatus(server.origin, "/%2e%2e/package.json"), 404);
    assert.equal(await rawStatus(server.origin, "/missing.html"), 404);
  } finally {
    await server.close();
  }
});

test("keeps every Command Center fixture state read-only and deterministic", async () => {
  const server = await startS6CommandEvidenceServer({ rootDir: process.cwd() });
  try {
    const source = await (await fetch(`${server.origin}/src/rateware-api.js`)).text();
    for (const state of ["data", "loading", "empty", "error", "retry"]) assert.match(source, new RegExp(`\\b${state}\\b`));
    assert.match(source, /action !== "dashboard_summary"/);
    assert.doesNotMatch(source, /fetch\s*\(/);
  } finally {
    await server.close();
  }
});
