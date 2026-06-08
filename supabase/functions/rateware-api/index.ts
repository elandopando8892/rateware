import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, requireKindeUser } from "../_shared/kinde.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeDomain(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  return text.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

function normalizeTags(value: unknown) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[;,]/);
  return source
    .map((tag) => String(tag).trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeVendor(input: Record<string, unknown>, source = "manual") {
  const vendorName = cleanText(input.vendor_name || input.name || input.carrier || input.vendor);
  if (!vendorName) throw new Error("Vendor name is required.");

  const preferred = cleanText(input.preferred_channel)?.toLowerCase() || "email";
  const status = cleanText(input.status)?.toLowerCase() || "active";

  return {
    vendor_name: vendorName,
    legal_name: cleanText(input.legal_name),
    domain: normalizeDomain(input.domain || input.vendor_domain),
    contact_name: cleanText(input.contact_name || input.contact),
    primary_email: cleanText(input.primary_email || input.email),
    whatsapp_phone: cleanText(input.whatsapp_phone || input.phone || input.whatsapp),
    preferred_channel: ["email", "whatsapp", "portal"].includes(preferred) ? preferred : "email",
    status: ["active", "invited", "blocked", "inactive"].includes(status) ? status : "active",
    tags: normalizeTags(input.tags || input.tag || input.services || input.equipment || input.coverage),
    coverage_notes: cleanText(input.coverage_notes || input.coverage || input.lanes),
    notes: cleanText(input.notes),
    source
  };
}

function normalizeVendorPatch(input: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if (input.vendor_name !== undefined) patch.vendor_name = cleanText(input.vendor_name);
  if (input.legal_name !== undefined) patch.legal_name = cleanText(input.legal_name);
  if (input.domain !== undefined) patch.domain = normalizeDomain(input.domain);
  if (input.contact_name !== undefined) patch.contact_name = cleanText(input.contact_name);
  if (input.primary_email !== undefined) patch.primary_email = cleanText(input.primary_email);
  if (input.whatsapp_phone !== undefined) patch.whatsapp_phone = cleanText(input.whatsapp_phone);
  if (input.coverage_notes !== undefined) patch.coverage_notes = cleanText(input.coverage_notes);
  if (input.notes !== undefined) patch.notes = cleanText(input.notes);
  const status = cleanText(input.status)?.toLowerCase();
  if (status && ["active", "invited", "blocked", "inactive"].includes(status)) patch.status = status;
  if (input.tags !== undefined) patch.tags = normalizeTags(input.tags);
  if (input.preferred_channel !== undefined) {
    const preferred = cleanText(input.preferred_channel)?.toLowerCase();
    if (preferred && ["email", "whatsapp", "portal"].includes(preferred)) patch.preferred_channel = preferred;
  }
  patch.updated_at = new Date().toISOString();
  return patch;
}

function normalizeSegment(input: Record<string, unknown>) {
  const segmentName = cleanText(input.segment_name || input.name);
  if (!segmentName) throw new Error("Segment name is required.");

  const status = cleanText(input.status)?.toLowerCase() || null;
  const preferredChannel = cleanText(input.preferred_channel)?.toLowerCase() || null;

  return {
    segment_name: segmentName,
    description: cleanText(input.description),
    tags: normalizeTags(input.tags),
    status: status && ["active", "invited", "blocked", "inactive"].includes(status) ? status : null,
    preferred_channel: preferredChannel && ["email", "whatsapp", "portal"].includes(preferredChannel) ? preferredChannel : null,
    notes: cleanText(input.notes),
    updated_at: new Date().toISOString()
  };
}

function normalizeStagingPatch(input: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  const textFields = [
    "vendor_domain",
    "rfx_id",
    "row_id",
    "origin",
    "destination",
    "equipment",
    "trailer",
    "config",
    "operation",
    "service",
    "driver",
    "mx_border_crossing_point",
    "us_border_crossing_point",
    "mx_linehaul",
    "us_linehaul",
    "us_miles",
    "fsc",
    "fuel",
    "border_crossing_fee",
    "flat_rate",
    "all_in_rate",
    "currency",
    "weekly_capacity",
    "notes",
    "accessorials",
    "normalized_origin",
    "normalized_destination",
    "origin_market",
    "destination_market",
    "normalized_equipment",
    "normalized_trailer",
    "normalized_config",
    "normalized_operation",
    "normalized_service",
    "normalized_driver",
    "catalog_match_status",
    "mileage_source"
  ];

  for (const field of textFields) {
    if (input[field] !== undefined) patch[field] = cleanText(input[field]);
  }

  if (input.quote_date !== undefined) patch.quote_date = cleanDate(input.quote_date);

  const status = cleanText(input.status)?.toLowerCase();
  if (status && ["pending_review", "approved", "rejected"].includes(status)) patch.status = status;

  if (input.confidence !== undefined) {
    patch.confidence = Math.max(0, Math.min(1, Number(input.confidence) || 0));
  }

  if (input.calculated_miles !== undefined) patch.calculated_miles = Number(input.calculated_miles) || null;
  if (input.calculated_km !== undefined) patch.calculated_km = Number(input.calculated_km) || null;

  const routeParts = [
    patch.origin,
    patch.destination,
    patch.equipment,
    patch.trailer,
    patch.config,
    patch.operation,
    patch.service,
    patch.driver,
    patch.mx_border_crossing_point && patch.us_border_crossing_point
      ? `${patch.mx_border_crossing_point}/${patch.us_border_crossing_point}`
      : patch.mx_border_crossing_point || patch.us_border_crossing_point
  ].filter(Boolean);
  const rfxKey = [patch.rfx_id, patch.row_id].filter(Boolean).join("-");

  if (routeParts.length) patch.route_key = routeParts.join(" ");
  if (rfxKey) patch.rfx_key = rfxKey;
  if (routeParts.length || rfxKey) patch.business_key = [rfxKey, routeParts.join(" ")].filter(Boolean).join(" ");

  return patch;
}

function cleanDate(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const slashMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year = Number(slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3]);
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    await requireKindeUser(request);
    const supabase = getClient();
    const body = await request.json();

    if (body.action === "list_vendors") {
      let query = supabase.from("vendors").select("*").order("created_at", { ascending: false }).limit(250);

      if (body.status) query = query.eq("status", body.status);
      if (body.search) {
        const term = String(body.search).trim();
        query = query.or(`vendor_name.ilike.%${term}%,domain.ilike.%${term}%,primary_email.ilike.%${term}%`);
      }

      const result = await query;
      if (result.error) throw result.error;
      return jsonResponse({ rows: result.data });
    }

    if (body.action === "create_vendor") {
      const row = normalizeVendor(body.vendor || {}, "manual");
      const result = await supabase.from("vendors").insert(row).select().single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    if (body.action === "import_vendors") {
      const vendors = Array.isArray(body.vendors) ? body.vendors : [];
      const rows = vendors.map((vendor: Record<string, unknown>) => normalizeVendor(vendor, "import"));
      if (!rows.length) return jsonResponse({ inserted: 0, rows: [] });

      const result = await supabase.from("vendors").upsert(rows, {
        onConflict: "vendor_name,domain",
        ignoreDuplicates: false
      }).select();

      if (result.error) throw result.error;
      return jsonResponse({ inserted: result.data.length, rows: result.data });
    }

    if (body.action === "bulk_update_vendors") {
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
      if (!ids.length) return jsonResponse({ updated: 0, rows: [] });

      const patch = normalizeVendorPatch(body.patch || {});
      const addTags = normalizeTags(body.patch?.add_tags);

      if (addTags.length) {
        const current = await supabase.from("vendors").select("id,tags").in("id", ids);
        if (current.error) throw current.error;

        const updates = await Promise.all(
          current.data.map((vendor) => {
            const mergedTags = Array.from(new Set([...normalizeTags(vendor.tags), ...addTags]));
            return supabase.from("vendors").update({ ...patch, tags: mergedTags }).eq("id", vendor.id).select().single();
          })
        );

        for (const update of updates) {
          if (update.error) throw update.error;
        }

        return jsonResponse({ updated: updates.length, rows: updates.map((update) => update.data) });
      }

      const result = await supabase.from("vendors").update(patch).in("id", ids).select();
      if (result.error) throw result.error;
      return jsonResponse({ updated: result.data.length, rows: result.data });
    }

    if (body.action === "update_vendor") {
      if (!body.id) return jsonResponse({ error: "Vendor id is required." }, 400);
      const patch = normalizeVendorPatch(body.patch || {});
      if (patch.vendor_name === null) return jsonResponse({ error: "Vendor name is required." }, 400);
      const result = await supabase.from("vendors").update(patch).eq("id", body.id).select().single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    if (body.action === "list_vendor_segments") {
      const result = await supabase.from("vendor_segments").select("*").order("created_at", { ascending: false }).limit(100);
      if (result.error) throw result.error;
      return jsonResponse({ rows: result.data });
    }

    if (body.action === "create_vendor_segment") {
      const row = normalizeSegment(body.segment || {});
      const result = await supabase.from("vendor_segments").insert(row).select().single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    if (body.action === "delete_vendor_segment") {
      if (!body.id) return jsonResponse({ error: "Segment id is required." }, 400);
      const result = await supabase.from("vendor_segments").delete().eq("id", body.id).select().single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    if (body.action === "dashboard_summary") {
      const [uploads, vendors, pending, approved, failed] = await Promise.all([
        supabase.from("raw_uploads").select("id", { count: "exact", head: true }),
        supabase.from("vendors").select("id", { count: "exact", head: true }),
        supabase.from("rate_staging").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
        supabase.from("rate_staging").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("raw_uploads").select("id", { count: "exact", head: true }).eq("status", "failed")
      ]);

      for (const result of [uploads, vendors, pending, approved, failed]) {
        if (result.error) throw result.error;
      }

      return jsonResponse({
        raw_uploads: uploads.count || 0,
        vendors: vendors.count || 0,
        pending_review: pending.count || 0,
        approved_rows: approved.count || 0,
        failed_uploads: failed.count || 0
      });
    }

    if (body.action === "list_uploads") {
      let query = supabase.from("raw_uploads").select("*, vendors(vendor_name, domain)").order("created_at", { ascending: false }).limit(100);
      if (body.status) query = query.eq("status", body.status);
      const result = await query;
      if (result.error) throw result.error;
      return jsonResponse({ rows: result.data });
    }

    if (body.action === "list_staging") {
      let query = supabase.from("rate_staging").select("*, vendors(vendor_name, domain)").order("created_at", { ascending: false }).limit(200);
      if (body.status) query = query.eq("status", body.status);
      const result = await query;
      if (result.error) throw result.error;
      return jsonResponse({ rows: result.data });
    }

    if (body.action === "update_staging") {
      const patch = normalizeStagingPatch(body.patch || {});
      if (!Object.keys(patch).length) return jsonResponse({ error: "No staging updates provided." }, 400);

      const result = await supabase.from("rate_staging").update(patch).eq("id", body.id).select().single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    return jsonResponse({ error: error.message }, 401);
  }
});
