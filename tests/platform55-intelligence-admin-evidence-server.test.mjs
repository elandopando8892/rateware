import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import test from "node:test";
import { startIntelligenceAdminEvidenceServer } from "../tools/platform55-intelligence-admin-evidence-server.mjs";

const routes = ["business-intelligence", "growth-hacking", "settings", "interpretation-memory", "catalog-workbench", "index"];

function rawStatus(origin, path) {
  return new Promise((resolve, reject) => {
    const target = new URL(origin);
    const call = request({ hostname: target.hostname, port: target.port, method: "GET", path }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
    });
    call.once("error", reject);
    call.end();
  });
}

test("serves the six actual S5 routes behind deterministic read-only boundaries", async () => {
  const server = await startIntelligenceAdminEvidenceServer({ rootDir: process.cwd() });
  try {
    for (const route of routes) {
      const response = await fetch(`${server.origin}/${route}.html`);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), await readFile(`${route}.html`, "utf8"));
    }
    assert.equal((await fetch(`${server.origin}/favicon.ico`)).status, 204);
    assert.equal((await fetch(`${server.origin}/src/auth.js`)).headers.get("x-rateware-qa-boundary"), "true");
    assert.equal((await fetch(`${server.origin}/src/business-intelligence-service.js`)).headers.get("x-rateware-qa-boundary"), "true");
    assert.equal((await fetch(`${server.origin}/src/catalog-workbench.js`)).headers.get("x-rateware-qa-boundary"), "true");
  } finally {
    await server.close();
  }
});

test("blocks writes, traversal, missing files, and external XLSX loading", async () => {
  const server = await startIntelligenceAdminEvidenceServer({ rootDir: process.cwd() });
  try {
    assert.equal((await fetch(`${server.origin}/settings.html`, { method: "POST" })).status, 405);
    assert.equal((await fetch(`${server.origin}/missing.html`)).status, 404);
    assert.equal(await rawStatus(server.origin, "/%2e%2e/package.json"), 404);
    const catalogModule = await (await fetch(`${server.origin}/src/catalog-workbench.js`)).text();
    assert.doesNotMatch(catalogModule, /https:\/\/esm\.sh/);
    assert.match(catalogModule, /\.\/qa-xlsx\.js/);
  } finally {
    await server.close();
  }
});

test("binds Catalog non-happy evidence to the emitted error status", async () => {
  const captureSource = await readFile("tools/capture-platform55-intelligence-admin-evidence.mjs", "utf8");
  assert.match(captureSource, /#catalog-workbench-status\[data-tone=['"]error['"]\]/);
  assert.doesNotMatch(captureSource, /loaded:\s*["']\[data-platform55-governance-summary\]/);
  assert.doesNotMatch(captureSource, /#catalog-workbench-body \.ui-state-error/);
});

test("uses mutually exclusive outcome selectors for Memory, Catalog, and public auth", async () => {
  const captureSource = await readFile("tools/capture-platform55-intelligence-admin-evidence.mjs", "utf8");
  const serverSource = await readFile("tools/platform55-intelligence-admin-evidence-server.mjs", "utf8");
  const memorySource = await readFile("src/interpretation-memory.js", "utf8");

  assert.match(captureSource, /#memory-table-status\[data-tone=['"]success['"]\]/);
  assert.match(captureSource, /#memory-table-status\[data-tone=['"]error['"]\]/);
  assert.match(captureSource, /#catalog-workbench-status\[data-tone=['"]success['"]\]/);
  assert.match(captureSource, /#catalog-workbench-status\[data-tone=['"]error['"]\]/);
  assert.match(captureSource, /#auth-status\[data-auth-state=['"]authenticated['"]\]/);
  assert.match(captureSource, /#auth-status\[data-auth-state=['"]signed-out['"]\]/);
  assert.match(captureSource, /opposite_state_visible/);

  assert.match(memorySource, /setStatus\(memoryTableStatus,[\s\S]*?["']success["']\)/);
  assert.match(memorySource, /setStatus\(memoryTableStatus,[\s\S]*?["']error["']\)/);
  assert.match(serverSource, /status\.dataset\.authState\s*=\s*qaState\(\)\s*===\s*["']signed-out["']/);
});
