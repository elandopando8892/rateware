// Fr8Onboard sends through the internal HeyMarksman WhatsApp sender; it never holds Meta credentials.
// Only the onboarding template (or free text inside the 24 h window) is accepted, authenticated with a shared secret.
export const FR8ONBOARD_TEMPLATES = Object.freeze({ fr8onboard_alta_enlace: { languages: ['es_MX'], params: 5 } });

export class Fr8onboardError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new Fr8onboardError(status, message); };

export function authorized(header, secret) {
  if (!secret || secret.length < 24) return false;
  const given = String(header || '').replace(/^Bearer\s+/i, '');
  if (given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

// Meta needs the country code: 11 to 15 digits (52 + 10 for MX, 1 + 10 for US).
export function metaRecipient(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 11 || digits.length > 15) fail(400, 'El celular debe incluir lada de país (11 a 15 dígitos).');
  return digits;
}

// Meta rejects template parameters with line breaks, tabs or more than four consecutive spaces.
const param = (value) => {
  const text = String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim();
  if (!text) fail(400, 'Las variables de la plantilla no pueden ir vacías.');
  if (text.length > 1024) fail(400, 'Una variable de la plantilla excede 1024 caracteres.');
  return text;
};

export function metaMessage(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Solicitud inválida.');
  const to = metaRecipient(body.to);
  if (body.template) {
    const { nombre, idioma, variables } = body.template;
    const spec = FR8ONBOARD_TEMPLATES[nombre];
    if (!spec) fail(400, 'Plantilla no permitida para Fr8Onboard.');
    if (!spec.languages.includes(idioma)) fail(400, 'Idioma de plantilla no permitido.');
    if (!Array.isArray(variables) || variables.length !== spec.params) fail(400, `La plantilla requiere ${spec.params} variables.`);
    return {
      messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template',
      template: { name: nombre, language: { code: idioma }, components: [{ type: 'body', parameters: variables.map((v) => ({ type: 'text', text: param(v) })) }] },
    };
  }
  const text = String(body.text ?? '').trim();
  if (!text) fail(400, 'Falta el texto o la plantilla.');
  if (text.length > 4096) fail(400, 'El texto excede 4096 caracteres.');
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: true, body: text } };
}

// Inbound messages on the internal sender are relayed to Fr8Onboard so the reply lands in the counterparty's file.
export function shouldForward(env, phoneNumberId, event) {
  return event?.kind === 'inbound' && !!env.url && (env.secret || '').length >= 24 && !!env.phoneNumberId && phoneNumberId === env.phoneNumberId;
}
export const forwardPayload = (event) => ({ de: event.from_phone, cuerpo: event.body, externo_id: event.provider_message_id, adjuntos: [] });
