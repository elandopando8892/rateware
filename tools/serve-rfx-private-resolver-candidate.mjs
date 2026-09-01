import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PrivateResolverError, createPrivateResolver } from "../supabase/functions/rfx-private-resolver/resolver-core.mjs";

const port = Number(process.env.PORT || 4193);
const sharedSecret = String(process.env.RATEWARE_PRIVATE_RESOLVER_SHARED_SECRET || "").trim();
const keyId = String(process.env.RATEWARE_PRIVATE_RESOLVER_KEY_ID || "").trim();
const rows = JSON.parse(await readFile(resolve(import.meta.dirname, "../tests/fixtures/rfx-private-resolver-invitations.json"), "utf8"));

const resolver = createPrivateResolver({
  sharedSecret,
  keyId,
  canaryEnabled: String(process.env.RATEWARE_PRIVATE_RESOLVER_CANARY_ENABLED || "").trim() === "true",
  evidenceClass: "RATEWARE_PRIVATE_RESOLUTION_CANDIDATE_FIXTURE",
  async findInvitations({ vendorId, laneId, eventId, limit }) {
    return rows.filter((row) => row.vendor_id === vendorId && row.rfx_lane_id === laneId && row.rfx_event_id === eventId).slice(0, limit);
  },
});

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/status") {
    return json(response, 200, { status: "ready", environment: "candidate_fixture", canaryEnabled: true, liveEnabled: false, externalExecution: false });
  }
  if (request.method !== "POST" || request.url !== "/") return json(response, 404, { error: "Not found.", code: "NOT_FOUND" });
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const envelope = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return json(response, 200, await resolver.resolve(envelope));
  } catch (error) {
    const known = error instanceof PrivateResolverError;
    return json(response, known ? error.status : 500, {
      error: known ? error.message : "Private resolver failed.",
      code: known ? error.code : "PRIVATE_RESOLVER_ERROR",
      details: known ? error.details : {},
    });
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Rateware private resolver candidate listening on http://127.0.0.1:${port}`);
  console.log("Candidate fixture only; canary read enabled; live submission disabled.");
});
