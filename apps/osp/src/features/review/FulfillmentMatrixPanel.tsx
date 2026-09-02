import type { ApprovalCommunicationsWorkspace } from '../../api/contracts';

const STATUS_LABEL: Readonly<Record<string, string>> = Object.freeze({
  satisfied: 'Complete', missing: 'Missing', stale: 'Expired', wrong_format: 'Wrong format',
  incomplete: 'Incomplete', signature_missing: 'Signature missing', review_required: 'Review required',
  not_attached: 'Not attached',
  not_applicable: 'Not applicable', waived: 'Waived',
});

type FulfillmentItem = NonNullable<ApprovalCommunicationsWorkspace['fulfillment']>['items'][number];

function correctionRoute(caseId: string, item: FulfillmentItem) {
  if (!item.blocking) return null;
  if (item.status === 'signature_missing') return { href: `/app/cases/${caseId}/signature`, label: 'Review signature' };
  if (item.kind === 'form') return { href: `/app/cases/${caseId}/form`, label: 'Complete form' };
  return { href: '/app/documents', label: item.status === 'stale' ? 'Renew document' : 'Review documents' };
}

export function FulfillmentMatrixPanel({ workspace }: { workspace: ApprovalCommunicationsWorkspace }) {
  const matrix = workspace.fulfillment;
  if (!matrix) {
    return <section className="fulfillment-matrix unavailable" aria-labelledby="fulfillment-title">
      <header><div><p className="eyebrow">REQUEST CONTRACT</p><h2 id="fulfillment-title">Compliance matrix unavailable</h2></div></header>
      <p role="alert">The semantic assessment is unavailable. Consequential actions remain blocked.</p>
    </section>;
  }
  return <section className={`fulfillment-matrix ${matrix.blockingCount === 0 ? 'ready' : 'blocked'}`} aria-labelledby="fulfillment-title">
    <header>
      <div><p className="eyebrow">REQUEST CONTRACT</p><h2 id="fulfillment-title">Carrier requirement coverage</h2></div>
      <p><strong>{matrix.satisfiedRequired} / {matrix.totalRequired}</strong> required items complete · <strong>{matrix.blockingCount}</strong> blockers</p>
    </header>
    <ul>
      {matrix.items.map((item) => {
        const correction = correctionRoute(workspace.caseId, item);
        return <li key={item.requirementId} className={item.blocking ? 'blocking' : 'satisfied'}>
        <div><strong>{item.label}</strong><small>{item.reason}</small>{correction ? <a className="matrix-correction" href={correction.href}>{correction.label}</a> : null}</div>
        <span aria-label={`${item.label}: ${STATUS_LABEL[item.status] ?? item.status}`}>{STATUS_LABEL[item.status] ?? item.status}</span>
      </li>})}
    </ul>
    {matrix.blockingCount > 0
      ? matrix.gates.signatureApproval
        ? <p className="semantic-stop">Ready for controlled signing; freezing, Sales authorization and send remain stopped until the final format and signature match the request.</p>
        : <p className="semantic-stop" role="alert">Semantic stop active: complete or explicitly discard every requested item before Operations, signature, Sales authorization or send.</p>
      : <p className="semantic-ready">Every required item has reviewed evidence. Technical approval controls may proceed.</p>}
  </section>;
}
