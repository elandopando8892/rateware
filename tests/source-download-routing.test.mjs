import test from "node:test";
import assert from "node:assert/strict";
import { forwardSourceDownload as route, forwardSourceRemoval as remove } from "../supabase/functions/_shared/source-download-routing.mjs";
const request = new Request("https://fixture.invalid", { headers: { Authorization: "Bearer fixture" } });
test("forwards caller identity and only download identifiers to the existing service", async () => {
  const result = await route(request, { action: "get_upload_source_url", id: "fixture", owner_email: "forged", storage_provider: "forged" }, "https://provider.invalid", async (url, init) => {
    assert.equal(String(url), "https://provider.invalid/functions/v1/rateware-storage-api");
    assert.equal(init.headers.Authorization, "Bearer fixture");
    assert.deepEqual(JSON.parse(init.body), { action: "get_upload_source_url", id: "fixture" });
    return Response.json({ url: "https://oracle.invalid/signed", expires_in_seconds: 600, filename: "fixture.pdf", secret: "excluded" });
  });
  assert.equal(result.payload.url, "https://oracle.invalid/signed");
  assert.equal(result.payload.secret, undefined);
});
test("does not contact downstream for missing identity or another action", async () => {
  const fail = () => { throw new Error("must not call"); };
  assert.equal((await route(new Request("https://fixture.invalid"), {action:"get_upload_source_url"}, "https://provider.invalid", fail)).status, 401);
  await assert.rejects(route(request,{action:"remove_upload"},"https://provider.invalid",fail), /Unsupported/);
});
test("preserves denial and never falls back to signing in Supabase", async () => {
  for (const status of [401,403,404,500]) {
    const result = await route(request,{action:"get_upload_source_url"},"https://provider.invalid",async()=>Response.json({error:"private detail"},{status}));
    assert.equal(result.status,status);
    assert.ok(!JSON.stringify(result).includes("private detail"));
  }
});
test("rejects malformed responses", async () => {
  for (const response of [new Response("not json"),Response.json({url:"x"})]) {
    assert.equal((await route(request,{action:"get_upload_source_url"},"https://provider.invalid",async()=>response)).status,502);
  }
});
test("forwards an Oracle removal with the caller identity and an explicit confirmation", async () => {
  const result = await remove(request, { action: "remove_upload", id: "fixture", owner_email: "forged", storage_provider: "forged" }, "https://provider.invalid", async (url, init) => {
    assert.equal(String(url), "https://provider.invalid/functions/v1/rateware-storage-api");
    assert.equal(init.headers.Authorization, "Bearer fixture");
    assert.deepEqual(JSON.parse(init.body), { action: "remove_upload", id: "fixture", confirmed: true, confirmation_action: "remove_upload" });
    return Response.json({ removed: { id: "fixture", secret: "excluded" } });
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.payload, { removed: { id: "fixture" } });
});
test("removal never contacts downstream without identity or for another action, and preserves denials", async () => {
  const fail = () => { throw new Error("must not call"); };
  assert.equal((await remove(new Request("https://fixture.invalid"), { action: "remove_upload", id: "x" }, "https://provider.invalid", fail)).status, 401);
  await assert.rejects(remove(request, { action: "get_upload_source_url" }, "https://provider.invalid", fail), /Unsupported/);
  for (const status of [401, 403, 404, 409, 500]) {
    const result = await remove(request, { action: "remove_upload", id: "x" }, "https://provider.invalid", async () => Response.json({ error: "private detail" }, { status }));
    assert.equal(result.status, status);
    assert.ok(!JSON.stringify(result).includes("private detail"));
  }
  for (const response of [new Response("not json"), Response.json({ removed: { id: "other" } }), Response.json({})]) {
    assert.equal((await remove(request, { action: "remove_upload", id: "x" }, "https://provider.invalid", async () => response)).status, 502);
  }
});
