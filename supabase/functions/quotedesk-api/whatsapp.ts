// WhatsApp de la cotización por el remitente interno de HeyMarksman (Meta Cloud API), el mismo que usa Rateware para
// invitar transportistas. Meta solo deja iniciar la conversación con una plantilla aprobada: «fr8quote_propuesta_es»
// (UTILITY, es_MX) con nombre del contacto, folio, ruta, tarifa y enlace de la propuesta.

const env = (name: string) => (Deno.env.get(name) || "").trim();
const config = () => ({
  version: env("WHATSAPP_GRAPH_API_VERSION") || "v23.0",
  phone: env("WHATSAPP_PHONE_NUMBER_ID"),
  token: env("WHATSAPP_ACCESS_TOKEN"),
  waba: env("WHATSAPP_WABA_ID") || env("WHATSAPP_BUSINESS_ACCOUNT_ID"),
});

export const QUOTE_TEMPLATE = "fr8quote_propuesta_es";
export const QUOTE_TEMPLATE_LANGUAGE = "es_MX";
// Meta no acepta una variable al final del cuerpo: termina en «Gracias.».
export const QUOTE_TEMPLATE_BODY =
  "Hola {{1}}, te compartimos la propuesta de cotización {{2}} de MARKSMAN para {{3}}: {{4}} all-in por carga.\nRevísala y acéptala aquí: {{5}}\nGracias.";
const QUOTE_TEMPLATE_EXAMPLE = ["Jose", "RFX102426-0023", "Apodaca → Laredo", "$856 USD", "https://fr8quote.vercel.app/h/ejemplo"];

export class WhatsappError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function graph(path: string, init: RequestInit = {}) {
  const { version, phone, token } = config();
  if (!token || !phone) throw new WhatsappError(503, "El remitente de WhatsApp de HeyMarksman no está configurado en Bidware.");
  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/${version}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new WhatsappError(502, `Meta no respondió: ${error instanceof Error ? error.message : String(error)}`);
  }
  const data = await res.json().catch(() => ({})) as Record<string, any>;
  if (!res.ok) throw new WhatsappError(502, String(data?.error?.error_user_msg || data?.error?.message || `Meta respondió ${res.status}.`));
  return data;
}

/** La cuenta (WABA) a la que pertenece el número: la relación del teléfono manda; la variable es respaldo. */
async function wabaId() {
  try {
    const phone = await graph(`${config().phone}?fields=whatsapp_business_account`);
    const id = String(phone?.whatsapp_business_account?.id || "");
    if (id) return id;
  } catch (_) { /* versiones de Graph sin la relación: se usa la variable */ }
  const { waba } = config();
  if (!waba) throw new WhatsappError(503, "No se encontró la cuenta de WhatsApp Business del remitente.");
  return waba;
}

/** Estado de la plantilla; si no existe, la registra en Meta (queda en revisión). */
export async function ensureQuoteTemplate(): Promise<{ status: string; created: boolean; name: string }> {
  const waba = await wabaId();
  const found = await graph(`${waba}/message_templates?name=${QUOTE_TEMPLATE}&fields=name,language,status`);
  const row = (found?.data || []).find((t: Record<string, unknown>) => t.name === QUOTE_TEMPLATE && t.language === QUOTE_TEMPLATE_LANGUAGE);
  if (row) return { status: String(row.status || "UNKNOWN").toUpperCase(), created: false, name: QUOTE_TEMPLATE };
  const created = await graph(`${waba}/message_templates`, {
    method: "POST",
    body: JSON.stringify({
      name: QUOTE_TEMPLATE,
      language: QUOTE_TEMPLATE_LANGUAGE,
      category: "UTILITY",
      components: [{ type: "BODY", text: QUOTE_TEMPLATE_BODY, example: { body_text: [QUOTE_TEMPLATE_EXAMPLE] } }],
    }),
  });
  return { status: String(created?.status || "PENDING").toUpperCase(), created: true, name: QUOTE_TEMPLATE };
}

/** Teléfono para Meta: solo dígitos con lada de país; sin ella no se adivina el país. */
export function waNumber(raw: unknown) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) return null; // sin lada de país no se adivina el país
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/** Manda la propuesta con la plantilla aprobada. Devuelve el id del mensaje de Meta. */
export async function sendQuoteTemplate(to: string, params: [string, string, string, string, string]) {
  const tpl = await ensureQuoteTemplate();
  if (tpl.status !== "APPROVED") {
    throw new WhatsappError(409, tpl.created
      ? "Registré la plantilla de cotización en Meta; queda en revisión. Vuelve a enviar cuando Meta la apruebe."
      : `La plantilla de cotización está ${tpl.status === "PENDING" ? "en revisión en Meta" : `en estado ${tpl.status} en Meta`}.`);
  }
  const data = await graph(`${config().phone}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: QUOTE_TEMPLATE,
        language: { code: QUOTE_TEMPLATE_LANGUAGE },
        components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: (text || "-").slice(0, 300) })) }],
      },
    }),
  });
  return String(data?.messages?.[0]?.id || "");
}
