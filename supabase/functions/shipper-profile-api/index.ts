import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/kinde.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");

function getClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Missing Supabase service credentials.");
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

function text(value: unknown, maxLength = 2000) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result ? result.slice(0, maxLength) : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function list(value: unknown) {
  return Array.from(new Set((Array.isArray(value) ? value : String(value || "").split(/[;,\n|]+/))
    .map((item) => text(item, 180)).filter(Boolean))) as string[];
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeProfileData(value: unknown) {
  const source = record(value);
  const output: Record<string, unknown> = {};
  for (const [section, raw] of Object.entries(source)) {
    const values = record(raw);
    const clean: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(values)) {
      if (Array.isArray(item)) clean[key] = list(item);
      else clean[key] = text(item, 1800);
    }
    output[section] = clean;
  }
  return output;
}

function publicShipper(row: Record<string, unknown>) {
  const metadata = record(row.metadata);
  return {
    id: row.id,
    shipper_name: row.shipper_name,
    legal_name: row.legal_name,
    domain: row.domain,
    website: row.website,
    logo_url: row.logo_url,
    industry: row.industry,
    primary_contact_name: row.primary_contact_name,
    primary_contact_email: row.primary_contact_email,
    primary_contact_phone: row.primary_contact_phone,
    headquarters_city: row.headquarters_city,
    headquarters_state: row.headquarters_state,
    headquarters_country: row.headquarters_country,
    profile_data: record(metadata.shipper_profile)
  };
}

function publicContact(row: Record<string, unknown>) {
  return {
    id: row.id, name: row.contact_name, title: row.title, department: row.department,
    email: row.email, phone: row.phone, whatsapp_phone: row.whatsapp_phone,
    preferred_channel: row.preferred_channel, is_primary: row.is_primary, notes: row.notes
  };
}

function publicLocation(row: Record<string, unknown>) {
  return {
    id: row.id, location_name: row.location_name, location_type: row.location_type,
    city: row.city, state_code: row.state_code, country_code: row.country_code, postal_code: row.postal_code,
    address_line_1: row.address_line_1, address_line_2: row.address_line_2,
    operating_hours: row.operating_hours, appointment_required: row.appointment_required,
    handling_type: row.handling_type, notes: row.notes
  };
}

async function loadRequest(supabase: ReturnType<typeof createClient>, rawToken: string) {
  const result = await supabase.from("shipper_profile_requests").select("*, shippers(*)")
    .eq("token_hash", await tokenHash(rawToken)).single();
  if (result.error || !result.data) return { error: "This profile link was not found.", status: 404 };
  const request = result.data as Record<string, unknown>;
  const expired = new Date(String(request.expires_at || "")).getTime() < Date.now();
  if (String(request.status).toLowerCase() === "revoked") return { error: "This profile link was revoked.", status: 410 };
  if (expired || String(request.status).toLowerCase() === "expired") {
    await supabase.from("shipper_profile_requests").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", request.id);
    return { error: "This profile link has expired.", status: 410 };
  }
  return { request, shipper: record(request.shippers), status: 200 };
}

async function loadPublicProfile(supabase: ReturnType<typeof createClient>, request: Record<string, unknown>, shipper: Record<string, unknown>) {
  const [contacts, locations] = await Promise.all([
    supabase.from("shipper_contacts").select("*").eq("owner_email", request.owner_email).eq("shipper_id", shipper.id).order("updated_at", { ascending: false }).limit(50),
    supabase.from("shipper_locations").select("*").eq("owner_email", request.owner_email).eq("shipper_id", shipper.id).order("updated_at", { ascending: false }).limit(50)
  ]);
  if (contacts.error) throw contacts.error;
  if (locations.error) throw locations.error;
  return { shipper: publicShipper(shipper), contacts: (contacts.data || []).map(publicContact), locations: (locations.data || []).map(publicLocation) };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  try {
    const body = await request.json();
    const action = text(body.action, 80);
    const rawToken = text(body.token, 200);
    if (!rawToken) return jsonResponse({ error: "Profile token is required." }, 400);
    const supabase = getClient();
    const loaded = await loadRequest(supabase, rawToken);
    if (loaded.error) return jsonResponse({ error: loaded.error }, loaded.status || 400);
    const requestRow = loaded.request as Record<string, unknown>;
    const shipper = loaded.shipper as Record<string, unknown>;

    if (action === "get_profile") {
      if (requestRow.status === "active") await supabase.from("shipper_profile_requests").update({ status: "viewed", viewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", requestRow.id);
      const profile = await loadPublicProfile(supabase, requestRow, shipper);
      return jsonResponse({ request: { id: requestRow.id, status: requestRow.status, expires_at: requestRow.expires_at }, ...profile });
    }

    if (action === "submit_profile") {
      const patchInput = record(body.shipper);
      const metadata = record(shipper.metadata);
      const patch: Record<string, unknown> = { metadata: { ...metadata, shipper_profile: { ...record(metadata.shipper_profile), ...safeProfileData(body.profile_data) } }, updated_at: new Date().toISOString() };
      for (const key of ["shipper_name", "legal_name", "domain", "website", "logo_url", "industry", "primary_contact_name", "primary_contact_email", "primary_contact_phone", "headquarters_city", "headquarters_state", "headquarters_country"]) {
        if (patchInput[key] !== undefined) patch[key] = text(patchInput[key], key.includes("email") ? 254 : 240);
      }
      if (!patch.shipper_name && !shipper.shipper_name) patch.shipper_name = "Customer profile";
      const updated = await supabase.from("shippers").update(patch).eq("id", shipper.id).eq("owner_email", requestRow.owner_email).select().single();
      if (updated.error) throw updated.error;

      const submittedContacts = Array.isArray(body.contacts) ? body.contacts : [];
      for (const raw of submittedContacts.slice(0, 25)) {
        const item = record(raw);
        const contactPatch = { contact_name: text(item.name, 180) || "Customer contact", title: text(item.title, 160), department: text(item.department, 120), email: text(item.email, 254), phone: text(item.phone, 80), whatsapp_phone: text(item.whatsapp_phone, 80), preferred_channel: text(item.preferred_channel, 40), is_primary: Boolean(item.is_primary), notes: text(item.notes, 1800), updated_at: new Date().toISOString() };
        if (!text(item.name, 180) && !contactPatch.email) continue;
        const contactResult = text(item.id, 80)
          ? await supabase.from("shipper_contacts").update(contactPatch).eq("id", item.id).eq("shipper_id", shipper.id).eq("owner_email", requestRow.owner_email)
          : await supabase.from("shipper_contacts").insert({ ...contactPatch, shipper_id: shipper.id, owner_email: requestRow.owner_email, organization_id: requestRow.organization_id, status: "active" });
        if (contactResult.error) throw contactResult.error;
      }

      const submittedLocations = Array.isArray(body.locations) ? body.locations : [];
      for (const raw of submittedLocations.slice(0, 25)) {
        const item = record(raw);
        const locationPatch = {
          location_name: text(item.location_name, 180) || "Customer location",
          location_type: text(item.location_type, 100), address_line_1: text(item.address_line_1, 240),
          address_line_2: text(item.address_line_2, 240), city: text(item.city, 160),
          state_code: text(item.state_code, 80), country_code: text(item.country_code, 8),
          postal_code: text(item.postal_code, 40), contact_name: text(item.contact_name, 180),
          contact_email: text(item.contact_email, 254), contact_phone: text(item.contact_phone, 80),
          operating_hours: text(item.operating_hours, 240), appointment_required: Boolean(item.appointment_required),
          handling_type: text(item.handling_type, 100), notes: text(item.notes, 1800), updated_at: new Date().toISOString()
        };
        if (!text(item.location_name, 180) && !locationPatch.city && !locationPatch.address_line_1) continue;
        const locationResult = text(item.id, 80)
          ? await supabase.from("shipper_locations").update(locationPatch).eq("id", item.id).eq("shipper_id", shipper.id).eq("owner_email", requestRow.owner_email)
          : await supabase.from("shipper_locations").insert({ ...locationPatch, shipper_id: shipper.id, owner_email: requestRow.owner_email, organization_id: requestRow.organization_id });
        if (locationResult.error) throw locationResult.error;
      }

      const submittedContact = record(body.submitted_contact);
      const auditPatch = { shipper: patchInput, profile_data: safeProfileData(body.profile_data), contact_count: submittedContacts.length, location_count: submittedLocations.length };
      await supabase.from("shipper_profile_submissions").insert({ owner_email: requestRow.owner_email, organization_id: requestRow.organization_id, shipper_id: shipper.id, request_id: requestRow.id, submitted_contact: { name: text(submittedContact.name, 180), email: text(submittedContact.email, 254) }, patch: auditPatch });
      await supabase.from("shipper_profile_requests").update({ status: "submitted", submitted_at: new Date().toISOString(), submitted_contact: { name: text(submittedContact.name, 180), email: text(submittedContact.email, 254) }, updated_at: new Date().toISOString() }).eq("id", requestRow.id);
      const profile = await loadPublicProfile(supabase, requestRow, updated.data as Record<string, unknown>);
      return jsonResponse({ submitted: true, ...profile });
    }
    return jsonResponse({ error: "Unknown profile action." }, 400);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unable to update profile." }, 500);
  }
});
