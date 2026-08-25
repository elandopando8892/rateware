import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deploymentId = "dpl_AvCeNfRhG3T5YzgehByP53h7Kcnc";
const endpoint = `/v13/deployments/${deploymentId}`;
const vercelCli = resolve(process.env.APPDATA, "npm/vercel.ps1");
const expectedCliVersion = "54.4.1";
const cliVersionOutput = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `& '${vercelCli.replaceAll("'", "''")}' '--version'`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const cliVersion = cliVersionOutput.match(/(?:Vercel CLI\s+)?(\d+\.\d+\.\d+)/)?.[1];
if (cliVersion !== expectedCliVersion) throw new Error(`Vercel CLI version mismatch: expected ${expectedCliVersion}, received ${cliVersion ?? "unknown"}`);
const raw = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `& '${vercelCli.replaceAll("'", "''")}' 'api' '${endpoint}'`], { encoding: null, stdio: ["ignore", "pipe", "pipe"] });
const parsed = JSON.parse(raw.toString("utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const privateDirectory = resolve(process.env.USERPROFILE, ".codex/evidence-private/rateware-p3v2-2026-08-25");
mkdirSync(privateDirectory, { recursive: true });
writeFileSync(resolve(privateDirectory, "vercel-deployment-raw.json"), raw);

const sanitized = {
  schema_version: 2,
  retrieved_at: new Date().toISOString(),
  source: "vercel-rest-api-v13",
  capture_tool: `vercel-cli@${cliVersion}`,
  endpoint,
  raw_response_sha256: sha256(raw),
  raw_response_controlled_location: "private-local-evidence",
  deployment: {
    id: parsed.id,
    name: parsed.name,
    target: parsed.target,
    status: parsed.status,
    ready_state: parsed.readyState,
    source: parsed.source,
    created_at_epoch_ms: parsed.createdAt,
    ready_at_epoch_ms: parsed.ready,
    deployment_url_ref: `deployment-${sha256(Buffer.from(parsed.url, "utf8")).slice(0, 16)}`,
    production_alias: parsed.alias.includes("rateware.vercel.app") ? "rateware.vercel.app" : null,
    git_source: {
      type: parsed.gitSource?.type,
      ref: parsed.gitSource?.ref,
      sha: parsed.gitSource?.sha,
    },
  },
};

const publicPath = resolve(root, "docs/release/evidence/p3v2-production-source/vercel-deployment.json");
writeFileSync(publicPath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ public_path: publicPath, public_sha256: sha256(Buffer.from(`${JSON.stringify(sanitized, null, 2)}\n`)), raw_response_sha256: sanitized.raw_response_sha256 }));
