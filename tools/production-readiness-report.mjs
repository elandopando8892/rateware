import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const IDS = ["P0", "P1", "P2", "P3", "P4", "P5"];
const WEIGHTS = { P0: 4, P1: 9, P2: 7, P3: 7, P4: 6, P5: 4 };
const GATES = [[10, "scope"], [25, "evidence_plan"], [55, "implementation"], [70, "automated_suite"], [85, "independent_review"], [93, "preview_smoke"], [97, "deployment"], [100, "production_smoke"], [100, "monitoring"]];
const FILE_EVIDENCE_KEYS = new Set(["scope", "evidence_plan", "implementation", "independent_review"]);
const P2_S2_CLOSURE = Object.freeze({
  implementation: "docs/release/evidence/2026-08-21-p2-s2-operate.md",
  independentReview: "docs/release/evidence/2026-08-21-p2-s2-independent-review.md",
  manifest: "docs/platform55-evidence/p2-s2/60eb7f341a09f6d65f4344b8606a9779c339712c/manifest.json",
  reviewedHead: "18955d06443d3532823da6725eda90041b15b2e8",
  visualSubject: "60eb7f341a09f6d65f4344b8606a9779c339712c",
  reviewSha256: "377f90847ce2fb9ecb7e707159c8036a9dc040edc624d6c620e70c909c48ee5c",
  automatedSuite: Object.freeze([
    "npm test PASS on exact closure head 18955d06443d3532823da6725eda90041b15b2e8",
    "npm run validate:action-contract PASS with 0 errors and 1 pre-existing warning",
    "npm audit --audit-level=low PASS with 0 vulnerabilities",
    "node tests/platform55-operate-evidence-server.test.mjs PASS with 24 of 24 actual-route captures"
  ])
});

const isInside = (root, candidate) => {
  const path = relative(root, candidate);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
};

const validateEvidence = (sprint, rootDir) => {
  for (const [key, entries] of Object.entries(sprint.evidence || {})) {
    if (!Array.isArray(entries) || entries.length === 0 || entries.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
      throw new Error(`${sprint.id} ${key} evidence must contain non-empty strings`);
    }
    for (const entry of entries) {
      const value = entry.trim();
      if (FILE_EVIDENCE_KEYS.has(key)) {
        const root = realpathSync(resolve(rootDir));
        if (isAbsolute(value)) throw new Error(`${sprint.id} ${key} evidence must be a relative path inside the evaluated checkout: ${value}`);
        const candidate = resolve(root, value);
        if (!isInside(root, candidate)) throw new Error(`${sprint.id} ${key} evidence is outside the evaluated checkout: ${value}`);
        if (!existsSync(candidate)) throw new Error(`${sprint.id} ${key} evidence file does not exist: ${value}`);
        if (!statSync(candidate).isFile()) throw new Error(`${sprint.id} ${key} evidence must be a regular file: ${value}`);
        if (!isInside(root, realpathSync(candidate))) throw new Error(`${sprint.id} ${key} evidence is outside the evaluated checkout: ${value}`);
      }
    }
  }
};

const hasEvidence = (evidence, key) => Array.isArray(evidence?.[key]) && evidence[key].length > 0;

const requireText = (text, pattern, message) => {
  if (!pattern.test(text)) throw new Error(message);
};

export function validateP2S2ReviewBody(review) {
  if (typeof review !== "string") throw new Error("P2 independent review body must be text");
  const normalized = review.replace(/\r\n/g, "\n");
  const digest = createHash("sha256").update(normalized).digest("hex");
  if (digest !== P2_S2_CLOSURE.reviewSha256) {
    throw new Error("P2 independent review body digest mismatch");
  }
  return review;
}

const validateP2S2Closure = (sprint, rootDir) => {
  if (sprint.id !== "P2" || sprint.progress < 45) return;
  const evidence = sprint.evidence || {};
  if (!P2_S2_CLOSURE.automatedSuite.every((entry) => evidence.automated_suite?.includes(entry))) {
    throw new Error("P2 automated_suite must contain the exact P2-S2 closure gates");
  }
  if (!evidence.implementation?.includes(P2_S2_CLOSURE.implementation)) {
    throw new Error("P2 implementation must contain the exact P2-S2 closure evidence");
  }
  if (!evidence.independent_review?.includes(P2_S2_CLOSURE.independentReview)) {
    throw new Error("P2 independent_review must contain the exact P2-S2 review evidence");
  }
  if (sprint.verdicts?.independent_review !== "GO") {
    throw new Error("P2 requires independent_review GO for the P2-S2 closure");
  }

  const root = realpathSync(resolve(rootDir));
  const implementation = readFileSync(resolve(root, P2_S2_CLOSURE.implementation), "utf8");
  const review = readFileSync(resolve(root, P2_S2_CLOSURE.independentReview), "utf8");
  const manifest = JSON.parse(readFileSync(resolve(root, P2_S2_CLOSURE.manifest), "utf8"));
  validateP2S2ReviewBody(review);
  if (!implementation.includes(`Final candidate SHA: \`${P2_S2_CLOSURE.visualSubject}\``)) {
    throw new Error("P2 implementation evidence must name the immutable visual subject");
  }
  if (!implementation.includes(`Evidence closure HEAD reviewed independently: \`${P2_S2_CLOSURE.reviewedHead}\``)) {
    throw new Error("P2 implementation evidence must name the reviewed closure HEAD");
  }
  requireText(implementation, /Local implementation verdict:\s*GO/i, "P2 implementation evidence must record GO");
  requireText(review, /Verdict:\s*GO/i, "P2 independent review must record GO");
  requireText(review, new RegExp(P2_S2_CLOSURE.reviewedHead), "P2 independent review must name the reviewed closure HEAD");
  requireText(review, new RegExp(P2_S2_CLOSURE.visualSubject), "P2 independent review must name the immutable visual subject");
  requireText(review, /No push, pull-request mutation, preview, deployment, promotion, Supabase change/i, "P2 independent review must preserve local-only boundaries");
  if (manifest.schema_version !== 4 || manifest.subject_sha !== P2_S2_CLOSURE.visualSubject || manifest.captures?.length !== 24) {
    throw new Error("P2 visual manifest must be schema v4 with the exact subject and 24 captures");
  }
  if (manifest.captures.some((capture) => capture.console_errors !== 0 || capture.http_errors !== 0 || capture.state_visible !== true || capture.state_intersection_ratio < 0.8)) {
    throw new Error("P2 visual manifest must prove visible states with zero console and HTTP errors");
  }
};

export function validateLedger(ledger, { rootDir = process.cwd() } = {}) {
  if (ledger?.schema_version !== 1 || ledger?.baseline !== 63) throw new Error("invalid ledger header");
  if (!Array.isArray(ledger.sprints) || ledger.sprints.map((s) => s.id).join(",") !== IDS.join(",")) throw new Error("sprints must be P0-P5");
  for (const sprint of ledger.sprints) {
    if (!Number.isInteger(sprint.weight) || sprint.weight !== WEIGHTS[sprint.id]) throw new Error(`${sprint.id} weight must be ${WEIGHTS[sprint.id]}`);
    if (!Number.isInteger(sprint.progress) || sprint.progress < 0 || sprint.progress > 100) throw new Error(`${sprint.id} progress must be an integer from 0 to 100`);
    if (sprint.progress > 0 && Object.keys(sprint.evidence || {}).length === 0) throw new Error(`${sprint.id} requires evidence`);
    validateEvidence(sprint, rootDir);
    validateP2S2Closure(sprint, rootDir);
    if (sprint.progress >= 85 && sprint.verdicts?.independent_review !== "GO") throw new Error(`${sprint.id} requires independent_review GO verdict`);
    for (const [threshold, key] of GATES) if (sprint.progress >= threshold && !hasEvidence(sprint.evidence, key)) throw new Error(`${sprint.id} requires ${key}`);
  }
  return ledger;
}

export function computeOverallProgress(ledger) {
  validateLedger(ledger);
  const earned = ledger.sprints.reduce((sum, sprint) => sum + sprint.weight * sprint.progress / 100, 0);
  const overall = ledger.baseline + earned;
  if (!Number.isFinite(overall) || overall < 0 || overall > 100) throw new Error("overall progress out of range");
  return Math.round(overall * 10) / 10;
}

export function formatProgressReport(ledger) {
  validateLedger(ledger);
  return [`General: ${computeOverallProgress(ledger)}%`, ...ledger.sprints.map((s) => `${s.id}: ${s.progress}%`)].join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2] || "docs/release/production-readiness-ledger.json";
  process.stdout.write(`${formatProgressReport(JSON.parse(readFileSync(path, "utf8")))}\n`);
}
