import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  SupervisedSessionError,
  normalizeSupervisedSession,
  summarizeSupervisedSession,
} from "../tools/rfx-private-resolver-supervised-session-contract.mjs";

const root = resolve(import.meta.dirname, "..");
const load = async () => JSON.parse(await readFile(resolve(root, "docs/rfx-private-resolver-supervised-session.json"), "utf8"));

test("normalizes the fixture-only Beta 10.5 session receipt", async () => {
  const summary = summarizeSupervisedSession(await load());
  assert.equal(summary.sessionVersion, "beta-10.5");
  assert.equal(summary.mode, "FIXTURE_ONLY_TECHNICAL_REHEARSAL");
  assert.equal(summary.checkpointsPassed, 4);
  assert.equal(summary.bidRows, 0);
  assert.equal(summary.finalCanaryState, "DISABLED");
  assert.equal(summary.humanPilotExecuted, false);
  assert.equal(summary.productionApproved, false);
  assert.equal(summary.externalBusinessEffects, false);
});

test("rejects fabricated human supervision", async () => {
  const receipt = await load();
  receipt.supervision.namedHumanObserverRecorded = true;
  assert.throws(() => normalizeSupervisedSession(receipt), SupervisedSessionError);
});

test("rejects unsafe closeout, network, or production", async () => {
  const receipt = await load();
  receipt.checkpoints.closeout.finalCanaryState = "ENABLED";
  assert.throws(() => normalizeSupervisedSession(receipt), /closeout/);
  receipt.checkpoints.closeout.finalCanaryState = "DISABLED";
  receipt.network.openIpv4Present = true;
  assert.throws(() => normalizeSupervisedSession(receipt), /network/);
  receipt.network.openIpv4Present = false;
  receipt.authorization.productionAuthorized = true;
  assert.throws(() => normalizeSupervisedSession(receipt), /authorization/);
});

test("rejects an unbounded or invalid session window", async () => {
  const receipt = await load();
  receipt.sessionWindow.durationSeconds = 900;
  assert.throws(() => normalizeSupervisedSession(receipt), /session window/);
});
