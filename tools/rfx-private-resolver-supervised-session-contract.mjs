export const SUPERVISED_SESSION_VERSION = "rateware.private-resolver.supervised-session.v1";

export class SupervisedSessionError extends Error {
  constructor(message, path) {
    super(message);
    this.name = "SupervisedSessionError";
    this.code = "SUPERVISED_SESSION_INVALID";
    this.path = path;
  }
}

const fail = (message, path) => { throw new SupervisedSessionError(message, path); };

export function normalizeSupervisedSession(input) {
  if (!input || typeof input !== "object") fail("receipt must be an object", "receipt");
  if (input.contractVersion !== SUPERVISED_SESSION_VERSION) fail("unsupported contract version", "contractVersion");
  if (input.sessionVersion !== "beta-10.5") fail("unexpected session version", "sessionVersion");
  if (input.authorization?.productionAuthorized !== false || input.authorization?.realBusinessEffectsAuthorized !== false) fail("authorization exceeds staging", "authorization");

  const window = input.sessionWindow || {};
  const startedAt = Date.parse(window.startedAt);
  const endedAt = Date.parse(window.endedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) fail("invalid session window", "sessionWindow");
  if (!Number.isInteger(window.durationSeconds) || window.durationSeconds < 1 || window.durationSeconds > 600 || window.checkpointCount !== 4) fail("session window is outside the bounded rehearsal", "sessionWindow");

  const target = input.target || {};
  if (target.branchName !== "marksman-loads-staging" || target.persistent !== true || target.withProductionData !== false) fail("staging target drift", "target");
  if (target.retainedFunction !== "rfx-private-resolver" || target.functionCount !== 1) fail("function isolation drift", "target.functionCount");

  const supervision = input.supervision || {};
  if (supervision.mode !== "FIXTURE_ONLY_TECHNICAL_REHEARSAL") fail("unsupported supervision mode", "supervision.mode");
  if (supervision.automatedEvidenceObserver !== true) fail("automated observer missing", "supervision.automatedEvidenceObserver");
  if (supervision.privateChangeTicketCreated !== false || supervision.namedHumanOperatorRecorded !== false || supervision.namedHumanObserverRecorded !== false) fail("human records must not be fabricated", "supervision");
  if (supervision.actualHumanPilotExecuted !== false) fail("human pilot was not authorized", "supervision.actualHumanPilotExecuted");

  const checkpoints = input.checkpoints || {};
  for (const name of ["preflight", "syntheticCanary", "postflight", "closeout"]) {
    if (checkpoints[name]?.status !== "PASSED") fail(`checkpoint ${name} did not pass`, `checkpoints.${name}`);
  }
  if (checkpoints.preflight.processingExpired !== 0 || checkpoints.postflight.failed24h !== 0 || checkpoints.closeout.processingCurrent !== 0) fail("health checkpoint is unsafe", "checkpoints");
  if (checkpoints.syntheticCanary.persistedReplay !== "PASSED" || checkpoints.syntheticCanary.tampering !== "BLOCKED" || checkpoints.syntheticCanary.liveExecution !== "BLOCKED") fail("canary proof is incomplete", "checkpoints.syntheticCanary");
  if (checkpoints.closeout.finalCanaryState !== "DISABLED" || checkpoints.closeout.bidRows !== 0) fail("closeout is unsafe", "checkpoints.closeout");

  const network = input.network || {};
  if (network.state !== "RESTRICTED_CURRENT_OPERATOR_HOST" || network.openIpv4Present !== false || network.openIpv6Present !== false || network.cidrRecorded !== false) fail("network evidence is unsafe", "network");
  if (input.decision?.status !== "SYNTHETIC_SESSION_PASSED_HUMAN_PILOT_BLOCKED" || input.decision?.productionReady !== false || input.decision?.productionApproved !== false) fail("decision boundary drift", "decision");
  if (!input.businessEffects || Object.values(input.businessEffects).some((value) => value !== false)) fail("business effects must remain disabled", "businessEffects");

  return structuredClone(input);
}

export function summarizeSupervisedSession(input) {
  const receipt = normalizeSupervisedSession(input);
  return {
    sessionVersion: receipt.sessionVersion,
    mode: receipt.supervision.mode,
    checkpointsPassed: 4,
    ledgerRowsAfter: receipt.checkpoints.closeout.ledgerRows,
    bidRows: receipt.checkpoints.closeout.bidRows,
    finalCanaryState: receipt.checkpoints.closeout.finalCanaryState,
    humanPilotExecuted: false,
    decision: receipt.decision.status,
    productionApproved: false,
    externalBusinessEffects: false,
  };
}
