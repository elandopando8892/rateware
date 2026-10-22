import { createWhatsappApproval, requireWhatsappApproval, freezeWhatsappSnapshot, WHATSAPP_APPROVAL_CONTRACT } from './whatsapp-approval.mjs';

// Adapts existing persistence/claim/provider boundaries. This module never creates
// connections/templates or retries a provider request. All credentials stay here.
type Row = Record<string, any>;
type Dependencies = {
  env: Row;
  internalIdentity: (user: any) => boolean;
  decryptSecret: (value: unknown, label?: string) => Promise<string>;
  graph: (connection: any, path: string, options?: RequestInit) => Promise<any>;
  expectedVersions: (ids: string[], entries: unknown) => Map<string, string>;
  requireVersion: (message: any, expected: any) => any;
  claim: (...args: any[]) => Promise<any>;
  complete: (...args: any[]) => Promise<any>;
  fail: (...args: any[]) => Promise<any>;
  history: (...args: any[]) => Promise<any>;
  isQuote: (message: any) => boolean;
  operationalError: (error: unknown) => string;
};
const required = (detail: string) => Object.assign(new Error(`OUTREACH_APPROVAL_REQUIRED: ${detail}`), { code: '409' });
const conflict = () => Object.assign(new Error('OUTREACH_VERSION_CONFLICT: review the current message again.'), { code: '409' });
const string = (v: unknown) => typeof v === 'string' ? v : '';
const record = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {};
const e164 = (v: unknown) => /^\+[1-9]\d{7,14}$/.test(string(v));
// Legacy drafts retain the digits Meta receives and separately store explicit
// international form. Accept only an exact pair: never infer or change a country.
const exactRecipient = (raw: unknown, normalized: unknown) => e164(raw)
  ? !normalized || normalized === raw
  : /^[1-9]\d{7,14}$/.test(string(raw)) && e164(normalized) && normalized === `+${raw}`;
// Meta's display_phone_number may contain presentation spaces/punctuation.
// Keep the original string in the signed snapshot; compare only its phone value.
function explicitSenderPhone(value: unknown): string {
  const display = string(value).trim();
  if (!/^\+[\d\s().-]+$/.test(display)) return '';
  const canonical = display.replace(/[\s().-]/g, '');
  return e164(canonical) ? canonical : '';
}
const sendable = (m: Row) => ['drafted', 'queued', 'failed'].includes(m.status) && !m.sent_at && !m.manual_sent_at
  && !m.provider_message_id && !m.suppressed_at && !m.bounce_status
  && record(m.send_result).outcome !== 'delivery_unknown'
  && !(m.send_started_at && (!m.send_completed_at || !m.failed_at));

async function one(query: any, label: string): Promise<Row> {
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw required(label);
  return result.data;
}

// The pilot supports BODY-only text templates. Other component types cannot be
// represented faithfully by this preview, so they remain blocked, not omitted.
function bodyDefinition(components: unknown): string {
  if (!Array.isArray(components) || components.length !== 1 || components[0]?.type !== 'BODY'
      || typeof components[0]?.text !== 'string' || !components[0].text) throw required('Unsupported or missing template body.');
  const component = components[0];
  if (Object.keys(component).some(key => !['type', 'text', 'example'].includes(key))) throw required('Unsupported template body fields.');
  return component.text;
}

export function createWhatsappApprovalHandlers(deps: Dependencies) {
  async function prepare(db: any, user: Row, m: Row, actor: string) {
    if (!actor || !user.owner_email || m.owner_email !== user.owner_email || m.channel !== 'whatsapp'
      || !m.rfx_event_id || !m.vendor_id || !m.template_id || m.meta_whatsapp_group_id || deps.isQuote(m)) throw required('Only an owned individual RFx invitation is supported.');
    if (!exactRecipient(m.recipient_phone, m.normalized_recipient_phone)) throw required('Recipient requires an explicit E.164 country code.');
    const vendor = await one(db.from('vendors').select('id,whatsapp_do_not_contact,whatsapp_permission_basis')
      .eq('owner_email', user.owner_email).eq('id', m.vendor_id), 'Contact permission is missing.');
    if (vendor.whatsapp_do_not_contact || !['consent', 'contractual', 'manual'].includes(vendor.whatsapp_permission_basis)) throw required('Contact permission is missing or excluded.');
    let query = db.from('whatsapp_business_connections').select('*').eq('owner_email', user.owner_email).eq('status', 'connected');
    if (m.whatsapp_connection_id) query = query.eq('id', m.whatsapp_connection_id);
    const row = await one(query, 'A connected sender must already exist.');
    const internal = row.connection_mode === 'internal_managed';
    if (row.provider !== 'meta' || !row.updated_at || (internal && !deps.internalIdentity(user))
      || (!internal && row.connection_mode !== 'tenant_connected')) throw required('Sender is not available to this workspace.');
    const phoneNumberId = string(row.meta_phone_number_id || row.phone_number_id);
    const wabaId = string(row.meta_waba_id || row.waba_id);
    if (!phoneNumberId || !wabaId || !explicitSenderPhone(row.display_phone_number)) throw required('Sender identity is incomplete.');
    if (internal && (phoneNumberId !== deps.env.phoneNumberId || wabaId !== deps.env.wabaId
      || deps.env.provider !== 'meta' || deps.env.mode !== 'internal_managed')) throw required('Sender configuration changed.');
    const accessToken = internal ? deps.env.accessToken : await deps.decryptSecret(row.access_token_encrypted);
    const secret = internal ? deps.env.appSecret : await deps.decryptSecret(row.app_secret_encrypted);
    if (!accessToken || !secret) throw required('Sender credentials are unavailable.');
    const connection = { row, internalWorkspace: internal, accessToken, phoneNumberId, wabaId,
      businessId: row.meta_business_id || row.business_account_id || '', graphApiVersion: row.graph_api_version || deps.env.graphApiVersion };
    const mapping = await one(db.from('whatsapp_outreach_template_mappings').select('*')
      .eq('owner_email', user.owner_email).eq('whatsapp_connection_id', row.id).eq('outreach_template_id', m.template_id), 'An approved mapping must already exist.');
    if (mapping.meta_template_status !== 'APPROVED' || !mapping.meta_template_id || !mapping.updated_at
      || mapping.meta_template_name !== m.whatsapp_template_name || mapping.meta_template_language !== m.whatsapp_template_language
      || !mapping.meta_template_category) throw required('Template is not approved or differs from the draft.');
    const template = await one(db.from('outreach_templates').select('id,updated_at').eq('owner_email', user.owner_email).eq('id', m.template_id), 'Source template is unavailable.');
    if (!template.updated_at) throw required('Source template version is missing.');
    const definition = bodyDefinition(mapping.meta_template_components);
    const params = record(m.metadata).whatsapp_template_parameters;
    if (!Array.isArray(params) || params.some(p => typeof p?.value !== 'string' || !p.value.trim())) throw required('Template parameters are incomplete.');
    const indexes = [...definition.matchAll(/\{\{(\d+)\}\}/g)].map(match => Number(match[1]));
    const unique = [...new Set(indexes)].sort((a, b) => a - b);
    if (unique.length !== params.length || unique.some((index, i) => index !== i + 1)
      || /\{\{|\}\}/.test(definition.replace(/\{\{\d+\}\}/g, ''))) throw required('Template placeholders do not match the parameters.');
    const text = definition.replace(/\{\{(\d+)\}\}/g, (_, index) => params[Number(index) - 1].value);
    const payload = { messaging_product: 'whatsapp', to: m.recipient_phone, type: 'template',
      template: { name: mapping.meta_template_name, language: { code: mapping.meta_template_language },
        ...(params.length ? { components: [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: p.value })) }] } : {}) } };
    const snapshot = freezeWhatsappSnapshot({ contract: WHATSAPP_APPROVAL_CONTRACT, owner_email: user.owner_email,
      organization_id: user.organization_id || user.owner_email, actor_id: actor, message_id: m.id, message_updated_at: m.updated_at,
      context: { event: m.rfx_event_id, vendor: m.vendor_id, campaign: m.campaign_id || null, lane: m.rfx_lane_id || null, invitation: m.rfx_lane_vendor_id || null },
      draft: { recipient_phone: m.recipient_phone, normalized_phone: m.normalized_recipient_phone || null,
        subject: m.subject || null, html_body: m.html_body || null, text_body: m.text_body || null,
        whatsapp_text: m.whatsapp_text || null, whatsapp_body: m.whatsapp_body || null, metadata: record(m.metadata) },
      sender: { connection_id: row.id, updated_at: row.updated_at, mode: row.connection_mode, phone_number_id: phoneNumberId,
        waba_id: wabaId, address: row.display_phone_number, graph_api_version: connection.graphApiVersion },
      template: { mapping_id: mapping.id, updated_at: mapping.updated_at, source_id: template.id, source_updated_at: template.updated_at,
        id: mapping.meta_template_id, name: mapping.meta_template_name, language: mapping.meta_template_language,
        category: mapping.meta_template_category, body: definition },
      permission_basis: vendor.whatsapp_permission_basis, text, payload });
    return { connection, secret, snapshot };
  }

  async function review(db: any, user: Row, message: Row, actor: string) {
    if (!sendable(message)) {
      const snapshot = record(record(message.send_result).whatsapp_snapshot);
      // Read the attempt's stored content, never today's template definition.
      const historic = snapshot.contract === WHATSAPP_APPROVAL_CONTRACT && snapshot.message_id === message.id
        && snapshot.owner_email === user.owner_email && typeof snapshot.text === 'string' && snapshot.template && snapshot.sender && snapshot.payload;
      return { whatsapp_approval: null, whatsapp_approval_error: 'not_sendable', whatsapp_preview: historic ? {
        kind: 'receipt', text: snapshot.text, from: snapshot.sender.address, to: snapshot.payload.to,
        template_name: snapshot.template.name, language: snapshot.template.language, category: snapshot.template.category,
        parameters: snapshot.payload.template.components?.[0]?.parameters.map((p: Row) => p.text) || [], expires_at: null,
      } : null };
    }
    try {
      const { snapshot, secret } = await prepare(db, user, message, actor);
      const approval = await createWhatsappApproval(snapshot, secret);
      return { whatsapp_approval: approval, whatsapp_approval_error: null,
        whatsapp_preview: { kind: 'pending', text: snapshot.text, from: snapshot.sender.address, to: snapshot.payload.to,
          template_name: snapshot.template.name, language: snapshot.template.language, category: snapshot.template.category,
          parameters: snapshot.payload.template.components?.[0]?.parameters.map((p: Row) => p.text) || [], expires_at: approval.expires_at } };
    } catch {
      // Do not return credential/parser/provider error detail in a read response.
      return { whatsapp_approval: null, whatsapp_preview: null, whatsapp_approval_error: 'review_unavailable' };
    }
  }

  async function validateProvider(context: Awaited<ReturnType<typeof prepare>>) {
    const { connection: c, snapshot: s } = context;
    const phone = await deps.graph(c, `${c.phoneNumberId}?fields=id,display_phone_number`);
    // Meta may format its phone with spaces. Comparison never infers a country.
    const providerPhone = '+' + string(phone.display_phone_number).replace(/\D/g, '');
    if (phone.id !== c.phoneNumberId || providerPhone !== explicitSenderPhone(s.sender.address)) throw conflict();
    const phones = await deps.graph(c, `${c.wabaId}/phone_numbers?fields=id&limit=100`);
    if (!Array.isArray(phones.data) || !phones.data.some((p: Row) => p.id === c.phoneNumberId)) throw conflict();
    const template = await deps.graph(c, `${s.template.id}?fields=id,name,language,status,category,components`);
    if (template.id !== s.template.id || template.name !== s.template.name || template.language !== s.template.language
      || template.status !== 'APPROVED' || template.category !== s.template.category || bodyDefinition(template.components) !== s.template.body) throw conflict();
  }

  async function send(db: any, user: Row, input: Row, ids: string[], actor: string) {
    const versions = deps.expectedVersions(ids, input.expected_versions);
    const selected = await db.from('outreach_messages').select('*').eq('owner_email', user.owner_email).in('id', ids);
    if (selected.error) throw selected.error;
    // Resolve every selection before making a claim or contacting the provider.
    const prepared = [];
    for (const id of ids) {
      const m = selected.data?.find((candidate: Row) => candidate.id === id);
      if (!m) throw Object.assign(new Error('Message not found.'), { code: '404' });
      deps.requireVersion(m, versions.get(id));
      if (!sendable(m)) throw conflict();
      const context = await prepare(db, user, m, actor);
      const approval = input.expected_versions.find((entry: Row) => entry.id === id)?.whatsapp_approval;
      await requireWhatsappApproval(context.snapshot, approval, context.secret);
      prepared.push({ m, approval, context });
    }
    const rows: Row[] = [], failures: Row[] = [], skipped: Row[] = [];
    let uncertainCount = 0;
    for (const { m, approval, context } of prepared) {
      const c = context.connection;
      const receipt = { approval_contract: 'outreach-version-v1', approved_updated_at: m.updated_at,
        whatsapp_approval: approval, whatsapp_snapshot: context.snapshot };
      const claim = await deps.claim(db, user, m, { channel: 'whatsapp', provider: 'meta',
        whatsapp_connection_id: c.row.id, sender_address: c.row.display_phone_number, sender_connection_type: c.row.connection_mode,
        send_result: receipt }, m.updated_at);
      if (!claim) { skipped.push({ id: m.id, reason: 'OUTREACH_VERSION_CONFLICT: Message was changed or claimed.' }); break; }
      let accepted = false;
      try {
        // Claim returned content is authoritative; its updated_at is the claim's
        // new revision, while the signed version refers to the original draft.
        const claimed = { ...claim.row, updated_at: m.updated_at };
        const current = await prepare(db, user, claimed, actor);
        await requireWhatsappApproval(current.snapshot, approval, current.secret);
        await validateProvider(current);
        // Detect revocation/configuration edits during provider reads. From this
        // boundary forward we send only the immutable snapshot in the receipt.
        const latest = await prepare(db, user, claimed, actor);
        await requireWhatsappApproval(latest.snapshot, approval, latest.secret);
        const data = await deps.graph(latest.connection, `${latest.connection.phoneNumberId}/messages`, {
          method: 'POST', body: JSON.stringify(context.snapshot.payload) });
        accepted = true;
        const providerId = string(data?.messages?.[0]?.id);
        if (!providerId) throw new Error('Provider acceptance did not contain a message ID.');
        const now = new Date().toISOString();
        const updated = await deps.complete(db, user, m.id, claim.attemptId, {
          status: 'sent', delivery_status: 'sent', sent_at: now, send_completed_at: now, last_contacted_at: now,
          provider_message_id: providerId, provider_response_status: 'accepted', delivery_error: null,
          send_result: { ...claim.row.send_result, ...receipt, phase: 'completed', outcome: 'accepted', provider_message_id: providerId } });
        if (!updated) throw new Error('Provider accepted the message but persistence was not confirmed.');
        rows.push(updated);
        try {
          await deps.history(db, { owner_email: user.owner_email, owner_user_id: user.owner_user_id,
            whatsapp_connection_id: c.row.id, outreach_message_id: m.id, campaign_id: m.campaign_id,
            vendor_id: m.vendor_id, rfx_event_id: m.rfx_event_id, channel: 'whatsapp', direction: 'outbound', status: 'sent',
            subject: m.subject, body_preview: context.snapshot.text.slice(0, 1000), occurred_at: now,
            metadata: { provider: 'meta', provider_message_id: providerId, approval_fingerprint: approval.fingerprint,
              whatsapp_connection_id: c.row.id, sender_display_phone: c.row.display_phone_number } });
        } catch { /* Accepted receipt remains authoritative, never retry a message for a history failure. */ }
      } catch (error) {
        const uncertain = accepted || Boolean((error as { deliveryUncertain?: boolean })?.deliveryUncertain);
        if (uncertain) uncertainCount++;
        const reason = deps.operationalError(error);
        failures.push({ id: m.id, reason, delivery_unknown: uncertain });
        try { await deps.fail(db, user, claim.row, claim.attemptId, reason, uncertain, { send_result: receipt }); }
        catch { /* Keep an unfinalized claim locked. Never issue another POST. */ }
        break;
      }
    }
    return { sent: rows.length, failed: failures.length, skipped: skipped.length, delivery_unknown: uncertainCount,
      rows, failures, skipped_rows: skipped };
  }
  return { review, send };
}
