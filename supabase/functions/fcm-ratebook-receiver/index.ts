import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders, jsonResponse as baseJsonResponse, requireKindeUser } from "../_shared/kinde.ts";
import { resolveRuntimeWorkspaceUser, runtimeIdentityStatus, type RuntimeWorkspaceUser } from "../_shared/runtime-identity.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
const CONTRACT_VERSION = "fcm.rateware-ratebook.v1";
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

type ReceiverClient = ReturnType<typeof getClient>;

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requiredString(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") {
    throw Object.assign(new Error(`${label} is required.`), { code: "400" });
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw Object.assign(new Error(`${label} is invalid.`), { code: "400" });
  }
  return normalized;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function validateFcmRateBookPackage(
  user: RuntimeWorkspaceUser,
  input: Record<string, unknown>,
  headerIdempotencyKey: string | null
) {
  const ownerEmail = cleanText(user.owner_email)?.toLowerCase() || null;
  if (!ownerEmail) {
    throw Object.assign(new Error("A tenant owner identity is required to receive an FCM RateBook."), { code: "403" });
  }
  const canonicalTenantId = cleanText(user.canonical_tenant_id);
  const legacyOrganizationId = cleanText(user.organization_id);
  const receiptOrganizationId = UUID_PATTERN.test(canonicalTenantId || "")
    ? canonicalTenantId
    : UUID_PATTERN.test(legacyOrganizationId || "")
      ? legacyOrganizationId
      : null;

  const packageInput = objectRecord(input.package);
  const contractVersion = requiredString(packageInput.contractVersion, "FCM RateBook contract version", 80);
  if (contractVersion !== CONTRACT_VERSION || packageInput.mode !== "READ_ONLY") {
    throw Object.assign(new Error("Unsupported FCM RateBook contract."), { code: "400" });
  }
  const idempotencyKey = requiredString(input.idempotency_key, "Request idempotency key", 64).toLowerCase();
  const headerKey = requiredString(headerIdempotencyKey, "X-Idempotency-Key header", 64).toLowerCase();
  if (!SHA256_HEX_PATTERN.test(idempotencyKey) || headerKey !== idempotencyKey) {
    throw Object.assign(new Error("FCM RateBook idempotency keys do not match."), { code: "400" });
  }

  const source = objectRecord(packageInput.source);
  if (source.system !== "Freight Cost Model") {
    throw Object.assign(new Error("FCM RateBook source system is invalid."), { code: "400" });
  }
  const sourceOrganizationId = requiredString(source.organizationId, "Source organization id", 200);
  const sourceRateBookId = requiredString(source.rateBookId, "Source RateBook id", 200);
  const exportedAt = requiredString(source.exportedAt, "FCM RateBook export timestamp", 80);
  const exportedAtMs = Date.parse(exportedAt);
  if (!Number.isFinite(exportedAtMs) || exportedAtMs > Date.now() + 300_000) {
    throw Object.assign(new Error("FCM RateBook export timestamp is invalid."), { code: "400" });
  }

  const governance = objectRecord(packageInput.governance);
  if (governance.status !== "PUBLISHED") {
    throw Object.assign(new Error("Only a published FCM RateBook can be received."), { code: "400" });
  }
  const publishedAt = requiredString(governance.publishedAt, "FCM RateBook publication timestamp", 80);
  if (!Number.isFinite(Date.parse(publishedAt))) {
    throw Object.assign(new Error("FCM RateBook publication timestamp is invalid."), { code: "400" });
  }

  const rateBook = objectRecord(packageInput.rateBook);
  const code = requiredString(rateBook.code, "RateBook code", 80);
  requiredString(rateBook.name, "RateBook name", 300);
  const currency = requiredString(rateBook.currency, "RateBook currency", 3);
  if (currency !== "USD" && currency !== "MXN") {
    throw Object.assign(new Error("FCM RateBook currency is invalid."), { code: "400" });
  }
  const effectiveFrom = requiredString(rateBook.effectiveFrom, "RateBook effective-from timestamp", 80);
  if (!Number.isFinite(Date.parse(effectiveFrom))) {
    throw Object.assign(new Error("FCM RateBook effective-from timestamp is invalid."), { code: "400" });
  }
  if (rateBook.effectiveUntil != null) {
    const effectiveUntil = requiredString(rateBook.effectiveUntil, "RateBook effective-until timestamp", 80);
    if (!Number.isFinite(Date.parse(effectiveUntil)) || Date.parse(effectiveUntil) < Date.parse(effectiveFrom)) {
      throw Object.assign(new Error("FCM RateBook effective-until timestamp is invalid."), { code: "400" });
    }
  }

  const lineage = objectRecord(packageInput.lineage);
  const costBase = objectRecord(lineage.costBase);
  requiredString(costBase.id, "Cost base id", 200);
  requiredString(costBase.code, "Cost base code", 80);
  requiredString(costBase.name, "Cost base name", 300);
  requiredString(costBase.scope, "Cost base scope", 80);
  if (costBase.status !== "ACTIVE") {
    throw Object.assign(new Error("FCM RateBook requires an active cost base."), { code: "400" });
  }
  const assumptionSet = objectRecord(lineage.assumptionSet);
  requiredString(assumptionSet.id, "Assumption version id", 200);
  requiredString(assumptionSet.name, "Assumption version name", 300);
  if (!Number.isInteger(assumptionSet.version) || Number(assumptionSet.version) < 1 || assumptionSet.status !== "PUBLISHED") {
    throw Object.assign(new Error("FCM RateBook requires a published assumption version."), { code: "400" });
  }

  const entries = Array.isArray(packageInput.entries) ? packageInput.entries : [];
  if (entries.length < 1 || entries.length > 250) {
    throw Object.assign(new Error("FCM RateBook entries are incomplete or exceed the delivery limit."), { code: "400" });
  }
  for (const rawEntry of entries) {
    const entry = objectRecord(rawEntry);
    requiredString(entry.sourceQuoteId, "Source quote id", 200);
    if (!Number.isInteger(entry.sourceQuoteVersion) || Number(entry.sourceQuoteVersion) < 1) {
      throw Object.assign(new Error("FCM RateBook source quote version is invalid."), { code: "400" });
    }
    requiredString(entry.origin, "RateBook origin", 300);
    requiredString(entry.destination, "RateBook destination", 300);
    requiredString(entry.operation, "RateBook operation", 120);
    requiredString(entry.service, "RateBook service", 120);
    if (entry.currency !== currency) {
      throw Object.assign(new Error("FCM RateBook entry currency does not match the RateBook."), { code: "400" });
    }
    for (const [label, value] of [
      ["Published tariff", entry.publishedTariff],
      ["Source tariff USD", entry.sourceTariffUsd],
      ["Source tariff MXN", entry.sourceTariffMxn],
      ["FX rate", entry.fxRateUsed]
    ] as const) {
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        throw Object.assign(new Error(`FCM RateBook ${label.toLowerCase()} is invalid.`), { code: "400" });
      }
    }
  }

  const payloadChecksum = await sha256Hex(JSON.stringify(packageInput));
  const expectedIdempotencyKey = await sha256Hex(
    `${CONTRACT_VERSION}:${sourceOrganizationId}:${sourceRateBookId}:${payloadChecksum}`
  );
  if (expectedIdempotencyKey !== idempotencyKey) {
    throw Object.assign(new Error("FCM RateBook idempotency key is invalid."), { code: "400" });
  }
  return {
    ownerEmail,
    receiptOrganizationId,
    contractVersion,
    idempotencyKey,
    payloadChecksum,
    sourceOrganizationId,
    sourceRateBookId,
    code,
    packageInput
  };
}

function receiptResponse(receipt: Record<string, unknown>, duplicate: boolean) {
  return {
    accepted: true,
    duplicate,
    receipt_id: cleanText(receipt.id),
    payload_checksum: cleanText(receipt.payload_checksum),
    receiver_revision: cleanText(receipt.receiver_revision)
  };
}

export function receiverErrorStatus(error: unknown) {
  const identityStatus = runtimeIdentityStatus(error);
  const explicitStatus = Number(objectRecord(error).code);
  if (error instanceof Error && error.message === "Kinde bearer token is required.") return 401;
  if (identityStatus === 403) return 403;
  return [400, 401, 403, 409, 422].includes(explicitStatus) ? explicitStatus : 500;
}

export async function receiveFcmRateBook(
  supabase: ReceiverClient,
  user: RuntimeWorkspaceUser,
  input: Record<string, unknown>,
  headerIdempotencyKey: string | null
) {
  const delivery = await validateFcmRateBookPackage(user, input, headerIdempotencyKey);
  const existingResult = await supabase.from("fcm_ratebook_receipts").select("*")
    .eq("owner_email", delivery.ownerEmail).eq("idempotency_key", delivery.idempotencyKey).maybeSingle();
  if (existingResult.error) throw existingResult.error;
  const existing = objectRecord(existingResult.data);
  if (existing.id) {
    if (cleanText(existing.payload_checksum) !== delivery.payloadChecksum) {
      throw Object.assign(new Error("FCM RateBook retry conflicts with the durable payload checksum."), { code: "409" });
    }
    return { status: 200, body: receiptResponse(existing, true) };
  }

  const insertResult = await supabase.from("fcm_ratebook_receipts").insert({
    organization_id: delivery.receiptOrganizationId,
    owner_email: delivery.ownerEmail,
    source_system: "Freight Cost Model",
    source_organization_id: delivery.sourceOrganizationId,
    source_ratebook_id: delivery.sourceRateBookId,
    ratebook_code: delivery.code,
    contract_version: delivery.contractVersion,
    idempotency_key: delivery.idempotencyKey,
    payload_checksum: delivery.payloadChecksum,
    payload: delivery.packageInput,
    status: "received",
    received_by: cleanText(user.owner_user_id),
    receiver_revision: cleanText(Deno.env.get("DENO_DEPLOYMENT_ID"))
  }).select("*").single();
  if (insertResult.error) {
    if (String(insertResult.error.code || "") === "23505") {
      const racedResult = await supabase.from("fcm_ratebook_receipts").select("*")
        .eq("owner_email", delivery.ownerEmail).eq("idempotency_key", delivery.idempotencyKey).maybeSingle();
      if (racedResult.error) throw racedResult.error;
      const raced = objectRecord(racedResult.data);
      if (raced.id && cleanText(raced.payload_checksum) === delivery.payloadChecksum) {
        return { status: 200, body: receiptResponse(raced, true) };
      }
    }
    throw insertResult.error;
  }
  return { status: 202, body: receiptResponse(objectRecord(insertResult.data), false) };
}

Deno.serve(async (request) => {
  const jsonResponse = (body: unknown, status = 200) => baseJsonResponse(body, status, request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
  try {
    const supabase = getClient();
    const user = await resolveRuntimeWorkspaceUser(
      supabase,
      await requireKindeUser(request),
      { persistLegacyIdentity: false }
    );
    const body = objectRecord(await request.json());
    if (body.action === "receive_fcm_ratebook") {
      const result = await receiveFcmRateBook(
        supabase,
        user,
        body,
        request.headers.get("x-idempotency-key")
      );
      return jsonResponse(result.body, result.status);
    }
    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    const status = receiverErrorStatus(error);
    const message = error instanceof Error ? error.message : "RateBook receiver failed.";
    console.error(JSON.stringify({ event: "fcm_ratebook_receiver.error", status, message }));
    return jsonResponse({ error: message }, status);
  }
});
