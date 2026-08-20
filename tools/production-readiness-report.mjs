import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const IDS = ["P0", "P1", "P2", "P3", "P4", "P5"];
const WEIGHTS = { P0: 4, P1: 9, P2: 7, P3: 7, P4: 6, P5: 4 };
const GATES = [[10, "scope"], [25, "evidence_plan"], [55, "implementation"], [70, "automated_suite"], [85, "independent_review"], [93, "preview_smoke"], [97, "deployment"], [100, "production_smoke"], [100, "monitoring"]];

const isFileEvidence = (value) => {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return false;
  if (/^(?:node|npm|npx|git|pnpm|yarn|deno|bun|powershell|pwsh)\s/i.test(value)) return false;
  if (isAbsolute(value) || /^\.{1,2}[\\/]/.test(value) || /^(?:docs|tests|tools|supabase|src|public|\.github|\.superpowers)[\\/]/i.test(value)) return true;
  return /[\\/].+\.[^\\/]+$/.test(value) || /\.[a-z0-9]+$/i.test(value);
};

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
      if (isFileEvidence(value)) {
        const root = realpathSync(resolve(rootDir));
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

export function validateLedger(ledger, { rootDir = process.cwd() } = {}) {
  if (ledger?.schema_version !== 1 || ledger?.baseline !== 63) throw new Error("invalid ledger header");
  if (!Array.isArray(ledger.sprints) || ledger.sprints.map((s) => s.id).join(",") !== IDS.join(",")) throw new Error("sprints must be P0-P5");
  for (const sprint of ledger.sprints) {
    if (!Number.isInteger(sprint.weight) || sprint.weight !== WEIGHTS[sprint.id]) throw new Error(`${sprint.id} weight must be ${WEIGHTS[sprint.id]}`);
    if (!Number.isInteger(sprint.progress) || sprint.progress < 0 || sprint.progress > 100) throw new Error(`${sprint.id} progress must be an integer from 0 to 100`);
    if (sprint.progress > 0 && Object.keys(sprint.evidence || {}).length === 0) throw new Error(`${sprint.id} requires evidence`);
    validateEvidence(sprint, rootDir);
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
