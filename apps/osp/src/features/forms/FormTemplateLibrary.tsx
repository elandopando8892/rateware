import { lazy, Suspense, useState } from 'react';

import type { FormTemplateCatalog } from '../../api/contracts';
import type { SurveyLicenseEvidence } from './surveyjs-preset';
import { canonicalToSurveyJson, type FormTemplateVersion } from './surveyjs-canonical-adapter';

export { XBF_STARTER_SURVEY } from './xbf-starter-survey';

const VisualFormBuilder = lazy(() => import('./VisualFormBuilder').then((module) => ({ default: module.VisualFormBuilder })));
const FormRuntime = lazy(() => import('./FormRuntime').then((module) => ({ default: module.FormRuntime })));

export type SaveCatalogDraftInput = { templateId: string; expectedVersion: number; name: string; surveyJson: unknown };
export type PublishCatalogVersionInput = { templateId: string; templateVersionId: string; expectedVersion: number };

function statusLabel(value: 'draft' | 'published') { return value === 'published' ? 'Published' : 'Draft'; }

export function FormTemplateLibrary({ catalog, licenseEvidence, busy = false, onCreateStarter, onSaveDraft, onPublish }: {
  catalog: FormTemplateCatalog;
  licenseEvidence: SurveyLicenseEvidence;
  busy?: boolean;
  onCreateStarter(): void | Promise<void>;
  onSaveDraft(input: SaveCatalogDraftInput): void | Promise<void>;
  onPublish(input: PublishCatalogVersionInput): void | Promise<void>;
}) {
  const preferred = catalog.templates.find((item) => item.latest.status === 'draft') ?? catalog.templates[0] ?? null;
  const [selectedId, setSelectedId] = useState(preferred?.templateId ?? '');
  const selected = catalog.templates.find((item) => item.templateId === selectedId) ?? preferred;
  const published = catalog.templates.filter((item) => item.latest.status === 'published').length;
  const draft = catalog.templates.length - published;

  return (
    <section className="form-library" aria-labelledby="form-library-title">
      <header className="form-library-hero">
        <div><p className="eyebrow">XBF control center</p><h1 id="form-library-title">Form template library</h1><p className="lede">Create, review, and publish the exact customer-setup forms OSP uses to complete carrier registration packages.</p></div>
        <button type="button" disabled={busy || !catalog.capabilities.saveDraft} onClick={() => void onCreateStarter()}>Create XBF starter draft</button>
      </header>
      <dl className="form-library-metrics" aria-label="Template status">
        <div><dt>Templates</dt><dd>{catalog.templates.length}</dd></div>
        <div><dt>Published</dt><dd>{published}</dd></div>
        <div><dt>Drafts</dt><dd>{draft}</dd></div>
      </dl>
      {!licenseEvidence.approved || !licenseEvidence.licenseKey ? <p className="form-license-notice" role="status"><strong>Visual editing is locked.</strong> An approved SurveyJS Creator license is required to change fields visually. Existing templates remain reviewable and publishable.</p> : null}
      {catalog.templates.length === 0 ? <section className="form-empty"><p className="eyebrow">No templates yet</p><h2>Start with the controlled XBF setup form</h2><p>The starter contains legal, fiscal, address, and banking fields. It is saved as a draft first.</p></section> : (
        <div className="form-library-layout">
          <nav className="form-template-list" aria-label="Form templates">
            {catalog.templates.map((item) => <button key={item.templateId} type="button" className={item.templateId === selected?.templateId ? 'selected' : ''} aria-pressed={item.templateId === selected?.templateId} onClick={() => setSelectedId(item.templateId)}>
              <span><strong>{item.name}</strong><small>Version {item.latest.version} · {item.latest.fields.length} fields</small></span>
              <span className={`form-status ${item.latest.status}`}>{statusLabel(item.latest.status)}</span>
            </button>)}
          </nav>
          {selected ? <article className="form-template-detail">
            <header><div><p className="eyebrow">Selected template</p><h2>{selected.name}</h2><p>Schema <code>{selected.latest.schemaSha256.slice(0, 12)}</code> · Updated {new Date(selected.updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC</p></div>{selected.latest.status === 'draft' ? <button type="button" disabled={busy || !catalog.capabilities.publish} onClick={() => void onPublish({ templateId: selected.templateId, templateVersionId: selected.latest.id, expectedVersion: selected.latest.version })}>Publish version {selected.latest.version}</button> : <span className="form-status published">Published</span>}</header>
            <ol className="form-field-list">{selected.latest.fields.map((field) => <li key={field.id}><span><strong>{field.label}</strong><small>{field.canonicalFieldId ?? 'Display-only field'}</small></span><span>{field.required ? 'Required' : 'Optional'}</span></li>)}</ol>
            {selected.latest.status === 'published' ? <section className="form-runtime-preview" aria-labelledby="form-runtime-preview-title"><h3 id="form-runtime-preview-title">Published experience preview</h3><Suspense fallback={<p role="status">Loading published form…</p>}><FormRuntime template={selected.latest as FormTemplateVersion} onComplete={() => undefined} /></Suspense></section> : null}
            {licenseEvidence.approved && licenseEvidence.licenseKey ? <Suspense fallback={<p role="status">Loading licensed visual editor…</p>}><VisualFormBuilder
              key={selected.latest.id}
              initialSurvey={canonicalToSurveyJson(selected.latest as FormTemplateVersion)}
              canonicalFieldIds={['supplier.legalName', 'supplier.address', 'fiscal.taxIdentifier', 'banking.accountNumber']}
              licenseEvidence={licenseEvidence}
              templateContext={{ templateId: selected.templateId, versionId: selected.latest.id, version: selected.latest.version }}
              onSaveDraft={(surveyJson) => onSaveDraft({ templateId: selected.templateId, expectedVersion: selected.latest.version, name: selected.name, surveyJson })}
            /></Suspense> : null}
          </article> : null}
        </div>
      )}
    </section>
  );
}
