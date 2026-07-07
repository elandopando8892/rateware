import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/kinde.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function cleanText(value: unknown, maxLength = 2000) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeEmail(value: unknown) {
  const text = cleanText(value, 254)?.toLowerCase();
  if (!text) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error("Email must be valid.");
  return text;
}

function normalizeDomain(value: unknown) {
  const text = cleanText(value, 180)?.toLowerCase();
  if (!text) return null;
  return text.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0] || null;
}

function normalizeChannel(value: unknown) {
  const text = cleanText(value, 40)?.toLowerCase();
  return text && ["email", "whatsapp", "portal"].includes(text) ? text : null;
}

function normalizeArray(value: unknown) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[;\n|]+/);
  return Array.from(new Set(values.map((item) => cleanText(item, 240)).filter(Boolean))) as string[];
}

function normalizeProfileData(value: unknown) {
  const input = objectRecord(value);
  const output: Record<string, Record<string, unknown>> = {};
  for (const [sectionKey, sectionValue] of Object.entries(input)) {
    const section = objectRecord(sectionValue);
    const nextSection: Record<string, unknown> = {};
    for (const [fieldKey, fieldValue] of Object.entries(section)) {
      if (Array.isArray(fieldValue)) {
        const values = normalizeArray(fieldValue);
        if (values.length) nextSection[fieldKey] = values;
      } else {
        const text = cleanText(fieldValue);
        if (text) nextSection[fieldKey] = text;
      }
    }
    if (Object.keys(nextSection).length) output[sectionKey] = nextSection;
  }
  return output;
}

function mergeProfileData(baseValue: unknown, patchValue: unknown) {
  const base = objectRecord(baseValue);
  const patch = normalizeProfileData(patchValue);
  const merged: Record<string, unknown> = { ...base };
  for (const [sectionKey, fields] of Object.entries(patch)) {
    merged[sectionKey] = {
      ...objectRecord(merged[sectionKey]),
      ...fields
    };
  }
  return merged;
}

function publicVendor(row: Record<string, unknown>) {
  return {
    id: row.id,
    vendor_name: row.vendor_name,
    legal_name: row.legal_name,
    domain: row.domain,
    contact_name: row.contact_name,
    primary_email: row.primary_email,
    whatsapp_phone: row.whatsapp_phone,
    preferred_channel: row.preferred_channel,
    coverage_notes: row.coverage_notes,
    notes: row.notes,
    logo_url: row.logo_url,
    profile_data: objectRecord(row.profile_data)
  };
}

async function loadRequest(supabase: ReturnType<typeof createClient>, token: string) {
  const result = await supabase
    .from("vendor_profile_requests")
    .select("*, vendors(*)")
    .eq("request_token", token)
    .single();
  if (result.error || !result.data) return { error: "Profile link was not found.", status: 404 };

  const request = result.data as Record<string, unknown>;
  const expiresAt = new Date(String(request.expires_at || ""));
  if (String(request.status || "").toLowerCase() === "revoked") return { error: "Profile link was revoked.", status: 410 };
  if (String(request.status || "").toLowerCase() === "expired" || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    await supabase.from("vendor_profile_requests").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", request.id);
    return { error: "Profile link has expired.", status: 410 };
  }

  return { request, vendor: objectRecord(request.vendors), status: 200 };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const supabase = getClient();
    const body = await request.json();
    const action = cleanText(body.action, 80);
    const token = cleanText(body.token, 128);
    if (!token) return jsonResponse({ error: "Profile token is required." }, 400);

    const loaded = await loadRequest(supabase, token);
    if (loaded.error) return jsonResponse({ error: loaded.error }, loaded.status || 400);
    const requestRow = loaded.request as Record<string, unknown>;
    const vendor = loaded.vendor as Record<string, unknown>;

    if (action === "get_profile") {
      await supabase
        .from("vendor_profile_requests")
        .update({ status: String(requestRow.status) === "active" ? "viewed" : requestRow.status, viewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", requestRow.id);
      return jsonResponse({
        request: {
          id: requestRow.id,
          status: requestRow.status,
          expires_at: requestRow.expires_at
        },
        vendor: publicVendor(vendor)
      });
    }

    if (action === "submit_profile") {
      const vendorPatchInput = objectRecord(body.vendor);
      const profileData = mergeProfileData(vendor.profile_data, body.profile_data);
      const patch: Record<string, unknown> = {
        profile_data: profileData,
        updated_at: new Date().toISOString()
      };
      if (vendorPatchInput.vendor_name !== undefined) patch.vendor_name = cleanText(vendorPatchInput.vendor_name, 240);
      if (vendorPatchInput.legal_name !== undefined) patch.legal_name = cleanText(vendorPatchInput.legal_name, 240);
      if (vendorPatchInput.domain !== undefined) patch.domain = normalizeDomain(vendorPatchInput.domain);
      if (vendorPatchInput.contact_name !== undefined) patch.contact_name = cleanText(vendorPatchInput.contact_name, 180);
      if (vendorPatchInput.primary_email !== undefined) patch.primary_email = normalizeEmail(vendorPatchInput.primary_email);
      if (vendorPatchInput.whatsapp_phone !== undefined) patch.whatsapp_phone = cleanText(vendorPatchInput.whatsapp_phone, 80);
      if (vendorPatchInput.preferred_channel !== undefined) patch.preferred_channel = normalizeChannel(vendorPatchInput.preferred_channel) || vendor.preferred_channel || "email";
      if (vendorPatchInput.coverage_notes !== undefined) patch.coverage_notes = cleanText(vendorPatchInput.coverage_notes);
      if (vendorPatchInput.notes !== undefined) patch.notes = cleanText(vendorPatchInput.notes);
      if (!patch.vendor_name && !vendor.vendor_name) return jsonResponse({ error: "Vendor name is required." }, 400);

      const update = await supabase
        .from("vendors")
        .update(patch)
        .eq("id", vendor.id)
        .eq("owner_email", requestRow.owner_email)
        .select()
        .single();
      if (update.error) throw update.error;

      const submittedContact = objectRecord(body.submitted_contact);
      await supabase
        .from("vendor_profile_requests")
        .update({
          status: "submitted",
          submitted_at: new Date().toISOString(),
          submitted_contact: {
            name: cleanText(submittedContact.name, 180),
            email: cleanText(submittedContact.email, 254)
          },
          updated_at: new Date().toISOString()
        })
        .eq("id", requestRow.id);

      return jsonResponse({ vendor: publicVendor(update.data), submitted: true });
    }

    return jsonResponse({ error: "Unsupported carrier profile action." }, 400);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Carrier profile request failed." }, 500);
  }
});
