import { callRatewareFunction } from "./rateware-api.js";

// Fr8Onboard decides whether a vendor is cleared to load; Rateware only reads it.
export async function fetchFr8OnboardAptos(vendorIds = []) {
  return await callRatewareFunction("fr8onboard-aptos", "list_aptos", { vendor_ids: vendorIds });
}

const ESTADOS = {
  apto: ["Fr8Onboard: cleared", "success"],
  apto_condicionado: ["Fr8Onboard: cleared with conditions", "warning"],
  suspendido: ["Fr8Onboard: suspended", "danger"],
  en_proceso: ["Fr8Onboard: onboarding", "muted"]
};

export function fr8OnboardBadgeData(rows = []) {
  const row = rows.find((item) => item.rol === "proveedor") || rows[0];
  if (!row) return null;
  const [label, tone] = ESTADOS[row.estado] || [`Fr8Onboard: ${row.estado}`, "muted"];
  const until = row.vigente_hasta ? String(row.vigente_hasta).slice(0, 10) : "";
  return { label: until && row.estado.startsWith("apto") ? `${label} until ${until}` : label, tone, entity: row.entidad_codigo };
}
