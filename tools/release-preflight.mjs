import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const RELEASE_PREFLIGHT_CHECKS = Object.freeze([
  Object.freeze({ id: "action-contract", command: "npm", args: ["run", "validate:action-contract"] }),
  Object.freeze({ id: "migration-ledger", command: "npm", args: ["run", "test:migration-ledger"] }),
  Object.freeze({ id: "identity-contract", command: "npm", args: ["run", "test:identity-contract"] }),
  Object.freeze({ id: "dependency-audit", command: "npm", args: ["audit", "--audit-level=low"] }),
]);

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
    env: process.env,
    shell: process.platform === "win32",
  }).trim();
}

export function validateCandidate(candidate, head) {
  if (!/^[0-9a-f]{40}$/i.test(candidate || "")) throw new Error("candidate must be an exact 40-character Git SHA");
  if (candidate !== head) throw new Error(`candidate ${candidate} does not match checked-out HEAD ${head}`);
  return candidate;
}

export function validatePreflightResult(result) {
  if (!result || result.schema_version !== 1 || result.mode !== "release_preflight") throw new Error("invalid preflight result");
  if (!/^[0-9a-f]{40}$/i.test(result.candidate_sha || "")) throw new Error("preflight result lacks an exact candidate SHA");
  if (result.tracked_tree_clean !== true) throw new Error("tracked working tree is not clean");
  if (!Array.isArray(result.checks) || result.checks.length !== RELEASE_PREFLIGHT_CHECKS.length) throw new Error("preflight check matrix is incomplete");
  for (const expected of RELEASE_PREFLIGHT_CHECKS) {
    const observed = result.checks.find((check) => check.id === expected.id);
    if (!observed || observed.status !== "pass" || !Number.isFinite(observed.duration_ms)) throw new Error(`preflight check failed: ${expected.id}`);
  }
  if (result.verdict !== "GO") throw new Error("preflight verdict must be GO");
  return result;
}

export function runReleasePreflight({ cwd = process.cwd(), candidate } = {}) {
  const head = run("git", ["rev-parse", "HEAD"], { cwd });
  validateCandidate(candidate || head, head);
  const trackedStatus = run("git", ["status", "--porcelain", "--untracked-files=no"], { cwd });
  const result = {
    schema_version: 1,
    mode: "release_preflight",
    candidate_sha: head,
    tracked_tree_clean: trackedStatus === "",
    checks: [],
    verdict: "NO_GO",
  };
  if (!result.tracked_tree_clean) return result;

  for (const check of RELEASE_PREFLIGHT_CHECKS) {
    const started = Date.now();
    try {
      run(check.command, check.args, { cwd });
      result.checks.push({ id: check.id, status: "pass", duration_ms: Date.now() - started });
    } catch (error) {
      result.checks.push({
        id: check.id,
        status: "fail",
        duration_ms: Date.now() - started,
        detail: String(error?.stderr || error?.message || error).slice(0, 500),
      });
      return result;
    }
  }
  result.verdict = "GO";
  return validatePreflightResult(result);
}

function parseCandidate(argv) {
  const index = argv.indexOf("--candidate");
  return index >= 0 ? argv[index + 1] : undefined;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runReleasePreflight({ candidate: parseCandidate(process.argv.slice(2)) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.verdict !== "GO") process.exitCode = 1;
}
