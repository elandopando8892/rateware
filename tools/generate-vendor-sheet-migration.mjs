import fs from "node:fs/promises";

const SOURCE_URL =
  "https://docs.google.com/spreadsheets/d/1m-ZhZL07orYfKkstgaDAlZjXZ9-WXiYUcBkPY_bQpn8/edit?usp=sharing";
const SHEET_ID = "1m-ZhZL07orYfKkstgaDAlZjXZ9-WXiYUcBkPY_bQpn8";
const GID = "0";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function clean(value) {
  const text = String(value ?? "").replace(/\u00a0/g, " ").trim();
  return text || null;
}

function key(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeDomain(value) {
  const text = clean(value);
  if (!text) return null;
  const domain = text
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#\s]/)[0];
  return domain.includes(".") ? domain : null;
}

function splitList(value) {
  return String(value ?? "")
    .split(/[;|,+]/)
    .map((part) => clean(part))
    .filter(Boolean);
}

function splitEmails(value) {
  return String(value ?? "")
    .split(/[;,]/)
    .map((email) => clean(email)?.toLowerCase())
    .filter(Boolean);
}

function tagify(...values) {
  return Array.from(
    new Set(
      values
        .flatMap(splitList)
        .map((tag) => tag.toLowerCase())
        .filter((tag) => tag && !["", "-", "desconocido"].includes(tag))
    )
  ).slice(0, 20);
}

function sqlText(value) {
  return value === null || value === undefined ? "null" : `'${String(value).replace(/'/g, "''")}'`;
}

function sqlArray(values) {
  const rows = (values || []).filter(Boolean);
  if (!rows.length) return "'{}'::text[]";
  return `array[${rows.map(sqlText).join(", ")}]::text[]`;
}

function rowHash(record) {
  return JSON.stringify(record).slice(0, 12000);
}

const response = await fetch(CSV_URL);
if (!response.ok) {
  throw new Error(`Could not fetch Google Sheet CSV: HTTP ${response.status}`);
}

const rows = parseCsv(await response.text());
const headerIndex = rows.findIndex((row) => row.some((value) => key(value) === "carrier"));
if (headerIndex < 0) throw new Error("Could not find a Carrier header row.");

const headers = rows[headerIndex];
const records = rows.slice(headerIndex + 1).map((row, index) => {
  const record = { source_row_number: headerIndex + index + 2 };
  headers.forEach((header, position) => {
    record[clean(header) || `Column ${position + 1}`] = clean(row[position]);
  });
  return record;
});

function get(record, names) {
  const lookup = new Map(Object.keys(record).map((name) => [key(name), record[name]]));
  for (const name of names) {
    const value = clean(lookup.get(key(name)));
    if (value) return value;
  }
  return null;
}

function mergeUnique(left, right) {
  return Array.from(new Set([...(left || []), ...(right || [])].filter(Boolean)));
}

function appendText(left, right) {
  if (!left) return right || null;
  if (!right || left.includes(right)) return left;
  return `${left} | ${right}`;
}

const parsedVendors = records
  .map((record) => {
    const emails = splitEmails(get(record, ["Email"]));
    const vendorName = get(record, ["Carrier"]);
    if (!vendorName) return null;

    const coverageParts = [
      get(record, ["País"]) && `Country: ${get(record, ["País"])}`,
      get(record, ["HQ Ciudad"]) && `HQ: ${get(record, ["HQ Ciudad"])}`,
      get(record, ["Terminales"]) && `Terminals: ${get(record, ["Terminales"])}`,
      get(record, ["Cobertura"]) && `Coverage: ${get(record, ["Cobertura"])}`,
      get(record, ["Flota"]) && `Fleet: ${get(record, ["Flota"])}`,
      get(record, ["DOT / MC"]) && `DOT/MC: ${get(record, ["DOT / MC"])}`,
      get(record, ["Especialidad"]) && `Specialty: ${get(record, ["Especialidad"])}`
    ].filter(Boolean);

    const notesParts = [
      get(record, ["ID"]) && `Source ID: ${get(record, ["ID"])}`,
      get(record, ["Enriquecimiento"]) && `Enrichment: ${get(record, ["Enriquecimiento"])}`,
      get(record, ["Notas"])
    ].filter(Boolean);

    return {
      vendor_name: vendorName,
      legal_name: vendorName,
      domain: normalizeDomain(get(record, ["Web"])),
      primary_email: emails[0] || null,
      secondary_emails: emails.slice(1),
      whatsapp_phone: get(record, ["Teléfono"]),
      preferred_channel: emails.length ? "email" : "portal",
      status: "active",
      tags: tagify(
        get(record, ["País"]),
        get(record, ["Tipo"]),
        get(record, ["Servicios"]),
        get(record, ["Equipo"]),
        get(record, ["Cross-Border"]),
        get(record, ["Certs"]),
        get(record, ["Confianza"]),
        get(record, ["Enriquecimiento"])
      ),
      coverage_notes: coverageParts.join(" | ") || null,
      notes: notesParts.join(" | ") || null,
      source_row_number: Number(record.source_row_number),
      source_row_hash: rowHash(record)
    };
  })
  .filter(Boolean);

const vendorMap = new Map();
for (const vendor of parsedVendors) {
  const identity = vendor.domain ? `domain:${vendor.domain}` : `name:${vendor.vendor_name.toLowerCase()}`;
  const current = vendorMap.get(identity);
  if (!current) {
    vendorMap.set(identity, vendor);
    continue;
  }

  current.primary_email ||= vendor.primary_email;
  current.secondary_emails = mergeUnique(current.secondary_emails, [vendor.primary_email, ...vendor.secondary_emails].filter((email) => email !== current.primary_email));
  current.tags = mergeUnique(current.tags, vendor.tags).slice(0, 20);
  current.coverage_notes = appendText(current.coverage_notes, vendor.coverage_notes);
  current.notes = appendText(current.notes, vendor.notes);
  current.source_row_hash = appendText(current.source_row_hash, vendor.source_row_hash);
}

const vendors = Array.from(vendorMap.values());

const values = vendors.map((vendor) => `(
  ${sqlText(vendor.vendor_name)},
  ${sqlText(vendor.legal_name)},
  ${sqlText(vendor.domain)},
  ${sqlText(vendor.primary_email)},
  ${sqlArray(vendor.secondary_emails)},
  ${sqlText(vendor.whatsapp_phone)},
  ${sqlText(vendor.preferred_channel)},
  ${sqlText(vendor.status)},
  ${sqlArray(vendor.tags)},
  ${sqlText(vendor.coverage_notes)},
  ${sqlText(vendor.notes)},
  'google_sheet',
  'sourcing',
  ${sqlText(SOURCE_URL)},
  ${sqlText(SHEET_ID)},
  ${sqlText(GID)},
  ${vendor.source_row_number},
  ${sqlText(vendor.source_row_hash)},
  now()
)`);

const sql = `-- Import public Google Sheet vendor CRM into Sourcing Base.
-- Source rows parsed from ${SOURCE_URL}

delete from public.vendors
where source_spreadsheet_id = ${sqlText(SHEET_ID)}
  and source_sheet_gid = ${sqlText(GID)};

insert into public.vendors (
  vendor_name,
  legal_name,
  domain,
  primary_email,
  secondary_emails,
  whatsapp_phone,
  preferred_channel,
  status,
  tags,
  coverage_notes,
  notes,
  source,
  base_stage,
  source_spreadsheet_url,
  source_spreadsheet_id,
  source_sheet_gid,
  source_row_number,
  source_row_hash,
  last_synced_at
)
values
${values.join(",\n")}
on conflict (domain) do update set
  vendor_name = excluded.vendor_name,
  legal_name = excluded.legal_name,
  primary_email = excluded.primary_email,
  secondary_emails = excluded.secondary_emails,
  whatsapp_phone = excluded.whatsapp_phone,
  preferred_channel = excluded.preferred_channel,
  status = excluded.status,
  tags = excluded.tags,
  coverage_notes = excluded.coverage_notes,
  notes = excluded.notes,
  source = excluded.source,
  base_stage = excluded.base_stage,
  source_spreadsheet_url = excluded.source_spreadsheet_url,
  source_spreadsheet_id = excluded.source_spreadsheet_id,
  source_sheet_gid = excluded.source_sheet_gid,
  source_row_number = excluded.source_row_number,
  source_row_hash = excluded.source_row_hash,
  last_synced_at = excluded.last_synced_at,
  archived_at = null,
  updated_at = now();
`;

await fs.writeFile("supabase/migrations/20260617150000_import_sourcing_base_google_sheet.sql", sql);
console.log(`Generated ${vendors.length} vendor rows from ${parsedVendors.length} source rows.`);
