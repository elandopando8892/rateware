import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { verifyShipmentEventEnvelope } from "./authorization.ts";
import { createShipmentEventIngestHandler, SHIPMENT_EVENT_MAX_BODY_CHARS } from "./handler.ts";

function getClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SHIPMENT_EVENT_INGEST_NOT_CONFIGURED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function verify(envelope: Record<string, unknown>) {
  return verifyShipmentEventEnvelope(envelope, {
    sharedSecret: Deno.env.get("RATEWARE_LOADS_SHIPMENT_EVENT_SECRET") || "",
    expectedKeyId: Deno.env.get("RATEWARE_LOADS_SHIPMENT_EVENT_KEY_ID") || "",
  });
}

export function createShipmentEventIngestApiHandler(dependencies = { getClient, verify }) {
  const delegate = createShipmentEventIngestHandler(dependencies);
  return async (request: Request) => {
    if (request.method !== "POST") return delegate(request);
    const raw = await request.text();
    let envelope: Record<string, unknown> = {};
    let parseError = false;
    if (raw && raw.length <= SHIPMENT_EVENT_MAX_BODY_CHARS) {
      try { envelope = JSON.parse(raw); } catch { parseError = true; }
    }
    const preparedInput = { raw, envelope, parseError };
    const body = envelope?.body as Record<string, unknown> || {};
    if (body.action === "register_shipment_created") return delegate(request, preparedInput);
    return delegate(request, preparedInput);
  };
}

Deno.serve(createShipmentEventIngestApiHandler());
