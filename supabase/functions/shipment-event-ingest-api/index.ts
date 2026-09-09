import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { verifyShipmentEventEnvelope } from "./authorization.ts";
import { createShipmentEventIngestHandler } from "./handler.ts";

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
  return createShipmentEventIngestHandler(dependencies);
}

Deno.serve(createShipmentEventIngestApiHandler());
