import { useEffect, useMemo, useRef } from 'react';
import { Model } from 'survey-core';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.min.css';

import { canonicalToSurveyJson, type FormTemplateVersion } from './surveyjs-canonical-adapter';

export function FormRuntime({ template, initialValues = {}, showCompleteButton = true, onChange, onComplete }: {
  template: FormTemplateVersion;
  initialValues?: Record<string, unknown>;
  showCompleteButton?: boolean;
  onChange?(values: Record<string, unknown>): void;
  onComplete(values: Record<string, unknown>): void;
}) {
  if (template.status !== 'published') throw new Error('FORM_VERSION_NOT_PUBLISHED');
  const onChangeRef = useRef(onChange);
  const onCompleteRef = useRef(onComplete);
  onChangeRef.current = onChange;
  onCompleteRef.current = onComplete;
  const model = useMemo(() => {
    const instance = new Model(canonicalToSurveyJson(template));
    instance.data = structuredClone(initialValues);
    instance.textUpdateMode = 'onTyping';
    instance.showCompleteButton = showCompleteButton;
    return instance;
  }, [template, initialValues, showCompleteButton]);
  useEffect(() => {
    const complete = (sender: Model) => { onCompleteRef.current(structuredClone(sender.data as Record<string, unknown>)); };
    const change = (sender: Model) => { onChangeRef.current?.(structuredClone(sender.data as Record<string, unknown>)); };
    model.onComplete.add(complete);
    model.onValueChanged.add(change);
    return () => { model.onComplete.remove(complete); model.onValueChanged.remove(change); };
  }, [model]);
  return <Survey model={model} />;
}
