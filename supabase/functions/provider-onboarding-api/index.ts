// Onboarding Service Provider — the app's own edge runtime.
//
// WHY THIS EXISTS
//
// OSP's 24 actions used to execute inside supabase/functions/shipper-directory-api, a
// Rateware function, reached through one dispatch line. That was not coupling so much as
// OSP not having a runtime of its own: when Rateware is rebuilt -- and it is being
// rebuilt, by another agent, in branches of this repo -- that function is rebuilt and
// OSP's entire backend goes with it.
//
// It also had a governance cost that was being paid every week. The Action Contract
// hashes each function's transitive local import closure, so with provider-service.ts
// imported into shipper-directory-api, every OSP commit changed the authorization
// fingerprint of eight governed RATEWARE actions. tools/effective-action-contract.mjs
// carries a comment enumerating the hand-refreshes that caused. Those stop here.
//
// And OSP's own 24 actions were never under contract at all: the extractor reads literal
// `body.action === "..."` comparisons, and OSP dispatches through a function call it
// cannot see. So OSP's thirteen write commands carried no governance of their own while
// churning the fingerprints of actions that did. Registering them here registers them
// fresh, which is only true once -- moving them after they are registered would cost a
// rename disposition forever.
//
// Everything below is the same identity path Rateware uses: the same Kinde bearer check,
// the same runtime workspace resolution, the same response envelope. Separating the
// runtime is not a change of who may call what.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders, jsonResponse as baseJsonResponse, requireKindeUser } from "../_shared/kinde.ts";
import { resolveRuntimeWorkspaceUser, runtimeIdentityStatus } from "../_shared/runtime-identity.ts";
import { statusFromSqlState } from "../_shared/http-error.ts";
import { handleProviderServiceAction, isProviderServiceAction } from "./provider-service.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function errorMessage(value: unknown) {
  if (value instanceof Error) return value.message || "Provider onboarding request failed.";
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return cleanText(record.message || record.error || record.details || record.hint)
      || "Provider onboarding request failed.";
  }
  return "Provider onboarding request failed.";
}

function errorStatus(value: unknown) {
  // An error that names its own status wins: that is how ClientError produces a 400 and
  // KindeSessionError a 401.
  const explicitStatus = Number((value as { status?: number } | null)?.status);
  if (Number.isFinite(explicitStatus) && explicitStatus >= 400 && explicitStatus < 600) return explicitStatus;

  // A database error carries a SQLSTATE, which says whose fault it is far more reliably
  // than the message text does.
  const fromSqlState = statusFromSqlState((value as { code?: unknown } | null)?.code);
  if (fromSqlState) return fromSqlState;

  const message = errorMessage(value).toLowerCase();
  return /bearer|jwt|token|auth|unauthorized|sign in|kinde/.test(message) ? 401 : 500;
}

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

Deno.serve(async (request) => {
  const jsonResponse = (body: unknown, status = 200) => baseJsonResponse(body, status, request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return jsonResponse({ error: "POST is required." }, 405);

  try {
    const supabase = getClient();
    const identity = await requireKindeUser(request);
    const user = await resolveRuntimeWorkspaceUser(
      supabase,
      identity as Record<string, unknown>,
      { persistLegacyIdentity: false },
    );
    const body = await request.json() as Record<string, unknown>;
    // The action set is the authority on what this function serves. An unrecognised
    // action is refused here rather than falling through to anything.
    if (!isProviderServiceAction(body.action)) {
      return jsonResponse({ error: "Unknown Provider onboarding action." }, 400);
    }
    return jsonResponse(await handleProviderServiceAction(supabase, user, body));
  } catch (error) {
    const identityStatus = runtimeIdentityStatus(error);
    return jsonResponse({ error: errorMessage(error) }, identityStatus === 403 ? 403 : errorStatus(error));
  }
});
