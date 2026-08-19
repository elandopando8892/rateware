import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The case workflow is the link that decides whether a waived evaluation ever reaches a
// release package. It compared against the literal 'complete' in three places, so the
// waiver capability was complete at both ends and severed in the middle -- a gap only an
// end-to-end run exposed. These assertions pin the repair.
const workflow = readFileSync(
  new URL('../supabase/functions/_shared/provider-onboarding-case-workflow.ts', import.meta.url),
  'utf8',
);

test('the releasable set is named once, not re-typed at each branch', () => {
  assert.match(workflow, /const RELEASABLE_EVALUATIONS=\['complete','complete_with_waivers'\];/);
  // No branch may still test the bare literal: that is exactly how the middle was severed.
  assert.ok(!/evaluation_status==='complete'/.test(workflow), "a bare ==='complete' comparison is back");
});

test('a waived evaluation moves the case to ready_for_approval', () => {
  assert.match(workflow, /const nextStatus=RELEASABLE_EVALUATIONS\.includes\(evaluation\.data\.evaluation_status\)\s*\n?\s*\?'ready_for_approval'/);
});

test('a waived evaluation still raises the approval task', () => {
  // Without this the case reaches ready_for_approval with nobody asked to approve it.
  assert.match(workflow, /if\(RELEASABLE_EVALUATIONS\.includes\(evaluation\.data\.evaluation_status\)\)\{\s*\n\s*desired\.push\(\{/);
  assert.match(workflow, /task_type:'approve_package'/);
});

test('a waived requirement raises no collection task', () => {
  // Re-opening the task would ask the operator to undo the decision they just made.
  assert.match(workflow, /if\(result\.result_status==='waived'\) return null;/);
  const taskFor = workflow.slice(workflow.indexOf('function taskFor'), workflow.indexOf("let taskType='collect_document'"));
  assert.match(taskFor, /result_status==='satisfied'/);
  assert.match(taskFor, /result_status==='waived'/);
});

test('the approval task and the case event both carry the waiver count', () => {
  // An approver must be able to see that they are approving over gaps.
  assert.match(workflow, /evaluation_status:evaluation\.data\.evaluation_status,\s*\n\s*waived_count:evaluation\.data\.waived_count\|\|0/);
});

test('the collection task types are unchanged for genuinely unmet requirements', () => {
  for (const pair of [
    ["required_fact_missing", 'collect_fact'],
    ["unverified", 'verify_document'],
    ["expired", 'refresh_evidence'],
    ["conflict", 'resolve_conflict'],
    ["withheld", 'run_human_review'],
  ]) {
    assert.match(workflow, new RegExp(`'${pair[1]}'`), `lost task type ${pair[1]}`);
  }
});
