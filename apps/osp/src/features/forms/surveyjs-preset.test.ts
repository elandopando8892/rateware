import { describe, expect, it } from 'vitest';

import { SURVEYJS_ALLOWED_PROPERTIES, SURVEYJS_ALLOWED_TOOLBOX, createRestrictedSurveyCreator } from './surveyjs-preset';

describe('restricted SurveyJS preset', () => {
  it('exposes only the managed toolbox, preview, and safe property grid', () => {
    const creator = createRestrictedSurveyCreator({ approved: true, licenseKey: 'synthetic-local-license' });
    expect(creator.showJSONEditorTab).toBe(false);
    expect(creator.showLogicTab).toBe(false);
    expect(creator.showThemeTab).toBe(false);
    expect(creator.showTranslationTab).toBe(false);
    expect(creator.showPreviewTab).toBe(true);
    expect(creator.toolbox.items.map((item) => (item.json as { ospKind: string }).ospKind)).toEqual(SURVEYJS_ALLOWED_TOOLBOX.map((item) => item.json.ospKind));
    expect(SURVEYJS_ALLOWED_PROPERTIES).not.toContain('visibleIf');
    expect(SURVEYJS_ALLOWED_PROPERTIES).not.toContain('html');
  });

  it('fails closed without separately approved SurveyJS licensing evidence', () => {
    expect(() => createRestrictedSurveyCreator({ approved: false, licenseKey: '' })).toThrow(/SURVEYJS_LICENSE_REQUIRED/);
  });
});
