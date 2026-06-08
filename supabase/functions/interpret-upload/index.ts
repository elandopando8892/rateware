import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { requireKindeUser } from "../_shared/kinde.ts";

const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const RATEWARE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rows", "summary"],
  properties: {
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["vendor_domain", "rfx_id", "quote_date", "document_notes"],
      properties: {
        vendor_domain: { type: ["string", "null"] },
        rfx_id: { type: ["string", "null"] },
        quote_date: { type: ["string", "null"] },
        document_notes: { type: ["string", "null"] }
      }
    },
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "vendor_domain",
          "rfx_id",
          "quote_date",
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
          "confidence",
          "extraction_warnings"
        ],
        properties: {
          vendor_domain: { type: ["string", "null"] },
          rfx_id: { type: ["string", "null"] },
          quote_date: { type: ["string", "null"] },
          row_id: { type: ["string", "null"] },
          origin: { type: ["string", "null"] },
          destination: { type: ["string", "null"] },
          equipment: { type: ["string", "null"] },
          trailer: { type: ["string", "null"] },
          config: { type: ["string", "null"] },
          operation: { type: ["string", "null"] },
          service: { type: ["string", "null"] },
          driver: { type: ["string", "null"] },
          mx_border_crossing_point: { type: ["string", "null"] },
          us_border_crossing_point: { type: ["string", "null"] },
          mx_linehaul: { type: ["string", "null"] },
          us_linehaul: { type: ["string", "null"] },
          us_miles: { type: ["string", "null"] },
          fsc: { type: ["string", "null"] },
          fuel: { type: ["string", "null"] },
          border_crossing_fee: { type: ["string", "null"] },
          flat_rate: { type: ["string", "null"] },
          all_in_rate: { type: ["string", "null"] },
          currency: { type: ["string", "null"] },
          weekly_capacity: { type: ["string", "null"] },
          notes: { type: ["string", "null"] },
          accessorials: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          extraction_warnings: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function openAIErrorMessage(response: Response, label: string) {
  const body = await response.text();

  try {
    const parsed = JSON.parse(body);
    const code = parsed?.error?.code || parsed?.error?.type;

    if (code === "insufficient_quota") {
      return "OpenAI quota is not available for this project. Add billing/credits in OpenAI or update OPENAI_API_KEY to a project with available quota.";
    }

    if (parsed?.error?.message) {
      return `${label}: ${parsed.error.message}`;
    }
  } catch {
    // Fall through to the raw body below.
  }

  return `${label}: ${body}`;
}

function isInvalidRateValue(value: unknown) {
  if (value === null || value === undefined) return true;
  const normalized = String(value).trim();
  return !normalized || /^x$/i.test(normalized) || /^n\/?a$/i.test(normalized) || /^please estimate$/i.test(normalized) || /^tier\s*[123]$/i.test(normalized);
}

function cleanRateValue(value: unknown) {
  return isInvalidRateValue(value) ? null : String(value).trim();
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
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

function isInternalMarksmanDomain(value: unknown) {
  const normalized = normalizeMatchText(value);
  return normalized.includes("heymarksman.com") || normalized.includes("marksmanxbf.com") || normalized.includes("marksman");
}

function normalizeMatchText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9@.]/g, "");
}

function catalogKey(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreVendorMatch(vendor: Record<string, unknown>, rawUpload: Record<string, string>, interpretation: Record<string, unknown>) {
  const haystack = [
    rawUpload.vendor_hint,
    rawUpload.original_filename,
    interpretation.summary && (interpretation.summary as Record<string, unknown>).vendor_domain,
    ...(Array.isArray(interpretation.rows) ? interpretation.rows.map((row: Record<string, unknown>) => row.vendor_domain) : [])
  ].map(normalizeMatchText).join(" ");

  const vendorName = normalizeMatchText(vendor.vendor_name);
  const domain = normalizeMatchText(vendor.domain);
  const email = normalizeMatchText(vendor.primary_email);

  let score = 0;
  if (domain && haystack.includes(domain)) score += 70;
  if (email && haystack.includes(email)) score += 40;
  if (vendorName && haystack.includes(vendorName)) score += 55;

  const words = String(vendor.vendor_name || "").toLowerCase().split(/\s+/).filter((word) => word.length > 3);
  score += Math.min(30, words.filter((word) => haystack.includes(normalizeMatchText(word))).length * 10);
  return score;
}

async function findBestVendor(supabase: ReturnType<typeof createClient>, rawUpload: Record<string, string>, interpretation: Record<string, unknown>) {
  const result = await supabase.from("vendors").select("id,vendor_name,domain,primary_email,status").eq("status", "active").limit(500);
  if (result.error || !result.data?.length) return null;

  const ranked = result.data
    .map((vendor) => ({ vendor, score: scoreVendorMatch(vendor, rawUpload, interpretation) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score >= 55 ? ranked[0] : null;
}

function buildKeys(row: Record<string, unknown>) {
  const routeParts = [
    row.origin,
    row.destination,
    row.equipment,
    row.trailer,
    row.config,
    row.operation,
    row.service,
    row.driver,
    row.mx_border_crossing_point && row.us_border_crossing_point
      ? `${row.mx_border_crossing_point}/${row.us_border_crossing_point}`
      : row.mx_border_crossing_point || row.us_border_crossing_point
  ].filter(Boolean);

  const routeKey = routeParts.join(" ");
  const rfxKey = [row.rfx_id, row.row_id].filter(Boolean).join("-");

  return {
    rfx_key: rfxKey || null,
    route_key: routeKey || null,
    business_key: [rfxKey, routeKey].filter(Boolean).join(" ") || null
  };
}

function normalizeRow(row: Record<string, unknown>, rawUploadId: string, jobId: string, vendorId: string | null = null) {
  const base = {
    raw_upload_id: rawUploadId,
    interpretation_job_id: jobId,
    vendor_id: vendorId,
    status: "pending_review",
    vendor_domain: cleanText(row.vendor_domain),
    rfx_id: cleanText(row.rfx_id),
    quote_date: cleanDate(row.quote_date),
    row_id: cleanText(row.row_id),
    origin: cleanText(row.origin),
    destination: cleanText(row.destination),
    equipment: cleanText(row.equipment),
    trailer: cleanText(row.trailer),
    config: cleanText(row.config),
    operation: cleanText(row.operation),
    service: cleanText(row.service),
    driver: cleanText(row.driver),
    mx_border_crossing_point: cleanText(row.mx_border_crossing_point),
    us_border_crossing_point: cleanText(row.us_border_crossing_point),
    mx_linehaul: cleanRateValue(row.mx_linehaul),
    us_linehaul: cleanRateValue(row.us_linehaul),
    us_miles: cleanRateValue(row.us_miles),
    fsc: cleanRateValue(row.fsc),
    fuel: cleanRateValue(row.fuel),
    border_crossing_fee: cleanRateValue(row.border_crossing_fee),
    flat_rate: cleanRateValue(row.flat_rate),
    all_in_rate: cleanRateValue(row.all_in_rate),
    currency: cleanText(row.currency),
    weekly_capacity: cleanText(row.weekly_capacity),
    notes: cleanText(row.notes),
    accessorials: cleanText(row.accessorials),
    confidence: Math.max(0, Math.min(1, Number(row.confidence) || 0)),
    extraction_warnings: Array.isArray(row.extraction_warnings) ? row.extraction_warnings.map(String) : [],
    extracted_payload: row
  };

  return { ...base, ...buildKeys(base) };
}

function buildCatalogIndex(items: Record<string, unknown>[]) {
  const index = new Map<string, Map<string, Record<string, unknown>>>();

  for (const item of items) {
    const category = String(item.category);
    if (!index.has(category)) index.set(category, new Map());
    const bucket = index.get(category)!;
    bucket.set(catalogKey(item.raw_value), item);
    bucket.set(catalogKey(item.normalized_value), item);
    if (item.code) bucket.set(catalogKey(item.code), item);
  }

  return index;
}

function catalogMatch(index: Map<string, Map<string, Record<string, unknown>>>, categories: string[], value: unknown) {
  const lookup = catalogKey(value);
  if (!lookup) return null;

  for (const category of categories) {
    const direct = index.get(category)?.get(lookup);
    if (direct) return direct;
  }

  for (const category of categories) {
    for (const [candidateKey, item] of index.get(category) || []) {
      if (candidateKey && (lookup.includes(candidateKey) || candidateKey.includes(lookup))) return item;
    }
  }

  return null;
}

function normalizeWithCatalog(rows: Record<string, unknown>[], catalogItems: Record<string, unknown>[], laneMileage: Record<string, unknown>[]) {
  if (!catalogItems.length && !laneMileage.length) return rows;

  const catalog = buildCatalogIndex(catalogItems);
  const mileage = new Map(laneMileage.map((lane) => [catalogKey(lane.route_key), lane]));

  return rows.map((row) => {
    const originMatch = catalogMatch(catalog, ["zip_market", "mx_production"], row.origin);
    const destinationMatch = catalogMatch(catalog, ["zip_market", "mx_production"], row.destination);
    const equipmentMatch = catalogMatch(catalog, ["equipment"], row.equipment);
    const trailerMatch = catalogMatch(catalog, ["trailer"], row.trailer);
    const configMatch = catalogMatch(catalog, ["config"], row.config);
    const operationMatch = catalogMatch(catalog, ["operation"], row.operation);
    const serviceMatch = catalogMatch(catalog, ["service"], row.service);
    const driverMatch = catalogMatch(catalog, ["driver"], row.driver);

    const normalized: Record<string, unknown> = {
      ...row,
      normalized_origin: (originMatch?.normalized_value as string) || null,
      normalized_destination: (destinationMatch?.normalized_value as string) || null,
      origin_market: ((originMatch?.metadata as Record<string, unknown>)?.market as string) || null,
      destination_market: ((destinationMatch?.metadata as Record<string, unknown>)?.market as string) || null,
      normalized_equipment: (equipmentMatch?.normalized_value as string) || null,
      normalized_trailer: (trailerMatch?.normalized_value as string) || null,
      normalized_config: (configMatch?.normalized_value as string) || null,
      normalized_operation: (operationMatch?.normalized_value as string) || null,
      normalized_service: (serviceMatch?.normalized_value as string) || null,
      normalized_driver: (driverMatch?.normalized_value as string) || null
    };

    const matchCount = [
      originMatch,
      destinationMatch,
      equipmentMatch,
      trailerMatch,
      configMatch,
      operationMatch,
      serviceMatch,
      driverMatch
    ].filter(Boolean).length;

    const routeCandidates = [
      [normalized.normalized_origin || row.origin, normalized.normalized_destination || row.destination, normalized.normalized_equipment || row.equipment, normalized.normalized_trailer || row.trailer, normalized.normalized_config || row.config, normalized.normalized_operation || row.operation, normalized.normalized_service || row.service, normalized.normalized_driver || row.driver],
      [normalized.normalized_origin || row.origin, normalized.normalized_destination || row.destination, normalized.normalized_equipment || row.equipment],
      [row.route_key]
    ].map((parts) => catalogKey(Array.isArray(parts) ? parts.filter(Boolean).join(" ") : parts));

    const lane = routeCandidates.map((candidate) => mileage.get(candidate)).find(Boolean);
    if (lane) {
      normalized.calculated_miles = lane.miles || null;
      normalized.calculated_km = lane.km || null;
      normalized.mileage_source = String(lane.source || "catalog");
      if (!normalized.us_miles && lane.miles) normalized.us_miles = String(lane.miles);
    }

    normalized.catalog_match_status = matchCount >= 5 ? "matched" : matchCount >= 2 ? "partial" : "unmatched";
    return normalized;
  });
}

function isCarrierRateRow(row: Record<string, unknown>) {
  if (isInternalMarksmanDomain(row.vendor_domain)) return false;
  if (isInternalMarksmanDomain(row.primary_email)) return false;
  return true;
}

async function extractXlsxText(file: Blob) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  return workbook.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, blankrows: false });
    return `Sheet: ${name}\n${rows.slice(0, 250).map((row) => (row as unknown[]).join("\t")).join("\n")}`;
  }).join("\n\n");
}

async function uploadOpenAIFile(file: Blob, filename: string) {
  const formData = new FormData();
  formData.append("purpose", "user_data");
  formData.append("file", file, filename);

  const response = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: formData
  });

  if (!response.ok) throw new Error(await openAIErrorMessage(response, "OpenAI file upload failed"));
  return await response.json();
}

async function interpretWithModel(rawUpload: Record<string, string>, file: Blob) {
  const systemPrompt = [
    "You are Rateware AI, a senior freight procurement analyst.",
    "Interpret carrier quotations and normalize them into Rateware staging rows.",
    "Detect vendor, RFx, quotation date, origin, destination, equipment, operation, service, linehaul, border fee, FSC, all-in rate, and weekly capacity.",
    "Set quote_date to the carrier quotation date, bid date, offer date, email sent date, or document issue date when explicitly present. Use YYYY-MM-DD when possible.",
    "Never use Tier 1, Tier 2, or Tier 3 as carrier rates.",
    "Ignore X, N/A, and Please Estimate as rates.",
    "Ignore Marksman, heymarksman.com, or marksmanxbf.com template/layout/proposal rows. Those are the shipper's requested template, not the carrier response.",
    "Only capture the carrier's submitted proposal/rates. If the document contains both Marksman template values and carrier response values, return only the carrier response values.",
    "If a quote is all-in without breakdown, put the value in all_in_rate or flat_rate and explain in notes.",
    "Return only rows that represent carrier rates or capacity responses.",
    "Use null when a value is missing. Do not invent rates."
  ].join("\n");

  const userContent: Record<string, unknown>[] = [
    {
      type: "input_text",
      text: `Source filename: ${rawUpload.original_filename}\nVendor hint: ${rawUpload.vendor_hint || ""}\nRFx hint: ${rawUpload.rfx_hint || ""}\nDocument type: ${rawUpload.document_type}`
    }
  ];

  if (rawUpload.document_type === "xlsx") {
    userContent.push({ type: "input_text", text: await extractXlsxText(file) });
  } else if (rawUpload.document_type === "email") {
    userContent.push({ type: "input_text", text: await file.text() });
  } else {
    const openAIFile = await uploadOpenAIFile(file, rawUpload.original_filename);
    userContent.push({ type: "input_file", file_id: openAIFile.id });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: userContent }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "rateware_interpretation",
          strict: true,
          schema: RATEWARE_SCHEMA
        }
      }
    })
  });

  if (!response.ok) throw new Error(await openAIErrorMessage(response, "OpenAI interpretation failed"));

  const payload = await response.json();
  const outputText = payload.output_text ?? payload.output?.flatMap((item: Record<string, unknown>) => item.content ?? [])
    .find((content: Record<string, unknown>) => content.type === "output_text")?.text;

  if (!outputText) throw new Error("OpenAI returned no structured interpretation.");
  return JSON.parse(outputText);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!OPENAI_MODEL || !OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Missing OPENAI_MODEL, OPENAI_API_KEY, SUPABASE_URL, or RATEWARE_SUPABASE_SERVICE_ROLE_KEY." }, 500);
  }

  try {
    await requireKindeUser(request);
  } catch (error) {
    return jsonResponse({ error: error.message }, 401);
  }

  const { raw_upload_id } = await request.json();
  if (!raw_upload_id) return jsonResponse({ error: "raw_upload_id is required." }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const job = await supabase.from("interpretation_jobs").insert({
    raw_upload_id,
    model: OPENAI_MODEL
  }).select().single();

  if (job.error) return jsonResponse({ error: job.error.message }, 500);

  try {
    const uploadResult = await supabase.from("raw_uploads").select("*").eq("id", raw_upload_id).single();
    if (uploadResult.error) throw uploadResult.error;

    const rawUpload = uploadResult.data;
    const download = await supabase.storage.from(rawUpload.storage_bucket).download(rawUpload.storage_path);
    if (download.error) throw download.error;

    const interpretation = await interpretWithModel(rawUpload, download.data);
    const vendorMatch = await findBestVendor(supabase, rawUpload, interpretation);
    const vendorId = vendorMatch?.vendor?.id || rawUpload.vendor_id || null;
    const catalogResult = await supabase.from("rateware_catalog_items").select("category,raw_value,normalized_value,code,metadata").eq("active", true).limit(20000);
    const mileageResult = await supabase.from("rateware_lane_mileage").select("source,route_key,miles,km").eq("active", true).limit(20000);
    const catalogItems = catalogResult.error ? [] : catalogResult.data || [];
    const laneMileage = mileageResult.error ? [] : mileageResult.data || [];
    const rows = normalizeWithCatalog(interpretation.rows
      .filter((row: Record<string, unknown>) => isCarrierRateRow(row))
      .map((row: Record<string, unknown>) => normalizeRow(row, raw_upload_id, job.data.id, vendorId)), catalogItems, laneMileage);

    if (rows.length) {
      const insert = await supabase.from("rate_staging").insert(rows);
      if (insert.error) throw insert.error;
    }

    await supabase.from("interpretation_jobs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      extracted_rows: rows.length
    }).eq("id", job.data.id);

    await supabase.from("raw_uploads").update({
      vendor_id: vendorId,
      vendor_match_source: rawUpload.vendor_id ? "manual" : vendorMatch?.vendor?.id ? "auto" : rawUpload.vendor_match_source || null,
      status: "staged",
      interpreted_at: new Date().toISOString()
    }).eq("id", raw_upload_id);

    return jsonResponse({ job_id: job.data.id, staged_rows: rows.length });
  } catch (error) {
    await supabase.from("interpretation_jobs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: error.message
    }).eq("id", job.data.id);

    await supabase.from("raw_uploads").update({
      status: "failed",
      error_message: error.message
    }).eq("id", raw_upload_id);

    return jsonResponse({ error: error.message }, 500);
  }
});
