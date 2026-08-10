import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

export const CONTRACT_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
export const SOURCE_KINDS = new Set(["edge-selector", "edge-method", "postgres-function"]);
export const EXPOSURES = new Set(["human", "external-tokenized", "public", "internal/service-role"]);
export const DECISION_STATUSES = new Set(["explicitly_allowed", "explicitly_denied", "pending_human_approval", "internal_only"]);
export const LIFECYCLES = new Set(["active", "alias", "deprecated", "unreachable", "removed"]);
export const ACCESS_KINDS = new Set(["read", "write"]);
export const SENSITIVITIES = new Set(["low", "medium", "medium-high", "high", "critical"]);
export const TENANT_RELEVANCE = new Set(["tenant-scoped", "record-derived", "platform-scoped", "mixed"]);

const SELECTOR_SPECS = [
  ["rfx-bid-api", /body\.action\s*===\s*["']([^"']+)["']/g],
  ["shipper-directory-api", /body\.action\s*===\s*["']([^"']+)["']/g],
  ["carrier-profile-api", /\baction\s*===\s*["']([^"']+)["']/g],
  ["ratebook-carrier-api", /\baction\s*===\s*["']([^"']+)["']/g],
  ["shipper-profile-api", /\baction\s*===\s*["']([^"']+)["']/g]
];

const FIXED_EDGE_OPERATIONS = [
  ["create-raw-upload", "create_raw_upload", "POST multipart /functions/v1/create-raw-upload", "human"],
  ["gmail-oauth-callback", "complete_google_oauth_callback", "GET /functions/v1/gmail-oauth-callback?code&state", "external-tokenized"],
  ["google-chat-app", "health", "GET /functions/v1/google-chat-app", "public"],
  ["google-chat-app", "handle_chat_event", "POST /functions/v1/google-chat-app provider event", "public"],
  ["interpret-upload", "interpret_upload", "POST /functions/v1/interpret-upload", "human"],
  ["sync-banxico-fx", "sync_banxico_fx", "POST /functions/v1/sync-banxico-fx x-cron-secret", "internal/service-role"],
  ["sync-rateware-catalog", "sync_rateware_catalog", "POST /functions/v1/sync-rateware-catalog", "human"],
  ["whatsapp-webhook", "verify_webhook", "GET /functions/v1/whatsapp-webhook hub challenge", "external-tokenized"],
  ["whatsapp-webhook", "ingest_webhook", "POST /functions/v1/whatsapp-webhook signed event", "external-tokenized"]
];

function slash(value) {
  return value.split(sep).join("/");
}

function text(path) {
  return readFileSync(path, "utf8");
}

function normalizedSource(value) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function fingerprint(value) {
  return createHash("sha256").update(normalizedSource(value)).digest("hex");
}

function lineNumber(value, index) {
  return value.slice(0, index).split("\n").length;
}

function matches(regex, value, minimumIndex = 0) {
  regex.lastIndex = 0;
  const output = [];
  let match;
  while ((match = regex.exec(value))) {
    if (match.index >= minimumIndex) output.push(match);
  }
  return output;
}

function functionSegment(source, handler) {
  if (!handler || handler === "inline" || handler === "Deno.serve") return null;
  const escaped = handler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startPattern = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${escaped}\\s*\\(|(?:const|let)\\s+${escaped}\\s*=`, "m");
  const start = startPattern.exec(source);
  if (!start) return null;
  const tail = source.slice(start.index + start[0].length);
  const next = /^(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$]|^(?:export\s+)?(?:const|let)\s+[A-Za-z_$][\w$]*\s*=/m.exec(tail);
  return source.slice(start.index, next ? start.index + start[0].length + next.index : source.length);
}

function dispatchHandler(segment) {
  const match = /(?:return\s+jsonResponse\(\s*)?await\s+([A-Za-z_$][\w$]*)\s*\(/.exec(segment);
  return match?.[1] || "inline";
}

function edgeSurface({ functionName, actionName, sourceFile, handler, endpoint, sourceKind, sourceSegment, exposureHint }) {
  return {
    canonicalId: `edge.${functionName}.${actionName}`,
    actionName,
    sourceKind,
    sourceFile,
    handler,
    endpoint,
    exposureHint,
    sourceFingerprint: fingerprint(sourceSegment)
  };
}

function discoverRatewareApi(repoRoot) {
  const sourceFile = "supabase/functions/rateware-api/index.ts";
  const source = text(join(repoRoot, sourceFile));
  const raw = matches(/body\.action\s*===\s*["']([^"']+)["']/g, source)
    .filter((match) => !/typeof\s+$/.test(source.slice(Math.max(0, match.index - 24), match.index)));
  const output = [];
  const seen = new Set();
  raw.forEach((match, index) => {
    const actionName = match[1];
    if (seen.has(actionName)) return;
    seen.add(actionName);
    const end = raw[index + 1]?.index ?? source.length;
    const dispatch = source.slice(match.index, end);
    const detectedHandler = dispatchHandler(dispatch);
    const declaredHandlerSource = functionSegment(source, detectedHandler);
    const handler = detectedHandler === "inline" || declaredHandlerSource ? detectedHandler : "inline";
    const handlerSource = declaredHandlerSource || dispatch;
    output.push(edgeSurface({
      functionName: "rateware-api",
      actionName,
      sourceFile,
      handler,
      endpoint: "POST /functions/v1/rateware-api body.action",
      sourceKind: "edge-selector",
      sourceSegment: handlerSource,
      exposureHint: "human"
    }));
  });

  const growthFile = "supabase/functions/rateware-api/growth.ts";
  const growthSource = text(join(repoRoot, growthFile));
  for (const match of matches(/case\s+["']([^"']+)["']\s*:\s*return\s+await\s+([A-Za-z_$][\w$]*)\s*\(/g, growthSource)) {
    const handler = match[2];
    output.push(edgeSurface({
      functionName: "rateware-api",
      actionName: match[1],
      sourceFile: growthFile,
      handler,
      endpoint: "POST /functions/v1/rateware-api body.action via growth dispatcher",
      sourceKind: "edge-selector",
      sourceSegment: functionSegment(growthSource, handler) || match[0],
      exposureHint: "human"
    }));
  }
  return output;
}

function selectorExposure(functionName, actionName) {
  if (functionName === "shipper-directory-api") return "human";
  if (functionName === "rfx-bid-api" && actionName.startsWith("public_")) return "public";
  return "external-tokenized";
}

export function discoverSelectorSurfacesFromText(functionName, sourceFile, source, regex) {
  const output = [];
  const start = source.indexOf("Deno.serve");
  const raw = matches(regex, source, start);
  const seen = new Set();
  raw.forEach((match, index) => {
    const actionName = match[1];
    if (seen.has(actionName)) return;
    seen.add(actionName);
    const end = raw.slice(index + 1).find((candidate) => !seen.has(candidate[1]))?.index ?? source.length;
    const dispatch = source.slice(match.index, end);
    const detectedHandler = dispatchHandler(dispatch);
    const declaredHandlerSource = functionSegment(source, detectedHandler);
    const handler = detectedHandler === "inline" || declaredHandlerSource ? detectedHandler : "inline";
    output.push(edgeSurface({
      functionName,
      actionName,
      sourceFile,
      handler,
      endpoint: `POST /functions/v1/${functionName} body.action`,
      sourceKind: "edge-selector",
      sourceSegment: declaredHandlerSource || dispatch,
      exposureHint: selectorExposure(functionName, actionName)
    }));
  });
  return output;
}

function discoverSelectorApis(repoRoot) {
  return SELECTOR_SPECS.flatMap(([functionName, regex]) => {
    const sourceFile = `supabase/functions/${functionName}/index.ts`;
    return discoverSelectorSurfacesFromText(functionName, sourceFile, text(join(repoRoot, sourceFile)), regex);
  });
}

function discoverFixedApis(repoRoot) {
  return FIXED_EDGE_OPERATIONS.map(([functionName, actionName, endpoint, exposureHint]) => {
    const sourceFile = `supabase/functions/${functionName}/index.ts`;
    const source = text(join(repoRoot, sourceFile));
    return edgeSurface({
      functionName,
      actionName,
      sourceFile,
      handler: "Deno.serve",
      endpoint,
      sourceKind: "edge-method",
      sourceSegment: source,
      exposureHint
    });
  });
}

function migrationFiles(directory) {
  return readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
}

function discoverPostgresFunctions(repoRoot) {
  const directory = join(repoRoot, "supabase/migrations");
  const latest = new Map();
  for (const name of migrationFiles(directory)) {
    const sourceFile = `supabase/migrations/${name}`;
    const source = text(join(directory, name));
    const found = matches(/create\s+(?:or\s+replace\s+)?function\s+((?:[A-Za-z_][\w]*\.)?[A-Za-z_][\w]*)\s*\(/gi, source);
    found.forEach((match, index) => {
      const functionName = match[1].toLowerCase();
      const end = found[index + 1]?.index ?? source.length;
      latest.set(functionName, {
        canonicalId: `rpc.${functionName}`,
        actionName: functionName,
        sourceKind: "postgres-function",
        sourceFile,
        handler: functionName,
        endpoint: "PostgreSQL function / PostgREST RPC surface",
        exposureHint: "internal/service-role",
        sourceFingerprint: fingerprint(source.slice(match.index, end))
      });
    });
  }
  return [...latest.values()];
}

export function discoverGovernableSurfaces(repoRoot) {
  const root = resolve(repoRoot);
  return [
    ...discoverRatewareApi(root),
    ...discoverSelectorApis(root),
    ...discoverFixedApis(root),
    ...discoverPostgresFunctions(root)
  ].sort((left, right) => left.canonicalId.localeCompare(right.canonicalId));
}

function issue(level, code, canonicalId, message) {
  return { level, code, canonicalId: canonicalId || "-", message };
}

function validateEntry(entry, issues) {
  const id = entry?.canonicalId || "-";
  const required = ["canonicalId", "actionName", "sourceKind", "sourceFile", "handler", "endpoint", "businessModule", "operation", "resource", "access", "exposure", "sensitivity", "tenantRelevance", "proposedPermissionKey", "functionalOwner", "decisionStatus", "lifecycle", "sourceFingerprint"];
  for (const key of required) {
    if (entry?.[key] === undefined || entry?.[key] === null || entry?.[key] === "") issues.push(issue("error", "MISSING_METADATA", id, `Missing required field ${key}.`));
  }
  if (!/^(?:edge\.[a-z0-9-]+\.[a-z0-9_]+|rpc\.[a-z0-9_]+\.[a-z0-9_]+)$/.test(entry.canonicalId || "")) issues.push(issue("error", "INVALID_CANONICAL_ID", id, "Canonical ID does not match the stable naming convention."));
  if (!/^[a-z][a-z0-9_.-]*$/.test(entry.proposedPermissionKey || "")) issues.push(issue("error", "INVALID_PERMISSION_KEY", id, "Permission key is not stable lower-case notation."));
  if (!SOURCE_KINDS.has(entry.sourceKind)) issues.push(issue("error", "INVALID_SOURCE_KIND", id, "Invalid sourceKind."));
  if (!EXPOSURES.has(entry.exposure)) issues.push(issue("error", "INVALID_EXPOSURE", id, "Invalid exposure."));
  if (!DECISION_STATUSES.has(entry.decisionStatus)) issues.push(issue("error", "INVALID_DECISION_STATUS", id, "Invalid decisionStatus."));
  if (!LIFECYCLES.has(entry.lifecycle)) issues.push(issue("error", "INVALID_LIFECYCLE", id, "Invalid lifecycle."));
  if (!ACCESS_KINDS.has(entry.access)) issues.push(issue("error", "INVALID_ACCESS", id, "Invalid access."));
  if (!SENSITIVITIES.has(entry.sensitivity)) issues.push(issue("error", "INVALID_SENSITIVITY", id, "Invalid sensitivity."));
  if (!TENANT_RELEVANCE.has(entry.tenantRelevance)) issues.push(issue("error", "INVALID_TENANT_RELEVANCE", id, "Invalid tenantRelevance."));
  if (entry.access === "write" && !entry.sensitivity) issues.push(issue("error", "WRITE_WITHOUT_SENSITIVITY", id, "Write action requires sensitivity."));
  if (entry.exposure !== "internal/service-role" && entry.decisionStatus === "internal_only") issues.push(issue("error", "HUMAN_INTERNAL_ONLY", id, "Externally reachable surface cannot be internal_only."));
  if (entry.exposure === "internal/service-role" && entry.decisionStatus !== "internal_only") issues.push(issue("error", "INTERNAL_EXPOSURE_CONTRADICTION", id, "Internal/service-role surface must be internal_only."));
  if (entry.sourceKind === "postgres-function" && entry.exposure !== "internal/service-role") issues.push(issue("error", "SERVICE_ROLE_EXPOSED", id, "PostgreSQL function is not classified internal/service-role."));
  if (entry.lifecycle === "alias" && !entry.replacementAction) issues.push(issue("error", "ALIAS_TARGET_MISSING", id, "Alias requires replacementAction."));
}

function aliasIssues(entries) {
  const issues = [];
  const byId = new Map(entries.map((entry) => [entry.canonicalId, entry]));
  for (const entry of entries.filter((candidate) => candidate.lifecycle === "alias")) {
    if (!byId.has(entry.replacementAction)) {
      issues.push(issue("error", "ALIAS_TARGET_UNKNOWN", entry.canonicalId, "Alias target is not in the contract."));
      continue;
    }
    const visited = new Set([entry.canonicalId]);
    let cursor = entry;
    while (cursor?.lifecycle === "alias") {
      if (visited.has(cursor.replacementAction)) {
        issues.push(issue("error", "ALIAS_CYCLE", entry.canonicalId, "Alias cycle detected."));
        break;
      }
      visited.add(cursor.replacementAction);
      cursor = byId.get(cursor.replacementAction);
    }
  }
  return issues;
}

function permissionIssues(entries) {
  const issues = [];
  const groups = new Map();
  for (const entry of entries) {
    const values = groups.get(entry.proposedPermissionKey) || [];
    values.push(entry);
    groups.set(entry.proposedPermissionKey, values);
  }
  for (const [key, values] of groups) {
    const signatures = new Set(values.map((entry) => [entry.resource, entry.operation, entry.access, entry.exposure, entry.tenantRelevance].join("|")));
    if (signatures.size > 1) issues.push(issue("error", "INCOMPATIBLE_PERMISSION_REUSE", values[0].canonicalId, `Permission key ${key} has incompatible metadata.`));
  }
  return issues;
}

export function validateActionContract(contract, discovered, { repoRoot } = {}) {
  const issues = [];
  if (!CONTRACT_VERSION_PATTERN.test(contract?.contractVersion || "")) issues.push(issue("error", "INVALID_CONTRACT_VERSION", "-", "contractVersion must use semver."));
  const entries = Array.isArray(contract?.surfaces) ? contract.surfaces : [];
  if (!Array.isArray(contract?.surfaces)) issues.push(issue("error", "MISSING_SURFACES", "-", "surfaces must be an array."));
  const idGroups = new Map();
  const nameGroups = new Map();
  for (const entry of entries) {
    validateEntry(entry, issues);
    const values = idGroups.get(entry.canonicalId) || [];
    values.push(entry);
    idGroups.set(entry.canonicalId, values);
    const names = nameGroups.get(entry.actionName) || [];
    names.push(entry);
    nameGroups.set(entry.actionName, names);
    if (entry.contractVersion !== contract.contractVersion) issues.push(issue("error", "ENTRY_VERSION_MISMATCH", entry.canonicalId, "Entry contractVersion differs from the contract."));
  }
  for (const [id, values] of idGroups) if (values.length > 1) issues.push(issue("error", "DUPLICATE_CANONICAL_ID", id, "Canonical ID occurs more than once."));
  for (const [name, values] of nameGroups) {
    if (values.length > 1) issues.push(issue("info", "DUPLICATE_ACTION_NAME", values[0].canonicalId, `Action name ${name} occurs on ${values.length} governed surfaces.`));
  }
  const expected = contract?.expectedCounts || {};
  const actualExpectedCounts = {
    governable: entries.length,
    edge: discovered.filter((entry) => entry.canonicalId.startsWith("edge.")).length,
    postgres: discovered.filter((entry) => entry.canonicalId.startsWith("rpc.")).length,
    ratewareApi: discovered.filter((entry) => entry.canonicalId.startsWith("edge.rateware-api.")).length
  };
  for (const key of ["governable", "edge", "postgres", "ratewareApi"]) {
    if (expected[key] !== actualExpectedCounts[key]) issues.push(issue("error", "EXPECTED_COUNT_MISMATCH", "-", `${key} expected count differs from the reproducible inventory.`));
  }
  issues.push(...aliasIssues(entries), ...permissionIssues(entries));

  const contractById = new Map(entries.map((entry) => [entry.canonicalId, entry]));
  const actualById = new Map(discovered.map((entry) => [entry.canonicalId, entry]));
  for (const actual of discovered) {
    const expected = contractById.get(actual.canonicalId);
    if (!expected) {
      issues.push(issue("error", "UNREGISTERED_SURFACE", actual.canonicalId, "Governable surface is not registered."));
      continue;
    }
    for (const key of ["sourceKind", "sourceFile", "handler", "endpoint"]) {
      if (expected[key] !== actual[key]) issues.push(issue("error", "SENSITIVE_SOURCE_CHANGE", actual.canonicalId, `${key} differs from the contract.`));
    }
    if (expected.exposure !== actual.exposureHint) issues.push(issue("error", "EXPOSURE_CHANGED", actual.canonicalId, "Observed exposure class differs from the contract."));
    if (expected.sourceFingerprint !== actual.sourceFingerprint) issues.push(issue("error", "SOURCE_FINGERPRINT_CHANGED", actual.canonicalId, "Normalized source fingerprint changed; review and refresh deliberately."));
  }
  for (const entry of entries) {
    if (actualById.has(entry.canonicalId)) {
      if (["removed", "unreachable"].includes(entry.lifecycle)) issues.push(issue("error", "DISPOSED_SURFACE_STILL_PRESENT", entry.canonicalId, "Removed/unreachable surface is still present in source."));
      continue;
    }
    if (!["removed", "unreachable"].includes(entry.lifecycle)) issues.push(issue("error", "REMOVED_WITHOUT_DISPOSITION", entry.canonicalId, "Contract surface is absent from source without removed/unreachable lifecycle."));
  }

  if (repoRoot) {
    for (const entry of entries) {
      const path = join(repoRoot, entry.sourceFile);
      if (!existsSync(path)) {
        issues.push(issue("error", "SOURCE_PATH_MISSING", entry.canonicalId, "Source path does not exist."));
        continue;
      }
      if (entry.handler !== "inline" && entry.handler !== "Deno.serve" && entry.sourceKind !== "postgres-function") {
        const source = text(path);
        if (!functionSegment(source, entry.handler)) issues.push(issue("error", "HANDLER_MISSING", entry.canonicalId, "Named handler does not exist in source."));
      }
    }
    for (const declaration of contract.nonGovernableDeclarations || []) {
      const path = join(repoRoot, declaration.sourcePath);
      if (!existsSync(path)) issues.push(issue("warning", "DECLARATION_PATH_MISSING", declaration.canonicalId, "Declaration path no longer exists."));
      if (declaration.expectedHandlerAbsent && existsSync(join(path, "index.ts"))) issues.push(issue("error", "UNREACHABLE_BECAME_REACHABLE", declaration.canonicalId, "Previously unreachable declaration now has an index.ts handler."));
      if (existsSync(path) && declaration.expectedHandlerAbsent && !existsSync(join(path, "index.ts"))) issues.push(issue("info", "NON_GOVERNABLE_DECLARATION", declaration.canonicalId, "Declaration remains unreachable and excluded from governable totals."));
    }
  }

  const sorted = issues.sort((left, right) => [left.level, left.code, left.canonicalId].join("|").localeCompare([right.level, right.code, right.canonicalId].join("|")));
  return {
    ok: !sorted.some((entry) => entry.level === "error"),
    counts: {
      contract: entries.length,
      discovered: discovered.length,
      edge: discovered.filter((entry) => entry.canonicalId.startsWith("edge.")).length,
      postgres: discovered.filter((entry) => entry.canonicalId.startsWith("rpc.")).length,
      errors: sorted.filter((entry) => entry.level === "error").length,
      warnings: sorted.filter((entry) => entry.level === "warning").length,
      info: sorted.filter((entry) => entry.level === "info").length
    },
    issues: sorted
  };
}

export function formatValidationResult(result) {
  const lines = [
    `Action contract validation: ${result.ok ? "PASS" : "FAIL"}`,
    `contract=${result.counts.contract} discovered=${result.counts.discovered} edge=${result.counts.edge} postgres=${result.counts.postgres}`,
    `errors=${result.counts.errors} warnings=${result.counts.warnings} info=${result.counts.info}`
  ];
  for (const item of result.issues) lines.push(`${item.level.toUpperCase()} ${item.code} ${item.canonicalId} ${item.message}`);
  return `${lines.join("\n")}\n`;
}

export function repoRootFrom(start) {
  let cursor = resolve(start);
  while (true) {
    if (existsSync(join(cursor, "package.json")) && existsSync(join(cursor, "supabase/functions"))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) throw new Error("Rateware repository root was not found.");
    cursor = parent;
  }
}

export function inventoryRows(contract, discovered) {
  const actual = new Map(discovered.map((entry) => [entry.canonicalId, entry]));
  return contract.surfaces.map((entry) => ({
    ...entry,
    discovered: actual.has(entry.canonicalId) ? "yes" : "no",
    fingerprintMatches: actual.get(entry.canonicalId)?.sourceFingerprint === entry.sourceFingerprint ? "yes" : "no"
  }));
}
