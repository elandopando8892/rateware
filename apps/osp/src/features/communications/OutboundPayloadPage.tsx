import { useState } from 'react';
import type { ApprovalCommunicationsWorkspace } from '../../api/contracts';
import { FulfillmentMatrixPanel } from '../review/FulfillmentMatrixPanel';
import { CarrierPackageInventory } from '../review/CarrierPackageInventory';

export function OutboundPayloadPage({ workspace, conflict = false, onFreeze, onRequestSend }: { workspace: ApprovalCommunicationsWorkspace; conflict?: boolean; onFreeze(): Promise<void>; onRequestSend(): Promise<void> }) {
  const [pending, setPending] = useState<'freeze' | 'send' | null>(null);
  const [failed, setFailed] = useState(false);
  const outbound = workspace.outbound;
  if (!outbound) return <section className="workflow-page"><h1>Outbound payload</h1><p role="status">No outbound draft exists.</p></section>;
  const act = async (kind: 'freeze' | 'send', action: () => Promise<void>) => { setPending(kind); setFailed(false); try { await action(); } catch { setFailed(true); } finally { setPending(null); } };
  return <section className="workflow-page" aria-labelledby="outbound-title">
    <p className="eyebrow">CONTROL 04 · CARRIERS</p><h1 id="outbound-title">Outbound execution</h1>
    <p className="lede">Authorized mailbox: carriers@xbfreight.com. Every request is idempotent and auditable.</p>
    {outbound.kind === 'final_response' ? <FulfillmentMatrixPanel workspace={workspace} /> : null}
    {outbound.kind === 'final_response' ? <CarrierPackageInventory workspace={workspace} /> : null}
    <dl className="evidence-grid"><div><dt>Status</dt><dd>{outbound.status}</dd></div><div><dt>Payload</dt><dd><code>{outbound.payloadId}</code></dd></div><div><dt>Send outcome</dt><dd>{outbound.sendOutcome ?? 'Not requested'}</dd></div></dl>
    {conflict ? <p role="alert">The command failed safely. Current state was reloaded; review it before an explicit retry.</p> : failed ? <p role="alert">The command failed safely. Reload the current state before an explicit retry.</p> : null}
    {outbound.sendOutcome === 'manual_reconciliation_required' ? <p role="alert">Manual reconciliation required. The Gmail outcome is ambiguous; do not retry automatically. Operations must reconcile the provider state.</p> : null}
    {!failed && !conflict && outbound.status === 'frozen' ? <p role="status">Outbound payload frozen. Sales authorization is required before send.</p> : null}
    {!failed && !conflict && outbound.status === 'authorized' ? <p role="status">Outbound payload authorized. Carriers may request the controlled send.</p> : null}
    {!failed && !conflict && outbound.status === 'send_pending' ? <p role="status">Authorized send reserved. Await the provider receipt.</p> : null}
    {!failed && !conflict && outbound.status === 'sent' ? <p role="status">Outbound payload sent and receipt recorded.</p> : null}
    <div className="workflow-actions">
      {workspace.capabilities.freezeOutboundPayload ? <button type="button" disabled={pending !== null} onClick={() => void act('freeze', onFreeze)}>{pending === 'freeze' ? 'Freezing…' : 'Freeze outbound payload'}</button> : null}
      {workspace.capabilities.requestAuthorizedSend ? <button type="button" className="critical-action" disabled={pending !== null} onClick={() => void act('send', onRequestSend)}>{pending === 'send' ? 'Requesting…' : 'Request authorized send'}</button> : null}
    </div>
  </section>;
}
