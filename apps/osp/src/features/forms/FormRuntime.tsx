import { useEffect, useMemo } from 'react';
import { Model } from 'survey-core';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.min.css';

import { canonicalToSurveyJson, type FormTemplateVersion } from './surveyjs-canonical-adapter';

export function FormRuntime({ template, onComplete }: { template: FormTemplateVersion; onComplete(values: Record<string, unknown>): void }) {
  if (template.status !== 'published') throw new Error('FORM_VERSION_NOT_PUBLISHED');
  const model = useMemo(() => new Model(canonicalToSurveyJson(template)), [template]);
  useEffect(() => {
    const complete = (sender: Model) => { onComplete(structuredClone(sender.data as Record<string, unknown>)); };
    model.onComplete.add(complete);
    return () => { model.onComplete.remove(complete); model.dispose(); };
  }, [model, onComplete]);
  return <Survey model={model} />;
}
