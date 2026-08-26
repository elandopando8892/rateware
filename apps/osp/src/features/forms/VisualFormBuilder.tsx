import { useMemo, useState } from 'react';
import { SurveyCreatorComponent } from 'survey-creator-react';
import 'survey-core/survey-core.min.css';
import 'survey-creator-core/survey-creator-core.min.css';

import { surveyJsonToCanonical, type FormTemplateVersion } from './surveyjs-canonical-adapter';
import { createRestrictedSurveyCreator, type SurveyLicenseEvidence } from './surveyjs-preset';

export function VisualFormBuilder({
  initialSurvey,
  canonicalFieldIds,
  licenseEvidence,
  templateContext,
  onSaveDraft,
}: {
  initialSurvey: unknown;
  canonicalFieldIds: readonly string[];
  licenseEvidence: SurveyLicenseEvidence;
  templateContext: { templateId: string; versionId: string; version: number };
  onSaveDraft(surveyJson: unknown, template: FormTemplateVersion): void | Promise<void>;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const creator = useMemo(() => {
    if (!licenseEvidence.approved || !licenseEvidence.licenseKey) return null;
    const model = createRestrictedSurveyCreator(licenseEvidence);
    model.JSON = initialSurvey as Record<string, unknown>;
    return model;
  }, [initialSurvey, licenseEvidence]);

  if (!creator) return <p role="alert">SurveyJS license approval required before the visual builder can run.</p>;

  const emit = async () => {
    setNotice(null);
    try {
      const template = await surveyJsonToCanonical(creator.JSON, {
        templateId: templateContext.templateId,
        versionId: templateContext.versionId,
        version: templateContext.version,
        status: 'draft',
        canonicalFieldIds,
      });
      await onSaveDraft(creator.JSON, template);
      setNotice('Draft validated and saved as a new version.');
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
          <button type="button" onClick={() => { void emit(); }}>Save as new draft</button>
        </div>
      </header>
      {notice ? <p role="status">{notice}</p> : null}
      <SurveyCreatorComponent creator={creator} />
    </section>
  );
}
