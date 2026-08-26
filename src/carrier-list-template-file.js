function normalizedHeader(value = "") {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const HEADER_ALIASES = {
  vendor_id: "vendor_id",
  crm_vendor_id: "vendor_id",
  id_proveedor_crm: "vendor_id",
  id_de_proveedor_crm: "vendor_id",
  crm_id: "crm_id",
  legacy_crm_id: "crm_id",
  usdot: "usdot_number",
  usdot_number: "usdot_number",
  us_dot_number: "usdot_number",
  numero_usdot: "usdot_number",
  numero_de_usdot: "usdot_number",
  mc: "mc_number",
  mc_number: "mc_number",
  numero_mc: "mc_number",
  numero_de_mc: "mc_number",
  primary_email: "primary_email",
  email: "primary_email",
  contact_email: "primary_email",
  correo_electronico_principal: "primary_email",
  correo_principal: "primary_email",
  vendor_name: "vendor_name",
  carrier_name: "vendor_name",
  carrier: "vendor_name",
  vendor: "vendor_name",
  company_name: "vendor_name",
  nombre_del_proveedor: "vendor_name",
  nombre_de_proveedor: "vendor_name",
  nombre_del_transportista: "vendor_name"
};

export function mapCarrierTemplateHeader(value = "") {
  const header = normalizedHeader(value);
  return HEADER_ALIASES[header] || header;
}

export function rowsFromCarrierTemplateMatrix(matrix = []) {
  const rows = Array.isArray(matrix) ? matrix : [];
  const headerIndex = rows.findIndex((row) => {
    const headers = (Array.isArray(row) ? row : []).map(mapCarrierTemplateHeader);
    return headers.some((header) => ["vendor_id", "crm_id", "usdot_number", "mc_number", "primary_email", "vendor_name"].includes(header));
  });
  if (headerIndex < 0) {
    throw new Error("Carrier template headers not found.");
  }

  const headers = rows[headerIndex].map(mapCarrierTemplateHeader);
  return rows.slice(headerIndex + 1)
    .map((row, index) => {
      const item = {};
      headers.forEach((header, columnIndex) => {
        if (header) item[header] = Array.isArray(row) ? row[columnIndex] ?? "" : "";
      });
      item.source_row_number = headerIndex + index + 2;
      return item;
    })
    .filter((row) => Object.entries(row).some(([key, value]) => key !== "source_row_number" && String(value ?? "").trim()));
}

function normalizedText(value, { lowerCase = false } = {}) {
  const text = String(value ?? "").trim();
  return lowerCase ? text.toLowerCase() : text;
}

export function normalizeCarrierTemplateRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => {
    const usdotNumber = normalizedText(row?.usdot_number ?? row?.usdot);
    return {
      vendor_id: normalizedText(row?.vendor_id),
      crm_id: normalizedText(row?.crm_id),
      usdot_number: usdotNumber,
      usdot: usdotNumber,
      mc_number: normalizedText(row?.mc_number ?? row?.mc),
      primary_email: normalizedText(row?.primary_email ?? row?.email, { lowerCase: true }),
      vendor_name: normalizedText(row?.vendor_name ?? row?.name),
      source_row_number: Number.isFinite(Number(row?.source_row_number)) && Number(row.source_row_number) > 0
        ? Number(row.source_row_number)
        : index + 2
    };
  });
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function carrierTemplateExceptionCsv(resolutionRows = []) {
  const headers = [
    "source_row_number",
    "status",
    "reason",
    "vendor_id",
    "crm_id",
    "usdot_number",
    "mc_number",
    "primary_email",
    "vendor_name",
    "candidate_vendor_ids",
    "chosen_vendor_id",
    "requires_manual_confirmation"
  ];
  const data = (Array.isArray(resolutionRows) ? resolutionRows : []).map((row) => {
    const sourceRow = row?.source_row && typeof row.source_row === "object" ? row.source_row : {};
    return [
      row?.source_row_number ?? sourceRow.source_row_number ?? "",
      row?.status ?? "",
      row?.reason ?? "",
      sourceRow.vendor_id ?? "",
      sourceRow.crm_id ?? "",
      sourceRow.usdot_number ?? sourceRow.usdot ?? "",
      sourceRow.mc_number ?? sourceRow.mc ?? "",
      sourceRow.primary_email ?? sourceRow.email ?? "",
      sourceRow.vendor_name ?? sourceRow.name ?? "",
      Array.isArray(row?.candidate_vendor_ids) ? row.candidate_vendor_ids.join(";") : row?.candidate_vendor_ids ?? "",
      row?.chosen_vendor_id ?? "",
      row?.requires_manual_confirmation ?? ""
    ].map(csvCell).join(",");
  });
  return `${headers.join(",")}\r\n${data.join("\r\n")}${data.length ? "\r\n" : ""}`;
}
