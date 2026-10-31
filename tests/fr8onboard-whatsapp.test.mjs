import test from 'node:test';
import assert from 'node:assert/strict';
import { authorized, forwardPayload, metaMessage, shouldForward } from '../supabase/functions/fr8onboard-whatsapp/policy.mjs';

const SECRET = 's'.repeat(32);
const vars = ['NEXLOG', 'transportista', '33 %', 'póliza de seguro y carátula bancaria', 'https://onboard.xbfreight.com/c/abc'];

test('only the exact shared secret is accepted', () => {
  assert.equal(authorized(`Bearer ${SECRET}`, SECRET), true);
  assert.equal(authorized('Bearer other', SECRET), false);
  assert.equal(authorized(`Bearer ${SECRET}`, ''), false);
});

test('builds the onboarding template with five body parameters', () => {
  const m = metaMessage({ to: '+52 222 193 0036', template: { nombre: 'fr8onboard_alta_enlace', idioma: 'es_MX', variables: vars } });
  assert.equal(m.to, '522221930036');
  assert.equal(m.template.name, 'fr8onboard_alta_enlace');
  assert.deepEqual(m.template.components[0].parameters.map((p) => p.text), vars);
});

test('rejects other templates, wrong arity, missing country code and line breaks become spaces', () => {
  assert.throws(() => metaMessage({ to: '522221930036', template: { nombre: 'rfx_invite', idioma: 'es_MX', variables: vars } }), /no permitida/);
  assert.throws(() => metaMessage({ to: '522221930036', template: { nombre: 'fr8onboard_alta_enlace', idioma: 'es_MX', variables: vars.slice(0, 3) } }), /5 variables/);
  assert.throws(() => metaMessage({ to: '2221930036', text: 'hola' }), /lada de país/);
  const m = metaMessage({ to: '12105550100', template: { nombre: 'fr8onboard_alta_enlace', idioma: 'es_MX', variables: ['A\nB', ...vars.slice(1)] } });
  assert.equal(m.template.components[0].parameters[0].text, 'A B');
});

test('free text inside the 24 h window', () => {
  const m = metaMessage({ to: '522221930036', text: 'Gracias, ya lo revisamos.' });
  assert.equal(m.type, 'text');
  assert.equal(m.text.body, 'Gracias, ya lo revisamos.');
});

test('forwards only inbound messages of the internal sender when configured', () => {
  const env = { url: 'https://onboard.test/api/canales/whatsapp', secret: SECRET, phoneNumberId: '111' };
  const event = { kind: 'inbound', from_phone: '522221930036', body: 'listo', provider_message_id: 'wamid.1' };
  assert.equal(shouldForward(env, '111', event), true);
  assert.equal(shouldForward(env, '222', event), false);
  assert.equal(shouldForward(env, '111', { ...event, kind: 'status' }), false);
  assert.equal(shouldForward({ ...env, url: '' }, '111', event), false);
  assert.deepEqual(forwardPayload(event), { de: '522221930036', cuerpo: 'listo', externo_id: 'wamid.1', adjuntos: [] });
});
