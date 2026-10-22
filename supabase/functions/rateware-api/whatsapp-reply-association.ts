type Row = Record<string, any>;
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const version = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);
/** No provider call. Role gate runs in the API before this module. */
export async function whatsappReplyAssociation(db: any, user: Row, claims: Row, body: Row) {
  const error = (status: number, message: string) => ({ status, data: { error: message } });
  if (!user.owner_email) return error(403, 'Workspace unavailable.');
  if (['owner_email','owner_user_id','actor_email','organization_id'].some(key => key in body)) return error(400, 'Identity fields are not accepted.');
  if (!uuid(body.receipt_id)) return error(400, 'Invalid reply.');
  const review = body.action === 'review_whatsapp_reply_association';
  const reviewScope = { subject: claims.sub, organization_id: user.organization_id };
  let params: Row = { p_owner: user.owner_email, p_receipt: body.receipt_id };
  if (review) {
    const offset = body.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000) return error(400, 'Invalid offset.');
    params.p_offset = offset;
  } else {
    if (body.action !== 'associate_whatsapp_reply' || body.confirm !== true || !uuid(body.message_id) || !uuid(body.operation_id)
      || !version(body.receipt_version) || !version(body.message_version)) return error(400, 'Invalid association confirmation.');
    if (!body.review_scope || body.review_scope.subject !== reviewScope.subject
      || body.review_scope.organization_id !== reviewScope.organization_id) return error(403, 'The reviewing identity changed. Review again.');
    const actor = [claims.email, claims.preferred_email, claims['https://kinde.com/email']].find(v => typeof v === 'string' && v.trim())?.trim() || '';
    if (!actor) return error(403, 'Verified actor unavailable.');
    params = { ...params, p_actor: actor, p_message: body.message_id, p_receipt_version: body.receipt_version,
      p_message_version: body.message_version, p_operation: body.operation_id };
  }
  let result;
  try { result = await db.rpc(review ? 'review_whatsapp_reply' : 'associate_whatsapp_reply', params); }
  catch { return error(503, 'Association unavailable. Read the reply before another decision.'); }
  if (result.error) {
    const statuses: Row = { PT400: 400, PT403: 403, PT404: 404, PT409: 409 };
    const status = statuses[result.error.code] || 503;
    return error(status, status === 503 ? 'Association unavailable. Read the reply before another decision.' : result.error.message);
  }
  if (result.data?.contract !== 'bidware.whatsapp-association.v1') return error(503, 'Association result unavailable. Read the reply before another decision.');
  return { status: 200, data: review ? { ...result.data, review_scope: reviewScope } : result.data };
}
