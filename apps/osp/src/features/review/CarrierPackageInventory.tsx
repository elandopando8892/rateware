import type { ApprovalCommunicationsWorkspace } from '../../api/contracts';

const TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.ms-excel.sheet.macroEnabled.12': 'XLSM',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/tiff': 'TIFF',
});

export function CarrierPackageInventory({ workspace }: { workspace: ApprovalCommunicationsWorkspace }) {
  const attachments = workspace.outbound?.attachments ?? [];
  return <section className={`carrier-package-inventory ${attachments.length ? '' : 'empty'}`} aria-labelledby="carrier-package-title">
    <header>
      <div><p className="eyebrow">EXACT PACKAGE</p><h2 id="carrier-package-title">Files returning to the carrier</h2></div>
      <p><strong>{attachments.length}</strong> attachment{attachments.length === 1 ? '' : 's'}</p>
    </header>
    {attachments.length ? <ol>
      {attachments.map((attachment) => <li key={attachment.sha256}>
        <div><strong>{attachment.name}</strong><small>{TYPE_LABELS[attachment.contentType] ?? attachment.contentType}</small></div>
        <code title={attachment.sha256}>{attachment.sha256}</code>
      </li>)}
    </ol> : <p role="alert">No named attachment inventory is available. Freeze, authorization and send must remain blocked until the exact package is rebuilt.</p>}
  </section>;
}
