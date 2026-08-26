import { useMemo, useState } from 'react';
import { SurveyCreatorComponent } from 'survey-creator-react';
import 'survey-core/survey-core.min.css';
import 'survey-creator-core/survey-creator-core.min.css';

import { surveyJsonToCanonical, type FormTemplateVersion } from './surveyjs-canonical-adapter';
import { createRestrictedSurveyCreator, type SurveyLicenseEvidence } from './surveyjs-preset';

const LOCAL_TEMPLATE_ID = '11111111-1111-4111-8111-111111111111';
const LOCAL_VERSION_ID = '22222222-2222-4222-8222-222222222222';

export function VisualFormBuilder({
  initialSurvey,
  canonicalFieldIds,
  licenseEvidence,
  onSaveDraft,
  onPublish,
}: {
  initialSurvey: unknown;
  canonicalFieldIds: readonly string[];
  licenseEvidence: SurveyLicenseEvidence;
  onSaveDraft(template: FormTemplateVersion): void | Promise<void>;
  onPublish(template: FormTemplateVersion): void | Promise<void>;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const creator = useMemo(() => {
    if (!licenseEvidence.approved || !licenseEvidence.licenseKey) return null;
    const model = createRestrictedSurveyCreator(licenseEvidence);
    model.JSON = initialSurvey as Record<string, unknown>;
    return model;
  }, [initialSurvey, licenseEvidence]);

  if (!creator) return <p role="alert">SurveyJS license approval required before the visual builder can run.</p>;

  const emit = async (status: 'draft' | 'published') => {
    setNotice(null);
    try {
      const template = await surveyJsonToCanonical(creator.JSON, {
        templateId: LOCAL_TEMPLATE_ID,
        versionId: LOCAL_VERSION_ID,
        version: 1,
        status,
        canonicalFieldIds,
      });
      if (status === 'draft') await onSaveDraft(template);
      else await onPublish(template);
      setNotice(status === 'draft' ? 'Draft validated.' : 'Published version validated.');
    } catch {
      setNotice('The form contains an unsupported or unsafe setting.');
    }
  };

  return (
    <section aria-labelledby="form-builder-title">
      <header>
        <h1 id="form-builder-title">Visual form builder</h1>
        <p>Build from the restricted toolbox. Raw JSON, executable logic, uploads, and arbitrary URLs are disabled.</p>
        <div className="form-builder-actions" aria-label="Form version actions">
          <button type="button" onClick={() => { creator.activeTab = 'preview'; }}>Preview</button>
          <button type="button" onClick={() => { void emit('draft'); }}>Save draft</button>
          <button type="button" onClick={() => { void emit('published'); }}>Publish version</button>
        </div>
      </header>
      {notice ? <p role="status">{notice}</p> : null}
      <SurveyCreatorComponent creator={creator} />
    </section>
  );
}
