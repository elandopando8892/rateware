import { normalizeCarrierRateSheet } from "./carrier-rate-sheet.ts";

const valid = {
  action: "submit_carrier_rate_sheet",
  schema_version: "marksman-carrier-rate-sheet.v1",
  site: "holding", source: "holding-web", language: "es",
  company: "Transportes Uno", name: "Ana", email: "ana@example.com",
  coverage: "Monterrey - Bajío", idempotency_key: "carrier-test-12345678",
  file_name: "tarifas.csv", file_base64: btoa("origen,destino,tarifa\nMTY,QRO,100"),
};

Deno.test("accepts a bounded UTF-8 CSV while retaining carrier metadata", () => {
  const result = normalizeCarrierRateSheet(valid);
  if (!result.ok) throw new Error(result.code);
  if (result.lead.company !== valid.company || result.bytes.length === 0 || result.contentType !== "text/csv") {
    throw new Error("Carrier rate sheet was not normalized.");
  }
});

Deno.test("rejects executable content disguised as a spreadsheet", () => {
  const result = normalizeCarrierRateSheet({ ...valid, file_name: "tarifas.xlsx" });
  if (result.ok || result.code !== "invalid_file_type") throw new Error("Disguised file was accepted.");
});

Deno.test("rejects missing commercial identity and malformed file data", () => {
  if (normalizeCarrierRateSheet({ ...valid, email: "bad" }).ok) throw new Error("Invalid contact was accepted.");
  if (normalizeCarrierRateSheet({ ...valid, file_base64: "@@@" }).ok) throw new Error("Invalid file was accepted.");
});
