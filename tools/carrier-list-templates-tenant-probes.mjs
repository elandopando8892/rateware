import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const deno = process.env.RATEWARE_DENO_PATH || "deno";
const args = [
  "test",
  "--allow-env",
  "--allow-read",
  "--node-modules-dir=none",
  "--no-lock",
  "--filter",
  "Task 10 tenant and permission probes",
  "tests/carrier-list-templates.contract.test.ts",
];

const result = spawnSync(deno, args, {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const output = `${result.stdout || ""}${result.stderr || ""}`;
process.stdout.write(output);

const marker = "CARRIER_TEMPLATE_TENANT_PROBE_REPORT:";
const line = output.split(/\r?\n/).find((candidate) => candidate.startsWith(marker));
if (result.status !== 0 || !line) {
  process.exit(result.status || 1);
}

const report = JSON.parse(line.slice(marker.length));
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const evidenceDirectory = resolve(root, "tmp", "carrier-list-templates-evidence", timestamp);
mkdirSync(evidenceDirectory, { recursive: true });
const evidence = {
  ...report,
  generated_at: new Date().toISOString(),
  command: `deno ${args.map((arg) => /\s/.test(arg) ? JSON.stringify(arg) : arg).join(" ")}`,
  test_exit_code: result.status,
};
const reportPath = resolve(evidenceDirectory, "tenant-probes.json");
writeFileSync(reportPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(`Carrier template tenant probes passed: ${evidence.probes.length} probes`);
console.log(`Evidence: ${reportPath}`);
