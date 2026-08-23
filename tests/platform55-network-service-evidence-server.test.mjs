import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import test from "node:test";
import { startNetworkServiceEvidenceServer } from "../tools/platform55-network-service-evidence-server.mjs";

const routes = ["shipper-crm", "shipper-profile", "vendor-support", "vendor-improvement", "provider-service", "provider-onboarding", "provider-gmail", "provider-communications"];

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

test("serves all actual Network and Service routes and modules without rewriting them", async () => {
  const server = await startNetworkServiceEvidenceServer({ rootDir: process.cwd() });
  try {
    for (const route of routes) {
      const html = await fetch(`${server.origin}/${route}.html`);
      assert.equal(html.status, 200, `${route} HTML status`);
      assert.equal(await html.text(), await readFile(`${route}.html`, "utf8"), `${route} HTML bytes`);
    }
    for (const source of ["shippers", "shipper-profile", "vendor-support", "vendor-improvement", "provider-service-page", "provider-onboarding-page", "provider-gmail-page", "provider-communications-page"]) {
      const module = await fetch(`${server.origin}/src/${source}.js`);
      assert.equal(module.status, 200, `${source} JS status`);
      assert.equal(await module.text(), await readFile(`src/${source}.js`, "utf8"), `${source} JS bytes`);
    }
    assert.equal((await fetch(`${server.origin}/favicon.ico`)).status, 204);
    assert.equal((await fetch(`${server.origin}/src/auth.js`)).headers.get("x-rateware-qa-boundary"), "true");
    const profile = await fetch(`${server.origin}/functions/v1/shipper-profile-api`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "get_profile", token: "qa-token" }) });
    assert.equal(profile.status, 200);
    assert.match(JSON.stringify(await profile.json()), /Northwind Cross-Border Logistics/);
    const mutation = await fetch(`${server.origin}/functions/v1/shipper-profile-api`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "submit_profile" }) });
    assert.equal(mutation.status, 405, "profile mutations remain blocked");
  } finally {
    await server.close();
  }
});

test("fails closed for methods, traversal, missing files, and oversized bodies", async () => {
  const server = await startNetworkServiceEvidenceServer({ rootDir: process.cwd() });
  try {
    assert.equal((await fetch(`${server.origin}/shipper-crm.html`, { method: "PUT" })).status, 405);
    assert.equal((await fetch(`${server.origin}/missing.html`)).status, 404);
    assert.equal(await rawStatus(server.origin, "/%2e%2e/package.json"), 404);
    const oversized = await fetch(`${server.origin}/functions/v1/shipper-profile-api`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "get_profile", data: "x".repeat(70000) }) });
    assert.equal(oversized.status, 413);
  } finally {
    await server.close();
  }
});
