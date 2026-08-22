import assert from "node:assert/strict";
import { request } from "node:http";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { startProcurementEvidenceServer } from "../tools/platform55-procurement-evidence-server.mjs";

const routes = [
  "vendors.html",
  "rfx-events.html",
  "rfx-process.html",
  "ratebook.html",
  "outreach.html",
  "carrier-profile.html",
  "rfx-bid.html",
  "bid-room-board.html",
  "customer-rfi.html",
  "ratebook-carrier.html"
];

test("serves actual Procurement routes behind deterministic local-only boundaries", async (t) => {
  const instance = await startProcurementEvidenceServer({ rootDir: process.cwd(), port: 0 });
  t.after(() => instance.close());

  for (const route of routes) {
    const response = await fetch(`${instance.origin}/${route}?qa_state=loaded&token=qa-token`);
    assert.equal(response.status, 200, route);
    const source = await response.text();
    assert.match(source, /RATEWARE_PROCUREMENT_QA_IMPORT_BOUNDARY/);
    assert.match(source, new RegExp(`<script\\s+type=["']module["'][^>]+src=["']\\./src/`));
  }

  const moduleResponse = await fetch(`${instance.origin}/src/vendors.js?qa_state=loaded`);
  assert.equal(moduleResponse.status, 200);
  assert.equal(await moduleResponse.text(), await readFile("src/vendors.js", "utf8"));

  const authResponse = await fetch(`${instance.origin}/src/auth.js?qa_state=loaded`);
  const authSource = await authResponse.text();
  assert.equal(authResponse.status, 200);
  assert.match(authSource, /RATEWARE_PROCUREMENT_QA_BOUNDARY/);
  assert.doesNotMatch(authSource, /kinde|oauth|supabase/i);

  const serviceResponse = await fetch(`${instance.origin}/src/rfx-service.js?v=fixture&qa_state=error`);
  const serviceSource = await serviceResponse.text();
  assert.equal(serviceResponse.status, 200);
  assert.match(serviceSource, /RATEWARE_PROCUREMENT_QA_BOUNDARY/);
  assert.doesNotMatch(serviceSource, /SUPABASE_URL|authenticatedFetch|callRatewareApi/);

  const configResponse = await fetch(`${instance.origin}/src/config.js?qa_state=loaded`);
  const configSource = await configResponse.text();
  assert.equal(configResponse.status, 200);
  assert.match(configSource, /RATEWARE_PROCUREMENT_QA_BOUNDARY/);
  assert.match(configSource, /SUPABASE_URL\s*=\s*""/);

  const xlsxResponse = await fetch(`${instance.origin}/qa/xlsx.js`);
  assert.equal(xlsxResponse.status, 200);
  assert.match(await xlsxResponse.text(), /RATEWARE_PROCUREMENT_QA_BOUNDARY/);

  const readActions = [
    ["carrier-profile-api", "get_profile"],
    ["rfx-bid-api", "public_bid_room_board"],
    ["rfx-bid-api", "get_invitation"],
    ["rfx-bid-api", "list_bid_room_chat"],
    ["ratebook-carrier-api", "get_ratebook_access"]
  ];
  for (const [api, action] of readActions) {
    const apiResponse = await fetch(`${instance.origin}/functions/v1/${api}`, {
      method: "POST",
      headers: { "content-type": "application/json", referer: `${instance.origin}/carrier-profile.html?qa_state=loaded` },
      body: JSON.stringify({ action, token: "qa-token" })
    });
    assert.equal(apiResponse.status, 200, action);
    assert.equal(apiResponse.headers.get("x-rateware-qa-boundary"), "true", action);
    assert.equal(typeof await apiResponse.json(), "object", action);
  }

  const errorResponse = await fetch(`${instance.origin}/functions/v1/carrier-profile-api`, {
    method: "POST",
    headers: { "content-type": "application/json", referer: `${instance.origin}/carrier-profile.html?qa_state=error` },
    body: JSON.stringify({ action: "get_profile", token: "qa-token" })
  });
  assert.equal(errorResponse.status, 503);

  for (const [api, action] of [["carrier-profile-api", "submit_profile"], ["rfx-bid-api", "submit_bid"], ["ratebook-carrier-api", "submit_ratebook_quote"]]) {
    const mutationResponse = await fetch(`${instance.origin}/functions/v1/${api}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, token: "qa-token" })
    });
    assert.equal(mutationResponse.status, 405, action);
  }

  const writeResponse = await fetch(`${instance.origin}/vendors.html`, { method: "POST" });
  assert.equal(writeResponse.status, 405);

  const faviconResponse = await fetch(`${instance.origin}/favicon.ico`);
  assert.equal(faviconResponse.status, 204);
});

test("rejects traversal and never serves files outside the checkout", async (t) => {
  const instance = await startProcurementEvidenceServer({ rootDir: process.cwd(), port: 0 });
  t.after(() => instance.close());

  const rawStatus = (path) => new Promise((resolve, reject) => {
    const probe = request(`${instance.origin}`, { method: "GET", path }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    probe.once("error", reject);
    probe.end();
  });

  for (const path of ["/%2e%2e/package.json", "/..%2fpackage.json", "/%2e%2e%5cpackage.json"]) {
    assert.equal(await rawStatus(path), 404, path);
  }
});
