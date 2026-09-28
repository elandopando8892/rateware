export const MAX_RATE_SHEET_BYTES = 1_500_000;

const MIME_BY_EXTENSION: Record<string, string> = {
  csv: "text/csv",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function text(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export function normalizeCarrierRateSheet(input: Record<string, unknown>) {
  const filename = text(input.file_name, 160);
  const extension = filename.split(".").pop()?.toLowerCase() || "";
  const base64 = String(input.file_base64 || "");
  const email = text(input.email, 200).toLowerCase();
  const idempotencyKey = text(input.idempotency_key, 128);
  const valid = input.action === "submit_carrier_rate_sheet"
    && input.schema_version === "marksman-carrier-rate-sheet.v1"
    && input.site === "holding" && input.source === "holding-web"
    && Boolean(text(input.company, 160) && text(input.name, 120) && text(input.coverage, 500))
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotencyKey)
    && Boolean(MIME_BY_EXTENSION[extension])
    && base64.length > 0 && base64.length <= Math.ceil(MAX_RATE_SHEET_BYTES / 3) * 4
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64);
  if (!valid) return { ok: false as const, code: "invalid_carrier_rate_sheet" };
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0)); }
  catch { return { ok: false as const, code: "invalid_file_encoding" }; }
  if (!bytes.length || bytes.length > MAX_RATE_SHEET_BYTES) return { ok: false as const, code: "invalid_file_size" };
  const xlsx = extension === "xlsx" && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  const xls = extension === "xls" && [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((value, index) => bytes[index] === value);
  let csv = false;
  if (extension === "csv" && !bytes.includes(0)) {
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); csv = true; } catch { /* Invalid UTF-8. */ }
  }
  if (!(xlsx || xls || csv)) return { ok: false as const, code: "invalid_file_type" };
  return {
    ok: true as const,
    bytes,
    extension,
    contentType: MIME_BY_EXTENSION[extension],
    lead: {
      kind: "carrier_rate_sheet", schema_version: "marksman-carrier-rate-sheet.v1",
      site: "holding", source: "holding-web", language: input.language === "en" ? "en" : "es",
      company: text(input.company, 160), name: text(input.name, 120), email,
      mc_dot: text(input.mc_dot, 80), fleet: text(input.fleet, 40),
      equipment: text(input.equipment, 120), configuration: text(input.configuration, 80),
      coverage: text(input.coverage, 500), service_level: text(input.service_level, 120),
      file_name: filename, file_size: bytes.length, idempotency_key: idempotencyKey,
    },
  };
}
