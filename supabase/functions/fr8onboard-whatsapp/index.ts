import { authorized, Fr8onboardError, metaMessage } from "./policy.mjs";

const SECRET = (Deno.env.get("FR8ONBOARD_SHARED_SECRET") || "").trim();
const GRAPH_VERSION = (Deno.env.get("WHATSAPP_GRAPH_API_VERSION") || "v23.0").trim();
const PHONE_NUMBER_ID = (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "").trim();
const ACCESS_TOKEN = (Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "").trim();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Server-to-server only (no CORS): Fr8Onboard asks the internal sender to deliver one onboarding message.
Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  if (!authorized(request.headers.get("authorization"), SECRET)) return json({ error: "No autorizado." }, 401);
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) return json({ error: "El remitente interno de WhatsApp no está configurado." }, 503);
  try {
    const message = metaMessage(await request.json());
    const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = result?.error?.error_user_msg || result?.error?.message || `Meta respondió ${response.status}`;
      return json({ error }, response.status >= 500 ? 502 : 422);
    }
    return json({ provider_message_id: result?.messages?.[0]?.id ?? null });
  } catch (error) {
    if (error instanceof Fr8onboardError) return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: "Solicitud inválida." }, 400);
    return json({ error: "No se pudo enviar el WhatsApp." }, 502);
  }
});
