import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { MARKSMAN_LOADS_PROVIDER, MarksmanLoadsBidContractError, payloadFingerprint, sanitizePrivateConnectorValue } from '../_shared/marksman-loads-bid-contract.ts';
import { normalizeFitPayload } from '../_shared/marksman-loads-fit-contract.ts';
import {
  projectOperationObservation,
  type VerifiedMarksmanLoadsReadbackRequest,
  verifyMarksmanLoadsReadbackRequest,
} from '../_shared/marksman-loads-readback-contract.ts';

const SUPABASE_URL = String(Deno.env.get('SUPABASE_URL') || '').trim().replace(/\/$/, '');
const SERVICE_KEY = String(Deno.env.get('RATEWARE_SUPABASE_SERVICE_ROLE_KEY') || '').trim();
const READ_SECRET = String(Deno.env.get('MARKSMAN_LOADS_BID_CONNECTOR_SECRET') || '').trim();
const READ_KEY_ID = String(Deno.env.get('MARKSMAN_LOADS_BID_CONNECTOR_KEY_ID') || '').trim();
const READ_ENABLED = String(Deno.env.get('MARKSMAN_LOADS_BID_READ_ENABLED') || '').trim() === 'true';

type RecordValue = Record<string, unknown>;

class ReadbackError extends Error {
  code: string;
  status: number;
  details: RecordValue;
  constructor(message: string, code = 'RATEWARE_READBACK_ERROR', status = 400, details: RecordValue = {}) {
    super(message); this.name = 'ReadbackError'; this.code = code; this.status = status; this.details = details;
  }
}

function getClient() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new ReadbackError('Rateware read connection is not configured.', 'READBACK_NOT_CONFIGURED', 503);
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

type ConnectorClient = ReturnType<typeof getClient>;

function text(value: unknown) { return String(value == null ? '' : value).trim(); }
function safeMessage(error: unknown) { return (error instanceof Error ? error.message : text(error) || 'Private evidence query failed.').slice(0, 1000); }
function response(value: RecordValue, status = 200, requestId = '') {
  const headers = new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  if (requestId) headers.set('X-Request-Id', requestId);
  return new Response(JSON.stringify(sanitizePrivateConnectorValue(value)), {status, headers});
}

async function resolveReadScope(client: ConnectorClient, verified: VerifiedMarksmanLoadsReadbackRequest) {
  const body = verified.body;
  const link = await client.from('external_organization_links')
    .select('organization_id,status,reviewed_at,reviewed_by_user_id,review_note')
    .eq('provider', MARKSMAN_LOADS_PROVIDER).eq('external_organization_id', body.organizationId).eq('status','active').maybeSingle();
  if (link.error) throw link.error;
  if (!link.data || !link.data.reviewed_at || !text(link.data.reviewed_by_user_id) || !text(link.data.review_note)) {
    throw new ReadbackError('No active reviewed organization link exists.', 'ORGANIZATION_LINK_NOT_REVIEWED', 403);
  }
  const workspaces = await client.from('workspace_registry').select('organization_id,organization_uuid')
    .eq('organization_uuid', link.data.organization_id).limit(2);
  if (workspaces.error) throw workspaces.error;
  if (!workspaces.data || workspaces.data.length !== 1) throw new ReadbackError('Organization does not resolve to exactly one workspace.', 'WORKSPACE_LINK_AMBIGUOUS', 409);
  const workspaceOrganizationId = text(workspaces.data[0].organization_id);
  const invitation = await client.from('rfx_lane_vendors').select('id,rfx_event_id,rfx_lane_id,vendor_id')
    .eq('id',body.invitationId).eq('vendor_id',body.vendorId).eq('rfx_event_id',body.eventId).eq('rfx_lane_id',body.laneId).maybeSingle();
  if (invitation.error) throw invitation.error;
  if (!invitation.data) throw new ReadbackError('The signed carrier invitation scope does not exist.', 'PRIVATE_INVITATION_NOT_FOUND', 404);
  const vendor = await client.from('vendors').select('id').eq('id',body.vendorId).eq('organization_id',workspaceOrganizationId).maybeSingle();
  if (vendor.error) throw vendor.error;
  if (!vendor.data) throw new ReadbackError('Carrier vendor is outside this workspace.', 'VENDOR_LINK_MISMATCH', 403);
  const event = await client.from('rfx_events').select('id').eq('id',body.eventId).eq('organization_id',workspaceOrganizationId).maybeSingle();
  if (event.error) throw event.error;
  if (!event.data) throw new ReadbackError('Event is outside this workspace.', 'EVENT_LINK_MISMATCH', 403);
  const lane = await client.from('rfx_lanes').select('id').eq('id',body.laneId).eq('rfx_event_id',body.eventId).maybeSingle();
  if (lane.error) throw lane.error;
  if (!lane.data) throw new ReadbackError('Lane is outside this event.', 'LANE_LINK_MISMATCH', 403);
  return { canonicalOrganizationId:text(link.data.organization_id), workspaceOrganizationId };
}

async function readReceipt(client: ConnectorClient, verified: VerifiedMarksmanLoadsReadbackRequest, scope: Awaited<ReturnType<typeof resolveReadScope>>) {
  const body = verified.body;
  let query = client.from('marksman_loads_operation_receipts')
    .select('id,provider,external_organization_id,organization_id,workspace_organization_id,vendor_id,rfx_event_id,rfx_lane_id,rfx_lane_vendor_id,effect,operation_id,payload_fingerprint,segment_key,record_id,staging_record_id,outcome,committed_at')
    .eq('provider',MARKSMAN_LOADS_PROVIDER).eq('external_organization_id',body.organizationId)
    .eq('organization_id',scope.canonicalOrganizationId).eq('workspace_organization_id',scope.workspaceOrganizationId)
    .eq('vendor_id',body.vendorId).eq('rfx_event_id',body.eventId).eq('rfx_lane_id',body.laneId)
    .eq('rfx_lane_vendor_id',body.invitationId).eq('effect',body.effect)
    .eq('operation_id',body.operationId).eq('payload_fingerprint',body.payloadFingerprint);
  query = body.effect === 'fit' ? query.eq('segment_key',body.segmentKey) : query.is('segment_key',null);
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function currentEvidenceStillMatches(client: ConnectorClient, verified: VerifiedMarksmanLoadsReadbackRequest, receipt: RecordValue | null) {
  if (!receipt) return null;
  if (verified.body.effect === 'quote') {
    const staging = await client.from('rate_staging').select('id').eq('id',receipt.staging_record_id).maybeSingle();
    if (staging.error) throw staging.error;
    return staging.data ? receipt : null;
  }
  const rows = await client.from('rfx_segment_confirmations').select('segment_key,rubric_key,answer,comment')
    .eq('rfx_lane_vendor_id',verified.body.invitationId).eq('segment_key',verified.body.segmentKey);
  if (rows.error) throw rows.error;
  try {
    const canonical = normalizeFitPayload({action:'save_segment_confirmations',confirmations:(rows.data||[]).map((row:RecordValue)=>({segment_key:row.segment_key,rubric_key:row.rubric_key,answer:row.answer,comment:row.comment}))});
    return await payloadFingerprint(canonical) === verified.body.payloadFingerprint ? receipt : null;
  } catch {
    return null;
  }
}

export function createRfxInternalBidReadHandler(dependencies: {
  getClient?: () => ConnectorClient;
  readEnabled?: boolean;
  now?: () => Date;
  sharedSecret?: string;
  keyId?: string;
} = {}) {
  const clientFactory = dependencies.getClient || getClient;
  const enabled = dependencies.readEnabled ?? READ_ENABLED;
  const now = dependencies.now || (() => new Date());
  const sharedSecret = dependencies.sharedSecret ?? READ_SECRET;
  const keyId = dependencies.keyId ?? READ_KEY_ID;
  return async function handler(request: Request) {
    let requestId = '';
    try {
      if (request.method !== 'POST') return response({error:'Method not allowed.',code:'METHOD_NOT_ALLOWED'},405);
      if (Number(request.headers.get('content-length') || 0) > 50_000) return response({error:'Request body is too large.',code:'REQUEST_TOO_LARGE'},413);
      const envelope = await request.json();
      const verified = await verifyMarksmanLoadsReadbackRequest(envelope,{sharedSecret,expectedKeyId:keyId,now:now()});
      requestId = verified.requestId;
      if (!enabled) throw new ReadbackError('Private operation readback is disabled.','READBACK_DISABLED',503);
      const client = clientFactory();
      const scope = await resolveReadScope(client,verified);
      const receipt = await readReceipt(client,verified,scope);
      const row = await currentEvidenceStillMatches(client,verified,receipt);
      const checkedAt = now().toISOString();
      return response(projectOperationObservation(verified,row,checkedAt),200,requestId);
    } catch (error) {
      if (error instanceof MarksmanLoadsBidContractError || error instanceof ReadbackError) {
        return response({error:error.message,code:error.code,details:error instanceof ReadbackError?error.details:{}},error.status,requestId);
      }
      return response({error:safeMessage(error),code:'RATEWARE_READBACK_ERROR'},500,requestId);
    }
  };
}

export const createRfxInternalBidReadApiHandler = createRfxInternalBidReadHandler;
Deno.serve(createRfxInternalBidReadHandler());
