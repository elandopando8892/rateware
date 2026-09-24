// The quote email a shipper receives. Pure: the edge function renders it for
// the preview and again at send time, and sends only when both renderings
// hash to the same checksum (so a price edited in between is never sent).

import { customerService } from "./fcm.mjs";

const UNIT_WORDS = {
  hour: ["hora", "horas"],
  event: ["evento", "eventos"],
  trip: ["viaje", "viajes"],
  day: ["día", "días"],
  mile: ["milla", "millas"],
  other: ["unidad", "unidades"]
};

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Whole units when exact, cents otherwise; the shipper sees the stored price. */
export function formatMoney(value, currency) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency === "MXN" ? "MXN" : "USD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function placeName(city, state, label) {
  return city ? [city, state].filter(Boolean).join(", ") : String(label || "");
}

function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!match) return null;
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
}

function accessorialLine(accessorial, currency) {
  const quantity = Number(accessorial.quantity) || 0;
  const [one, many] = UNIT_WORDS[accessorial.unit] || UNIT_WORDS.other;
  return `${accessorial.label}: ${quantity} ${quantity === 1 ? one : many} × ${formatMoney(accessorial.rate, currency)}`;
}

/**
 * @param {object} input
 * @param {object} input.quote   quotedesk_quotes row
 * @param {object[]} input.lanes quotedesk_quote_lanes rows (priced)
 * @param {string} [input.contactName]
 * @param {string} [input.note]  personal message from the analyst
 * @param {string} [input.senderName]
 */
export function renderQuoteEmail({ quote, lanes, contactName, note, senderName = "MARKSMAN" }) {
  const currency = quote.currency === "MXN" ? "MXN" : "USD";
  const first = lanes[0];
  const route = first
    ? `${placeName(first.origin_city, first.origin_state, first.origin)} → ${placeName(first.destination_city, first.destination_state, first.destination)}`
    : "";
  const subject = [
    `Cotización ${quote.folio}`,
    quote.shipper_name || null,
    route ? `${route}${lanes.length > 1 ? ` (+${lanes.length - 1})` : ""}` : null
  ].filter(Boolean).join(" · ");
  const greeting = contactName ? `Hola ${contactName},` : "Hola,";
  const intro = (note && String(note).trim()) || "Te compartimos nuestra cotización:";
  const validUntil = formatDate(quote.valid_until);

  const textLines = [greeting, "", intro, ""];
  for (const lane of lanes) {
    const details = [lane.equipment, customerService(lane.service)].filter(Boolean).join(" · ");
    textLines.push(
      `${lane.lane_number}. ${placeName(lane.origin_city, lane.origin_state, lane.origin)} → ${placeName(lane.destination_city, lane.destination_state, lane.destination)}${details ? ` · ${details}` : ""}`
    );
    textLines.push(`   Tarifa all-in: ${formatMoney(lane.all_in_rate, currency)} ${currency} por carga`);
    for (const accessorial of lane.accessorials || []) textLines.push(`   Incluye ${accessorialLine(accessorial, currency)}`);
  }
  textLines.push("");
  if (validUntil) textLines.push(`Vigencia: hasta el ${validUntil}.`);
  textLines.push("Tarifas sujetas a disponibilidad de equipo al momento de confirmar la carga.");
  textLines.push("", "Saludos,", senderName, `Folio ${quote.folio}`);
  const text = textLines.join("\n");

  const rows = lanes.map((lane) => {
    const details = [lane.equipment, customerService(lane.service)].filter(Boolean).join(" · ");
    const accessorials = (lane.accessorials || [])
      .map((accessorial) => `<div style="color:#73746d;font-size:12px">Incluye ${escapeHtml(accessorialLine(accessorial, currency))}</div>`)
      .join("");
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e5e0;font-family:Arial,sans-serif;font-size:14px;color:#1e1e1e">
        <strong>${escapeHtml(placeName(lane.origin_city, lane.origin_state, lane.origin))} → ${escapeHtml(placeName(lane.destination_city, lane.destination_state, lane.destination))}</strong>
        ${details ? `<div style="color:#73746d;font-size:12px">${escapeHtml(details)}</div>` : ""}
        ${accessorials}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e5e0;font-family:Arial,sans-serif;font-size:14px;color:#1e1e1e;text-align:right;white-space:nowrap">
        <strong>${escapeHtml(formatMoney(lane.all_in_rate, currency))}</strong> ${currency}
        <div style="color:#73746d;font-size:12px">por carga</div>
      </td>
    </tr>`;
  }).join("");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f2">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e0">
    <tr><td style="padding:18px 20px;background:#1e1e1e;font-family:Arial,sans-serif;color:#ffffff;font-size:13px;letter-spacing:.08em">
      <span style="color:#ea5e27">■</span> MARKSMAN · Cotización ${escapeHtml(quote.folio)}
    </td></tr>
    <tr><td style="padding:20px;font-family:Arial,sans-serif;font-size:14px;color:#1e1e1e;line-height:1.5">
      <p style="margin:0 0 12px">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 16px;white-space:pre-line">${escapeHtml(intro)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e5e0">
        <tr>
          <th align="left" style="padding:8px 12px;background:#f8f8f6;font-family:Arial,sans-serif;font-size:11px;color:#484848;text-transform:uppercase;letter-spacing:.05em">Ruta</th>
          <th align="right" style="padding:8px 12px;background:#f8f8f6;font-family:Arial,sans-serif;font-size:11px;color:#484848;text-transform:uppercase;letter-spacing:.05em">Tarifa all-in</th>
        </tr>
        ${rows}
      </table>
      ${validUntil ? `<p style="margin:16px 0 0">Vigencia: hasta el ${escapeHtml(validUntil)}.</p>` : ""}
      <p style="margin:8px 0 0;color:#73746d;font-size:12px">Tarifas sujetas a disponibilidad de equipo al momento de confirmar la carga.</p>
      <p style="margin:20px 0 0">Saludos,<br>${escapeHtml(senderName)}</p>
    </td></tr>
  </table>
</body></html>`;
  return { subject, text, html };
}

export function isEmail(value) {
  return /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/.test(String(value || "").trim());
}
