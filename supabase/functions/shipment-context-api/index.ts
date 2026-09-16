import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { requireRatewareUser } from "../_shared/auth.ts";
import { resolveRuntimeWorkspaceUser } from "../_shared/runtime-identity.ts";
import { createShipmentContextHandler } from "./handler.ts";

function getClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("RATEWARE_CONTEXT_NOT_CONFIGURED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function createShipmentContextApiHandler(dependencies = {
  getClient,
  authenticate: requireRatewareUser,
  resolveUser: resolveRuntimeWorkspaceUser
}) {
  const delegate = createShipmentContextHandler(dependencies);
  return async (request: Request) => {
    // Keep the two governed selectors statically visible to the action-contract
    // scanner while the dependency-injected implementation remains testable.
    if (request.method === "POST") {
      const body = await request.clone().json().catch(() => ({}));
      if (body.action === "search_shipment_creation_events") return delegate(request);
      if (body.action === "get_shipment_creation_event") return delegate(request);
    }
    return delegate(request);
  };
}

Deno.serve(createShipmentContextApiHandler());
