import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIPELINE_STAGES, caseIsClear, groupTasks, nextGate, outputChain,
  pipelineCounts, pipelineStage,
} from '../src/provider-onboarding-domain.js';

test('the pipeline exposes every stage named in the onboarding brief', () => {
  const codes = PIPELINE_STAGES.map((stage) => stage.code);
  for (const code of ['received','matched','evidence_collection','field_review','ready_for_approval','package_approved','signature_pending','assembly_ready','ready_to_send','sent','waiting_provider','additional_information','activated','closed','blocked','cancelled']) {
    assert.ok(codes.includes(code), `missing pipeline stage ${code}`);
  }
  assert.equal(codes.length, new Set(codes).size);
});

test('terminal and exception states win over output progress', () => {
  assert.equal(pipelineStage({ case_status: 'cancelled', latest_message_status: 'sent' }), 'cancelled');
  assert.equal(pipelineStage({ case_status: 'blocked', latest_package_status: 'approved' }), 'blocked');
  assert.equal(pipelineStage({ case_status: 'activated', latest_assembly_status: 'assembled' }), 'activated');
  assert.equal(pipelineStage({ case_status: 'closed' }), 'closed');
});

test('delivery status outranks assembly, which outranks package', () => {
  const row = { case_status: 'evidence_collection', latest_package_status: 'approved', latest_assembly_status: 'assembled' };
  assert.equal(pipelineStage(row), 'assembly_ready');
  assert.equal(pipelineStage({ ...row, latest_message_status: 'awaiting_reply' }), 'waiting_provider');
  assert.equal(pipelineStage({ case_status: 'draft', latest_package_status: 'approved' }), 'package_approved');
});

test('a provider asking for more information is its own stage', () => {
  assert.equal(pipelineStage({ case_status: 'draft', latest_message_status: 'information_requested' }), 'additional_information');
});

test('a case with no output chain falls back to its case status', () => {
  assert.equal(pipelineStage({ case_status: 'evidence_collection' }), 'evidence_collection');
  assert.equal(pipelineStage({ case_status: 'matched' }), 'matched');
  assert.equal(pipelineStage({}), 'received');
});

test('pipeline counts retain empty stages so the rail never collapses', () => {
  const counts = pipelineCounts([
    { case_status: 'blocked' },
    { case_status: 'draft', latest_package_status: 'approved' },
    { case_status: 'draft', latest_package_status: 'approved' },
  ]);
  assert.equal(counts.blocked, 1);
  assert.equal(counts.package_approved, 2);
  assert.equal(counts.sent, 0);
  assert.equal(Object.keys(counts).length, PIPELINE_STAGES.length);
});

test('a case is clear only with no blocking and no overdue work', () => {
  assert.equal(caseIsClear({ blocking_task_count: 0, overdue_task_count: 0 }), true);
  assert.equal(caseIsClear({ blocking_task_count: 1, overdue_task_count: 0 }), false);
  assert.equal(caseIsClear({ blocking_task_count: 0, overdue_task_count: 2 }), false);
});

test('the output chain marks later gates unreachable until earlier ones clear', () => {
  const chain = outputChain({ packages: [{ package_status: 'draft', approval_count: 0, required_approval_count: 2 }] });
  assert.deepEqual(chain.map((step) => step.state), ['pending', 'unreachable', 'unreachable']);
  assert.equal(chain[0].detail, '0/2 approvals');
});

test('a fully approved package makes assembly the next reachable gate', () => {
  const chain = outputChain({ packages: [{ package_status: 'approved', approval_count: 2, required_approval_count: 2 }] });
  assert.equal(chain[0].state, 'done');
  assert.equal(chain[1].state, 'pending');
  assert.equal(chain[2].state, 'unreachable');
});

test('a revoked package is reported as revoked, not as approved progress', () => {
  const chain = outputChain({ packages: [{ package_status: 'revoked', approval_count: 2, required_approval_count: 2 }] });
  assert.equal(chain[0].state, 'revoked');
});

test('a failed assembly or delivery is surfaced rather than shown as pending', () => {
  const failedAssembly = outputChain({
    packages: [{ package_status: 'approved', approval_count: 1, required_approval_count: 1 }],
    assemblies: [{ assembly_status: 'failed' }],
  });
  assert.equal(failedAssembly[1].state, 'failed');
  const failedDelivery = outputChain({
    packages: [{ package_status: 'approved', approval_count: 1, required_approval_count: 1 }],
    assemblies: [{ assembly_status: 'assembled' }],
    messages: [{ message_status: 'failed' }],
  });
  assert.equal(failedDelivery[2].state, 'failed');
});

test('blocking work outranks every output gate as the next action', () => {
  const detail = {
    case: { blocking_task_count: 3 },
    packages: [{ package_status: 'approved', approval_count: 1, required_approval_count: 1 }],
  };
  assert.equal(nextGate(detail).code, 'tasks');
});

test('the next gate is the first pending or failed step, and null when complete', () => {
  const detail = {
    case: { blocking_task_count: 0 },
    packages: [{ package_status: 'approved', approval_count: 1, required_approval_count: 1 }],
    assemblies: [{ assembly_status: 'assembled' }],
    messages: [{ message_status: 'delivered' }],
  };
  assert.equal(nextGate(detail), null);
  assert.equal(nextGate({ ...detail, messages: [] }).code, 'delivery');
});

test('tasks are grouped with overdue taking precedence over blocking', () => {
  const now = Date.parse('2026-08-17T00:00:00Z');
  const grouped = groupTasks([
    { id: 'a', blocking: true, due_at: '2026-08-10T00:00:00Z' },
    { id: 'b', blocking: true, due_at: '2026-09-01T00:00:00Z' },
    { id: 'c', blocking: false },
  ], now);
  assert.deepEqual(grouped.overdue.map((task) => task.id), ['a']);
  assert.deepEqual(grouped.blocking.map((task) => task.id), ['b']);
  assert.deepEqual(grouped.routine.map((task) => task.id), ['c']);
});

test('malformed input degrades to empty groups rather than throwing', () => {
  const grouped = groupTasks(null);
  assert.deepEqual(grouped.overdue, []);
  assert.deepEqual(grouped.blocking, []);
  assert.deepEqual(grouped.routine, []);
  assert.deepEqual(outputChain({}).map((step) => step.state), ['unreachable', 'unreachable', 'unreachable']);
});
