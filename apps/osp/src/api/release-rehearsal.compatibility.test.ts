import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaseFormWorkspaceResponseSchema, CorporateProfileSuccessResponseSchema } from './contracts';
import { ProfilePromotionBatchPanel } from '../features/profile/ProfilePromotionBatchPanel';

// Opt-in consumer-contract rehearsal from a successful, synthetic native DB run.
// Old schemas are loaded from their exact Git revision, not a hand-written proxy.
const run = process.env.OSP_REHEARSAL_RUN;
describe.skipIf(!run)('native PG17 responses and old/new UI contracts', () => {
  afterEach(cleanup);
  const root = run ? execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim() : '';
  let syntheticSource: string | undefined;
  let historicalSchemas: Record<string, { safeParse(value: unknown): { success: boolean } }> | undefined;
  const artifact = () => {
    if (!run || !/^osp_release_rehearsal_run_[0-9]+$/.test(run)) throw new Error('Invalid synthetic run');
    syntheticSource ??= readFileSync(`${root}/tmp/osp-s13-pg17-rehearsal/${run}.json`, 'utf8');
    const value = JSON.parse(syntheticSource);
    const manifest = JSON.parse(readFileSync(`${root}/docs/osp/releases/2026-09-08-closeout-migrations.json`, 'utf8'));
    const expected = manifest.pendingMigrations.map((item: { file: string }) => item.file);
    if (value.syntheticOnly !== true || expected.length !== 13 ||
      JSON.stringify(value.appliedMigrations) !== JSON.stringify(expected)) throw new Error('Incomplete native evidence');
    return value;
  };
  const oldSchemas = () => {
    if (historicalSchemas) return historicalSchemas;
    const source = execFileSync('git', ['show', 'ed12d1658fcef898fdadbc848d3b94b7684c601b:apps/osp/src/api/contracts.ts'], { cwd: root, encoding: 'utf8' });
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports: Record<string, { safeParse(value: unknown): { success: boolean } }> = {};
    runInNewContext(output, { exports, require: (name: string) => {
      if (name !== 'zod') throw new Error(`Unexpected historical dependency: ${name}`);
      return { z };
    } }, { timeout: 3000 });
    historicalSchemas = exports;
    return historicalSchemas;
  };
  // Load/transpile the historical fixture once, in setup. Each assertion still
  // gets a fresh native JSON value; projection tests cannot mutate later input.
  beforeAll(() => { artifact(); oldSchemas(); });

  it('current UI parses actual profile and form API/store responses before and after review/publication', () => {
    const value = artifact();
    for (const key of ['profile', 'publishedProfile']) {
      const parsed = CorporateProfileSuccessResponseSchema.safeParse(value[key]);
      expect(parsed.success, `${key}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
    for (const key of ['form', 'unboundForm', 'reviewedForm']) {
      const parsed = CaseFormWorkspaceResponseSchema.safeParse(value[key]);
      expect(parsed.success, `${key}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
    expect(value.unboundForm.data.instance).toBeNull();
    expect(value.unboundForm.data.answerMemory.unboundCount).toBe(0);
    expect(value.form.data.answerMemory.approvedForReuse).toBe(false);
  });

  it('characterizes the old strict UI: new response fields require coordinated client upgrade', () => {
    const value = artifact(), old = oldSchemas();
    expect(old.CorporateProfileSuccessResponseSchema.safeParse(value.profile).success).toBe(false);
    expect(old.CaseFormWorkspaceResponseSchema.safeParse(value.form).success).toBe(false);
  });

  it('new UI retains compatibility with the prior response shape, without inventing a batch', () => {
    // Projection removes ONLY the fields absent from the old API, preserving all
    // remaining real native response data. This is not a live old-backend smoke.
    const value = artifact(), old = oldSchemas();
    for (const entity of value.profile.data.entities) {
      for (const candidate of entity.promotion_candidates) delete candidate.batch;
    }
    delete value.form.data.answerMemory;
    delete value.form.data.answerMemoryCandidates;
    delete value.form.data.capabilities.reviewAnswerMemory;
    expect(old.CorporateProfileSuccessResponseSchema.safeParse(value.profile).success).toBe(true);
    expect(old.CaseFormWorkspaceResponseSchema.safeParse(value.form).success).toBe(true);
    const current = CorporateProfileSuccessResponseSchema.parse(value.profile);
    expect(current.data.entities[0].promotion_candidates[0].batch).toBeUndefined();
    expect(CaseFormWorkspaceResponseSchema.safeParse(value.form).success).toBe(true);
  });

  it('actual native comparison renders and requires whole-batch confirmation; old summaries cannot publish', async () => {
    const profile = CorporateProfileSuccessResponseSchema.parse(artifact().profile);
    const candidate = profile.data.entities[0].promotion_candidates[0];
    const promote = vi.fn();
    const { unmount } = render(createElement(ProfilePromotionBatchPanel, { candidate, pending: false, onPromote: promote }));
    expect(screen.getByText('https://fixture.example.test')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button'));
    expect(promote).toHaveBeenCalledExactlyOnceWith(candidate);
    unmount();
    const prior = { ...candidate }; delete prior.batch;
    render(createElement(ProfilePromotionBatchPanel, { candidate: prior, pending: false, onPromote: promote }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Falta la comparación completa');
  });
});
