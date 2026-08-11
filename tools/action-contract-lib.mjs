import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

export const CONTRACT_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
export const SOURCE_KINDS = new Set(["edge-selector", "edge-method", "postgres-function"]);
export const EXPOSURES = new Set(["human", "external-tokenized", "public", "internal/service-role"]);
export const DECISION_STATUSES = new Set(["explicitly_allowed", "explicitly_denied", "pending_human_approval", "internal_only"]);
export const LIFECYCLES = new Set(["active", "alias", "deprecated", "unreachable", "removed"]);
export const ACCESS_KINDS = new Set(["read", "write"]);
export const SENSITIVITIES = new Set(["low", "medium", "medium-high", "high", "critical"]);
export const TENANT_RELEVANCE = new Set(["tenant-scoped", "record-derived", "platform-scoped", "mixed"]);
export const ANALYSIS_COVERAGE = new Set(["direct", "shared-observed", "dependency-undetermined", "dynamic"]);

const FIXED_EDGE_OPERATIONS = new Map([
  ["create-raw-upload", [["create_raw_upload", "POST multipart /functions/v1/create-raw-upload", "human"]]],
  ["gmail-oauth-callback", [["complete_google_oauth_callback", "GET /functions/v1/gmail-oauth-callback?code&state", "external-tokenized"]]],
  ["google-chat-app", [["health", "GET /functions/v1/google-chat-app", "public"], ["handle_chat_event", "POST /functions/v1/google-chat-app provider event", "public"]]],
  ["interpret-upload", [["interpret_upload", "POST /functions/v1/interpret-upload", "human"]]],
  ["sync-banxico-fx", [["sync_banxico_fx", "POST /functions/v1/sync-banxico-fx x-cron-secret", "internal/service-role"]]],
  ["sync-rateware-catalog", [["sync_rateware_catalog", "POST /functions/v1/sync-rateware-catalog", "human"]]],
  ["whatsapp-webhook", [["verify_webhook", "GET /functions/v1/whatsapp-webhook hub challenge", "external-tokenized"], ["ingest_webhook", "POST /functions/v1/whatsapp-webhook signed event", "external-tokenized"]]]
]);

const METADATA_FIELDS = [
  "actionName", "sourceKind", "sourceFile", "handler", "endpoint", "businessModule", "operation", "resource",
  "access", "exposure", "sensitivity", "tenantRelevance", "proposedPermissionKey", "functionalOwner",
  "decisionStatus", "lifecycle", "replacementAction", "analysisCoverage", "coverageSignals", "rpcSignature"
];

function slash(value) { return value.split(sep).join("/"); }
function text(path) { return readFileSync(path, "utf8"); }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }

// Format/comment-insensitive lexical tokens. This is intentionally not a semantic parser.
export function semanticTokens(value, { sql = false } = {}) {
  const out = [];
  let i = 0;
  while (i < value.length) {
    const c = value[i];
    const n = value[i + 1];
    if (/\s/.test(c)) { i += 1; continue; }
    if ((c === "/" && n === "/") || (sql && c === "-" && n === "-")) {
      const end = value.indexOf("\n", i + 2);
      if (end < 0) break;
      i = end + 1;
      continue;
    }
    if (c === "/" && n === "*") {
      const end = value.indexOf("*/", i + 2);
      i = end < 0 ? value.length : end + 2;
      continue;
    }
    if (c === "'" || c === "\"" || c === "`") {
      const quote = c;
      let token = c;
      i += 1;
      while (i < value.length) {
        const current = value[i];
        token += current;
        i += 1;
        if (current === "\\" && i < value.length) { token += value[i]; i += 1; continue; }
        if (current === quote) {
          if (value[i] === quote && quote !== "`") { token += value[i]; i += 1; continue; }
          break;
        }
      }
      out.push("s:" + token + ";");
      continue;
    }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let token = c;
      i += 1;
      while (i < value.length && /[A-Za-z0-9_$]/.test(value[i])) { token += value[i]; i += 1; }
      out.push("w:" + token + ";");
      continue;
    }
    out.push("p:" + c + ";");
    i += 1;
  }
  return out.join("");
}

export function fingerprint(value, options) { return hash(semanticTokens(value, options)); }
export function metadataFingerprint(entry) {
  return hash(JSON.stringify(METADATA_FIELDS.map((field) => [field, entry?.[field] ?? null])));
}

function allMatches(regex, value, minimumIndex = 0) {
  regex.lastIndex = 0;
  const out = [];
  let match;
  while ((match = regex.exec(value))) {
    if (match.index >= minimumIndex) out.push(match);
    if (!match[0]) regex.lastIndex += 1;
  }
  return out;
}

function closingDelimiter(source, start, open, close) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (c === "\\") { i += 1; continue; }
      if (c === quote) {
        if (source[i + 1] === quote && quote !== "`") { i += 1; continue; }
        quote = null;
      }
      continue;
    }
    if (c === "'" || c === "\"" || c === "`") { quote = c; continue; }
    if (source.startsWith("//", i) || source.startsWith("--", i)) {
      const end = source.indexOf("\n", i + 2);
      if (end < 0) return source.length - 1;
      i = end;
      continue;
    }
    if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      if (end < 0) return source.length - 1;
      i = end + 1;
      continue;
    }
    if (c === open) depth += 1;
    if (c === close && --depth === 0) return i;
  }
  return -1;
}

function functionSegment(source, handler) {
  if (!handler || ["inline", "undetermined", "Deno.serve"].includes(handler)) return null;
  const escaped = handler.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp("(?:export\\s+)?(?:async\\s+)?function\\s+" + escaped + "\\s*\\(|(?:const|let)\\s+" + escaped + "\\s*=", "m");
  const start = regex.exec(source);
  if (!start) return null;
  const brace = source.indexOf("{", start.index + start[0].length);
  const end = brace >= 0 ? closingDelimiter(source, brace, "{", "}") : -1;
  return source.slice(start.index, end >= 0 ? end + 1 : source.length);
}

function importedBinding(source, localName) {
  for (const match of allMatches(/import\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["']/g, source)) {
    for (const item of match[1].split(",")) {
      const binding = /^\s*([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(item);
      if (binding && (binding[2] || binding[1]) === localName) return { importedName: binding[1], specifier: match[2] };
    }
  }
  for (const match of allMatches(/import\s+([A-Za-z_$][\w$]*)\s+from\s*["']([^"']+)["']/g, source)) {
    if (match[1] === localName) return { importedName: "default", specifier: match[2] };
  }
  return null;
}

function exportedHandlerSegment(envelope, sourceFile, exportName, seen = new Set()) {
  const key = sourceFile + "#" + exportName;
  if (seen.has(key)) return { status: "ambiguous", reason: "handler-reexport-cycle" };
  seen.add(key);
  const source = envelope?.moduleSources?.get(sourceFile);
  if (!source) return { status: "missing", reason: "handler-module-unavailable" };
  if (exportName === "default") {
    const match = /export\s+default\s+(?:async\s+)?function\s*([A-Za-z_$][\w$]*)?\s*\(/.exec(source);
    if (match) {
      const segment = match[1] ? functionSegment(source, match[1]) : source.slice(match.index);
      return { status: "resolved", segment: segment || source.slice(match.index), exportedName: "default" };
    }
  }
  const direct = functionSegment(source, exportName);
  if (direct && new RegExp("export\\s+(?:(?:async|const|let|function)\\s+)*" + exportName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(direct)) {
    return { status: "resolved", segment: direct, exportedName: exportName };
  }
  for (const match of allMatches(/export\s*\{([\s\S]*?)\}(?:\s*from\s*["']([^"']+)["'])?/g, source)) {
    for (const item of match[1].split(",")) {
      const binding = /^\s*([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(item);
      if (!binding || (binding[2] || binding[1]) !== exportName) continue;
      if (!match[2]) {
        const local = functionSegment(source, binding[1]);
        return local ? { status: "resolved", segment: local, exportedName: exportName } : { status: "missing", reason: "local-reexport-target-missing" };
      }
      const link = envelope.resolvedImports?.find((entry) => entry.sourceFile === sourceFile && entry.specifier === match[2]);
      if (!link) return { status: "missing", reason: "reexport-target-unresolved" };
      return exportedHandlerSegment(envelope, link.targetFile, binding[1], seen);
    }
  }
  if (/export\s*\*\s*from\s*["']/.test(source)) return { status: "ambiguous", reason: "star-reexport-not-determinable" };
  return { status: "missing", reason: "exported-handler-not-found" };
}

function resolveImportedHandler(source, sourceFile, handler, envelope) {
  const binding = importedBinding(source, handler);
  if (!binding) return null;
  const link = envelope?.resolvedImports?.find((entry) => entry.sourceFile === sourceFile && entry.specifier === binding.specifier);
  if (!link) return { status: "missing", reason: "handler-import-target-unresolved" };
  return exportedHandlerSegment(envelope, link.targetFile, binding.importedName);
}

function handlerAnalysis(dispatch, source, handlerHint = null, options = {}) {
  const ignored = new Set(["jsonResponse", "Response", "cleanText", "String", "Number", "Boolean", "Object", "Array", "Date", "Set", "Map"]);
  const returnedMatch = /return\s+(?:jsonResponse\s*\(\s*)?(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(/.exec(dispatch);
  const returned = returnedMatch?.[1] || null;
  const assignedReturn = /const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+([A-Za-z_$][\w$]*)\s*\([\s\S]*?return\s+jsonResponse\s*\(\s*\1\s*\)/.exec(dispatch)?.[2] || null;
  let callbackWrapper = null;
  if (returnedMatch) {
    const open = returnedMatch.index + returnedMatch[0].lastIndexOf("(");
    const close = closingDelimiter(dispatch, open, "(", ")");
    const argumentsText = close >= 0 ? dispatch.slice(open + 1, close) : dispatch.slice(open + 1);
    if (/=>|\bfunction\b/.test(argumentsText)) callbackWrapper = returned;
  }
  if (callbackWrapper && !ignored.has(callbackWrapper)) {
    return { handler: "undetermined", handlerStatus: "undetermined", sourceSegment: dispatch, handlerResolution: "callback-wrapper-terminal-undetermined" };
  }
  const explicit = handlerHint || assignedReturn || (returned && !ignored.has(returned) ? returned : null);
  if (explicit) {
    const segment = functionSegment(source, explicit);
    if (segment) return { handler: explicit, handlerStatus: "named-existing", sourceSegment: segment };
    const imported = resolveImportedHandler(source, options.sourceFile, explicit, options.envelope);
    if (imported?.status === "resolved") return { handler: explicit, handlerStatus: "named-existing", sourceSegment: imported.segment, handlerResolution: "imported-static" };
    if (imported?.status === "ambiguous") return { handler: explicit, handlerStatus: "undetermined", sourceSegment: dispatch, handlerResolution: imported.reason };
    return { handler: explicit, handlerStatus: "named-missing", sourceSegment: dispatch };
  }
  const plausible = [];
  for (const match of allMatches(/\bawait\s+([A-Za-z_$][\w$]*)\s*\(/g, dispatch)) {
    const segment = functionSegment(source, match[1]);
    const imported = segment ? null : resolveImportedHandler(source, options.sourceFile, match[1], options.envelope);
    if (segment || imported?.status === "resolved") plausible.push({ handler: match[1], sourceSegment: segment || imported.segment });
    else if (imported?.status === "ambiguous") return { handler: "undetermined", handlerStatus: "undetermined", sourceSegment: dispatch, handlerResolution: imported.reason };
  }
  if (plausible.length === 1 && !/\.(?:from|insert|update|upsert|delete)\s*\(/.test(dispatch)) {
    return { ...plausible[0], handlerStatus: "named-existing", handlerResolution: "single-plausible-call" };
  }
  if (/\.(?:from|insert|update|upsert|delete)\s*\(|jsonResponse\s*\(|new\s+Response\s*\(/.test(dispatch)) {
    return { handler: "inline", handlerStatus: "inline-real", sourceSegment: dispatch };
  }
  if (plausible.length > 1) return { handler: "undetermined", handlerStatus: "undetermined", sourceSegment: dispatch, handlerResolution: "multiple-plausible-operations" };
  return { handler: "undetermined", handlerStatus: "undetermined", sourceSegment: dispatch };
}

function dispatchSegment(source, item, fallbackEnd) {
  if (item.discoveryKind === "literal-comparison") {
    const ifStart = source.lastIndexOf("if", item.index);
    if (ifStart >= 0 && item.index - ifStart < 96) {
      const open = source.indexOf("(", ifStart);
      const close = open >= 0 ? closingDelimiter(source, open, "(", ")") : -1;
      let branchStart = close + 1;
      while (branchStart > 0 && branchStart < source.length && /\s/.test(source[branchStart])) branchStart += 1;
      const brace = close >= 0 && source[branchStart] === "{" ? branchStart : -1;
      const end = brace >= 0 ? closingDelimiter(source, brace, "{", "}") : -1;
      if (end >= 0 && item.index < close) return source.slice(ifStart, end + 1);
    }
  }
  return source.slice(item.index, fallbackEnd);
}

function localCandidate(path) {
  const options = extname(path) ? [path] : [path, path + ".ts", path + ".mjs", path + ".js", join(path, "index.ts")];
  return options.find((item) => existsSync(item) && statSync(item).isFile()) || null;
}

function importReferences(source) {
  const staticReferences = [];
  const dynamicReferences = [];
  for (const match of allMatches(/(?:from\s*)["']([^"']+)["']/g, source)) {
    staticReferences.push({ specifier: match[1], kind: "static" });
  }
  for (const match of allMatches(/\bimport\s*["']([^"']+)["']/g, source)) {
    staticReferences.push({ specifier: match[1], kind: "static-side-effect" });
  }
  for (const match of allMatches(/\bimport\s*\(/g, source)) {
    const open = source.indexOf("(", match.index);
    const close = closingDelimiter(source, open, "(", ")");
    if (close < 0) {
      dynamicReferences.push({ expression: source.slice(open + 1), reason: "unterminated-dynamic-import" });
      continue;
    }
    const expression = source.slice(open + 1, close).trim();
    const literal = /^(?:["']([^"']+)["']|`([^`${}]*)`)$/.exec(expression);
    if (literal) staticReferences.push({ specifier: literal[1] ?? literal[2], kind: "dynamic-literal" });
    else dynamicReferences.push({ expression: semanticTokens(expression), reason: "nonliteral-dynamic-import" });
  }
  return { staticReferences, dynamicReferences };
}

function dependencyEnvelope(repoRoot, initialFiles, overrides = new Map()) {
  const root = resolve(repoRoot);
  const queue = [...initialFiles];
  const visited = new Set();
  const unresolved = [];
  const dynamicDependencies = [];
  const externalDependencies = [];
  const resolvedImports = [];
  const moduleSources = new Map();
  const parts = [];
  while (queue.length) {
    const sourceFile = slash(queue.shift());
    if (visited.has(sourceFile)) continue;
    visited.add(sourceFile);
    const absolute = join(root, sourceFile);
    const source = overrides.get(sourceFile) ?? (existsSync(absolute) ? text(absolute) : null);
    if (source === null) { unresolved.push(sourceFile); continue; }
    moduleSources.set(sourceFile, source);
    parts.push(sourceFile + "\n" + semanticTokens(source));
    const references = importReferences(source);
    for (const item of references.dynamicReferences) dynamicDependencies.push({ sourceFile, ...item });
    for (const reference of references.staticReferences) {
      if (!reference.specifier.startsWith(".")) {
        if (/^(?:@|~|#)\//.test(reference.specifier)) {
          unresolved.push(sourceFile + "::" + reference.specifier);
          continue;
        }
        externalDependencies.push({ sourceFile, specifier: reference.specifier, kind: reference.kind });
        continue;
      }
      const requested = resolve(dirname(absolute), reference.specifier);
      const found = localCandidate(requested);
      if (!found) { unresolved.push(slash(relative(root, requested))); continue; }
      const relativeFile = slash(relative(root, found));
      resolvedImports.push({ sourceFile, specifier: reference.specifier, targetFile: relativeFile, kind: reference.kind });
      if (!relativeFile.startsWith("../") && !visited.has(relativeFile)) queue.push(relativeFile);
    }
  }
  const files = [...visited].sort();
  const coverageSignals = [files.length > 1 ? "shared_dependency_observed" : "direct"];
  if (externalDependencies.length) coverageSignals.push("external_dependency");
  if (unresolved.length) coverageSignals.push("unresolved_local_dependency", "coverage_not_determinable");
  if (dynamicDependencies.length) coverageSignals.push("dynamic_dependency", "coverage_not_determinable");
  return {
    authorizationFingerprint: hash(parts.sort().join("\n--dependency--\n")),
    dependencyFiles: files,
    unresolvedDependencies: [...new Set(unresolved)].sort(),
    dynamicDependencies,
    externalDependencies,
    coverageSignals: [...new Set(coverageSignals)],
    analysisCoverage: unresolved.length || dynamicDependencies.length ? "dependency-undetermined" : files.length > 1 ? "shared-observed" : "direct",
    resolvedImports,
    moduleSources
  };
}

function selectorExposure(functionName, actionName) {
  if (functionName === "shipper-directory-api" || functionName === "rateware-api") return "human";
  if (functionName === "rfx-bid-api" && actionName.startsWith("public_")) return "public";
  return "external-tokenized";
}

function edgeSurface(functionName, actionName, sourceFile, handlerInfo, endpoint, sourceKind, envelope, discoveryKind) {
  return {
    canonicalId: "edge." + functionName + "." + actionName,
    actionName, sourceKind, sourceFile,
    handler: handlerInfo.handler,
    handlerStatus: handlerInfo.handlerStatus,
    endpoint,
    exposureHint: selectorExposure(functionName, actionName),
    sourceFingerprint: fingerprint(handlerInfo.sourceSegment),
    authorizationFingerprint: envelope.authorizationFingerprint,
    dependencyFiles: envelope.dependencyFiles,
    unresolvedDependencies: envelope.unresolvedDependencies,
    dynamicDependencies: envelope.dynamicDependencies || [],
    externalDependencies: envelope.externalDependencies || [],
    coverageSignals: envelope.coverageSignals || [envelope.analysisCoverage === "shared-observed" ? "shared_dependency_observed" : "direct"],
    analysisCoverage: envelope.analysisCoverage,
    discoveryKind,
    handlerResolution: handlerInfo.handlerResolution || null
  };
}

function actionAliases(source, minimum, trustedAliases = []) {
  const aliases = new Set(["body.action", ...trustedAliases]);
  const body = source.slice(minimum);
  const actionSource = 'body(?:\\.action|\\s*\\[\\s*["\']action["\']\\s*\\])';
  const directAlias = new RegExp("\\bconst\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*" + actionSource + "\\s*(?:;|\\n)", "g");
  const sanitizedAlias = new RegExp("\\bconst\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:cleanText|text)\\s*\\(\\s*" + actionSource + "(?:\\s*,\\s*[^;\\r\\n)]*)?\\s*\\)\\s*(?:;|\\n)", "g");
  for (const match of allMatches(directAlias, body)) aliases.add(match[1]);
  for (const match of allMatches(sanitizedAlias, body)) aliases.add(match[1]);
  return aliases;
}

function actionExpressionPattern(aliases) {
  return [...aliases].map((item) => item === "body.action"
    ? '\\bbody(?:\\.action|\\s*\\[\\s*["\']action["\']\\s*\\])(?![\\w$])'
    : "\\b" + item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").join("|");
}

function equalityActions(source, minimum, aliases = actionAliases(source, minimum)) {
  const out = [];
  const expression = actionExpressionPattern(aliases);
  for (const regex of [new RegExp("(?:" + expression + ")\\s*={2,3}\\s*(?:[\"']([^\"']+)[\"']|`([^`$]*)`)", "g"), new RegExp("(?:[\"']([^\"']+)[\"']|`([^`$]*)`)\\s*={2,3}\\s*(?:" + expression + ")", "g")]) {
    for (const match of allMatches(regex, source, minimum)) {
      if (!/typeof\s+$/.test(source.slice(Math.max(0, match.index - 24), match.index))) {
        out.push({ actionName: match[1] || match[2], index: match.index, discoveryKind: match[2] ? "static-template-comparison" : "literal-comparison", handlerHint: null });
      }
    }
  }
  return out;
}

function switchActions(source, minimum, aliases = actionAliases(source, minimum)) {
  const out = [];
  const candidates = [];
  const actionExpression = new RegExp(actionExpressionPattern(aliases));
  for (const match of allMatches(/switch\s*\(/g, source, minimum)) {
    const open = source.indexOf("(", match.index);
    const close = closingDelimiter(source, open, "(", ")");
    const expression = source.slice(open + 1, close);
    if (close < 0 || !actionExpression.test(expression)) continue;
    const start = source.indexOf("{", close);
    if (start < 0) continue;
    const end = closingDelimiter(source, start, "{", "}");
    if (end < 0) continue;
    const block = source.slice(start + 1, end);
    for (const item of allMatches(/case\s+(?:["']([^"']+)["']|`([^`$]*)`)\s*:/g, block)) {
      const tail = block.slice(item.index + item[0].length);
      const hint = /(?:return\s+)?(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(/.exec(tail)?.[1] || null;
      out.push({ actionName: item[1] || item[2], index: start + 1 + item.index, discoveryKind: "switch-case", handlerHint: hint });
    }
    if (/case\s+`[^`]*\$\{/.test(block)) candidates.push({ code: "DYNAMIC_TEMPLATE_ACTION", detail: "dynamic-switch-case" });
  }
  out.candidates = candidates;
  return out;
}

function mapActions(source, minimum, aliases = actionAliases(source, minimum)) {
  const out = [];
  const registries = new Map();
  const expression = actionExpressionPattern(aliases);
  for (const match of allMatches(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\{/g, source, 0)) {
    const start = source.indexOf("{", match.index);
    const end = closingDelimiter(source, start, "{", "}");
    if (end < 0) continue;
    const escaped = match[1].replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
    const usage = source.slice(Math.max(end + 1, minimum));
    if (!new RegExp(escaped + "\\s*(?:\\[\\s*(?:" + expression + ")\\s*\\]|\\.get\\(\\s*(?:" + expression + "))").test(usage)) continue;
    const block = source.slice(start + 1, end);
    const recognized = [];
    for (const item of allMatches(/(?:["']([^"']+)["']|`([^`$]*)`|([A-Za-z_$][\w$]*)|\[\s*(?:["']([^"']+)["']|`([^`$]*)`)\s*\])\s*:\s*([A-Za-z_$][\w$]*)/g, block)) {
      out.push({ actionName: item[1] || item[2] || item[3] || item[4] || item[5], index: start + 1 + item.index, discoveryKind: "handler-object-map", handlerHint: item[6], registryName: match[1] });
      recognized.push([item.index, item.index + item[0].length]);
    }
    const remainder = [...block].map((char, index) => recognized.some(([a, b]) => index >= a && index < b) ? " " : char).join("").replace(/[\s,;]+/g, "");
    registries.set(match[1], { kind: "object", deterministic: remainder === "", remainder: semanticTokens(remainder) });
  }
  for (const match of allMatches(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Map\s*\(\s*\[/g, source, 0)) {
    const start = source.indexOf("[", match.index);
    const end = closingDelimiter(source, start, "[", "]");
    if (end < 0) continue;
    const escaped = match[1].replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(escaped + "\\.get\\(\\s*(?:" + expression + ")").test(source.slice(Math.max(end + 1, minimum)))) continue;
    const block = source.slice(start + 1, end);
    const recognized = [];
    for (const item of allMatches(/\[\s*(?:["']([^"']+)["']|`([^`$]*)`)\s*,\s*([A-Za-z_$][\w$]*)\s*\]/g, block)) {
      out.push({ actionName: item[1] || item[2], index: start + 1 + item.index, discoveryKind: "handler-map", handlerHint: item[3], registryName: match[1] });
      recognized.push([item.index, item.index + item[0].length]);
    }
    const remainder = [...block].map((char, index) => recognized.some(([a, b]) => index >= a && index < b) ? " " : char).join("").replace(/[\s,;]+/g, "");
    registries.set(match[1], { kind: "map", deterministic: remainder === "", remainder: semanticTokens(remainder) });
  }
  out.registries = registries;
  return out;
}

function dispatchAnalysis(source, minimum = 0, trustedAliases = []) {
  const aliases = actionAliases(source, minimum, trustedAliases);
  const maps = mapActions(source, minimum, aliases);
  const switches = switchActions(source, minimum, aliases);
  const combined = [...equalityActions(source, minimum, aliases), ...switches, ...maps]
    .sort((a, b) => a.index - b.index || a.actionName.localeCompare(b.actionName));
  const candidates = [...(switches.candidates || [])];
  const actionGroups = new Map();
  for (const item of combined) actionGroups.set(item.actionName, [...(actionGroups.get(item.actionName) || []), item]);
  for (const [actionName, group] of actionGroups) {
    const registryHandlers = new Set(group.filter((item) => item.registryName).map((item) => item.handlerHint).filter(Boolean));
    if (registryHandlers.size > 1) candidates.push({ code: "AMBIGUOUS_ACTION_ATTRIBUTION", detail: actionName + ":conflicting-registry-handlers" });
  }
  const seen = new Set();
  const items = combined.filter((item) => seen.has(item.actionName) ? false : (seen.add(item.actionName), true));
  const body = source.slice(minimum);
  const expression = actionExpressionPattern(aliases);
  for (const match of allMatches(new RegExp("([A-Za-z_$][\\w$]*)\\s*(?:\\[\\s*(?:" + expression + ")\\s*\\]|\\.get\\s*\\(\\s*(?:" + expression + ")\\s*\\))", "g"), body)) {
    const registry = maps.registries.get(match[1]);
    if (!registry) candidates.push({ code: "UNRESOLVED_DISPATCH_REGISTRY", detail: match[1] });
    else if (!registry.deterministic) candidates.push({ code: "NONDETERMINISTIC_DISPATCH_REGISTRY", detail: match[1] + ":" + registry.remainder });
    const tail = body.slice(match.index + match[0].length, match.index + match[0].length + 24);
    if (/^\s*(?:\|\||\?\?)/.test(tail)) candidates.push({ code: "AMBIGUOUS_DISPATCH_FALLBACK", detail: match[1] });
  }
  if (new RegExp("(?:" + expression + ")\\s*={2,3}\\s*`[^`]*\\$\\{").test(body) || new RegExp("`[^`]*\\$\\{[^`]*`\\s*={2,3}\\s*(?:" + expression + ")").test(body)) {
    candidates.push({ code: "DYNAMIC_TEMPLATE_ACTION", detail: "template-literal-action" });
  }
  if (/\b(?:let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:cleanText\s*\(\s*)?body(?:\.action|\s*\[\s*["']action["']\s*\])/.test(body)) candidates.push({ code: "MUTABLE_ACTION_ALIAS", detail: "mutable-alias" });
  if ((body.match(/\bDeno\.serve\s*\(/g) || []).length > 1) candidates.push({ code: "MULTIPLE_EDGE_DISPATCHERS", detail: "multiple-Deno.serve" });
  if (/\baction\b/.test(body) && items.length === 0) candidates.push({ code: "DISPATCH_NOT_DETERMINED", detail: "no-positive-surface-extraction" });
  return { items, candidates };
}

export function discoverSelectorSurfacesFromText(functionName, sourceFile, source, _legacyRegex, options = {}) {
  const minimum = Math.max(0, source.indexOf("Deno.serve"));
  const dispatch = dispatchAnalysis(source, minimum);
  const found = dispatch.items;
  const envelope = options.envelope || { authorizationFingerprint: fingerprint(source), dependencyFiles: [sourceFile], unresolvedDependencies: [], analysisCoverage: "direct" };
  const surfaces = found.map((item, index) => {
    const segment = dispatchSegment(source, item, found[index + 1]?.index ?? source.length);
    return edgeSurface(functionName, item.actionName, sourceFile, handlerAnalysis(segment, source, item.handlerHint, { sourceFile, envelope }), "POST /functions/v1/" + functionName + " body.action", "edge-selector", envelope, item.discoveryKind);
  });
  surfaces.dispatchCandidates = dispatch.candidates;
  surfaces.dynamicDispatch = dispatch.candidates.length > 0;
  return surfaces;
}

export function discoverRatewareApiFromText(source, growthSource, options = {}) {
  const mainFile = "supabase/functions/rateware-api/index.ts";
  const growthFile = "supabase/functions/rateware-api/growth.ts";
  const envelope = options.envelope || { authorizationFingerprint: fingerprint(source + "\n" + growthSource), dependencyFiles: [mainFile, growthFile], unresolvedDependencies: [], analysisCoverage: "shared-observed" };
  const main = discoverSelectorSurfacesFromText("rateware-api", mainFile, source, null, { envelope });
  const growthAnalysis = dispatchAnalysis(growthSource, 0, ["action"]);
  const growthMatches = growthAnalysis.items.filter((item) => item.discoveryKind === "switch-case");
  const growth = growthMatches.map((item, index) => {
    const dispatch = growthSource.slice(item.index, growthMatches[index + 1]?.index ?? growthSource.length);
    return edgeSurface("rateware-api", item.actionName, growthFile, handlerAnalysis(dispatch, growthSource, item.handlerHint, { sourceFile: growthFile, envelope }), "POST /functions/v1/rateware-api body.action via growth dispatcher", "edge-selector", envelope, item.discoveryKind);
  });
  growth.dispatchCandidates = growthAnalysis.candidates;
  growth.dynamicDispatch = growthAnalysis.candidates.length > 0;
  const seen = new Set();
  const surfaces = [...main, ...growth].filter((item) => {
    if (seen.has(item.canonicalId)) return false;
    seen.add(item.canonicalId);
    if (item.sourceFile === growthFile) item.endpoint = "POST /functions/v1/rateware-api body.action via growth dispatcher";
    return true;
  });
  surfaces.dispatchCandidates = [...(main.dispatchCandidates || []), ...(growth.dispatchCandidates || [])];
  surfaces.dynamicDispatch = surfaces.dispatchCandidates.length > 0;
  return surfaces;
}

function discoverFixedApis(repoRoot, functionName, sourceFile, source) {
  const envelope = dependencyEnvelope(repoRoot, [sourceFile]);
  return (FIXED_EDGE_OPERATIONS.get(functionName) || []).map(([actionName, endpoint, exposureHint]) => {
    const info = { handler: "Deno.serve", handlerStatus: "named-existing", sourceSegment: source };
    const surface = edgeSurface(functionName, actionName, sourceFile, info, endpoint, "edge-method", envelope, "fixed-http-method");
    surface.exposureHint = exposureHint;
    return surface;
  });
}

function unquoteIdentifier(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) return "\"" + trimmed.slice(1, -1).replace(/""/g, "\"") + "\"";
  return trimmed.toLowerCase();
}

function qualifiedName(value) {
  const parts = value.split(/\s*\.\s*/).map(unquoteIdentifier);
  return parts.length === 1 ? { schema: "public", name: parts[0] } : { schema: parts.at(-2), name: parts.at(-1) };
}

function splitArguments(value) {
  const out = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let i = 0; i < value.length; i += 1) {
    const c = value[i];
    if (quote) {
      if (c === quote) {
        if (value[i + 1] === quote) { i += 1; continue; }
        quote = null;
      } else if (c === "\\") i += 1;
      continue;
    }
    if (c === "'" || c === "\"") quote = c;
    else if (c === "(" || c === "[") depth += 1;
    else if (c === ")" || c === "]") depth -= 1;
    else if (c === "," && depth === 0) { out.push(value.slice(start, i)); start = i + 1; }
  }
  if (value.slice(start).trim()) out.push(value.slice(start));
  return out;
}

const TYPE_START = /^(?:smallint|integer|int|bigint|decimal|numeric|real|double|money|character|varchar|text|bytea|timestamp|date|time|interval|boolean|bool|enum|point|line|json|jsonb|uuid|xml|inet|cidr|macaddr|bit|varbit|record|void|any|pg_catalog\.|public\.|auth\.|storage\.|\")/i;

function argumentType(argument) {
  let value = argument.trim().replace(/\s+(?:default\s+|=)[\s\S]*$/i, "").trim();
  const mode = /^(inout|in\s+out|in|out|variadic)\s+/i.exec(value);
  if (mode) {
    if (/^out$/i.test(mode[1])) return null;
    value = value.slice(mode[0].length).trim();
  }
  const tokens = value.match(/"(?:[^"]|"")*"|[^\s]+/g) || [];
  if (tokens.length > 1 && !TYPE_START.test(tokens[0])) tokens.shift();
  return semanticTokens(tokens.join(" "), { sql: true }).replace(/[wps]:|;/g, "").toLowerCase();
}

function canonicalSignature(argumentsText) {
  return splitArguments(argumentsText).map(argumentType).filter((item) => item !== null && item !== "").join(",");
}

function sqlStatements(source) {
  const statements = [];
  let start = 0;
  let quote = null;
  let dollarTag = null;
  let lineComment = false;
  let blockDepth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const n = source[i + 1];
    if (lineComment) { if (c === "\n") lineComment = false; continue; }
    if (blockDepth) {
      if (c === "/" && n === "*") { blockDepth += 1; i += 1; }
      else if (c === "*" && n === "/") { blockDepth -= 1; i += 1; }
      continue;
    }
    if (dollarTag) {
      if (source.startsWith(dollarTag, i)) { i += dollarTag.length - 1; dollarTag = null; }
      continue;
    }
    if (quote) {
      if (c === quote) {
        if (source[i + 1] === quote) i += 1;
        else quote = null;
      } else if (c === "\\") i += 1;
      continue;
    }
    if (c === "-" && n === "-") { lineComment = true; i += 1; continue; }
    if (c === "/" && n === "*") { blockDepth = 1; i += 1; continue; }
    if (c === "'" || c === "\"") { quote = c; continue; }
    if (c === "$") {
      const tag = /^\$[A-Za-z_0-9]*\$/.exec(source.slice(i))?.[0];
      if (tag) { dollarTag = tag; i += tag.length - 1; continue; }
    }
    if (c === ";") {
      statements.push({ source: source.slice(start, i + 1), index: start, end: i + 1 });
      start = i + 1;
    }
  }
  if (source.slice(start).trim()) statements.push({ source: source.slice(start), index: start, end: source.length });
  return statements;
}

function stripLeadingSqlTrivia(value) {
  let index = 0;
  while (index < value.length) {
    while (index < value.length && /\s/.test(value[index])) index += 1;
    if (value.startsWith("--", index)) {
      const end = value.indexOf("\n", index + 2);
      index = end < 0 ? value.length : end + 1;
      continue;
    }
    if (value.startsWith("/*", index)) {
      let depth = 1;
      index += 2;
      while (index < value.length && depth > 0) {
        if (value.startsWith("/*", index)) { depth += 1; index += 2; continue; }
        if (value.startsWith("*/", index)) { depth -= 1; index += 2; continue; }
        index += 1;
      }
      continue;
    }
    break;
  }
  return value.slice(index).trim();
}

const SQL_QUALIFIED_NAME = '((?:"(?:[^"]|"")+"|[A-Za-z_][\\w$]*)(?:\\s*\\.\\s*(?:"(?:[^"]|"")+"|[A-Za-z_][\\w$]*))?)';

function ddlEvents(source) {
  const events = [];
  const candidates = [];
  for (const statement of sqlStatements(source)) {
    const sql = stripLeadingSqlTrivia(statement.source).replace(/;\s*$/, "").trim();
    if (!/^(?:create\s+(?:or\s+replace\s+)?function|drop\s+function)\b/i.test(sql)) continue;
    const create = new RegExp("^create\\s+(?:or\\s+replace\\s+)?function\\s+" + SQL_QUALIFIED_NAME + "\\s*\\(", "i").exec(sql);
    if (create) {
      const open = sql.indexOf("(", create.index + create[0].length - 1);
      const close = closingDelimiter(sql, open, "(", ")");
      if (close < 0) { candidates.push({ code: "RPC_DDL_NOT_DETERMINED", detail: "create-signature-unclosed", index: statement.index }); continue; }
      events.push({ kind: "create", ...qualifiedName(create[1]), signature: canonicalSignature(sql.slice(open + 1, close)), index: statement.index, end: statement.end, segment: statement.source });
      continue;
    }
    const drop = /^drop\s+function(?:\s+if\s+exists)?\s+([\s\S]+?)(?:\s+(cascade|restrict))?$/i.exec(sql);
    if (!drop) { candidates.push({ code: "RPC_DDL_NOT_DETERMINED", detail: "drop-header-unrecognized", index: statement.index }); continue; }
    const targets = splitArguments(drop[1]);
    if (!targets.length) { candidates.push({ code: "RPC_DDL_NOT_DETERMINED", detail: "drop-target-missing", index: statement.index }); continue; }
    for (const rawTarget of targets) {
      const target = rawTarget.trim();
      const match = new RegExp("^" + SQL_QUALIFIED_NAME + "(?:\\s*\\(([\\s\\S]*)\\))?$", "i").exec(target);
      if (!match) { candidates.push({ code: "RPC_DDL_NOT_DETERMINED", detail: "drop-target-unrecognized", index: statement.index }); continue; }
      events.push({ kind: "drop", ...qualifiedName(match[1]), signature: match[2] === undefined ? null : canonicalSignature(match[2]), index: statement.index, end: statement.end, segment: statement.source });
    }
  }
  events.candidates = candidates;
  return events;
}

export function discoverPostgresFunctionsFromSources(sources) {
  const active = new Map();
  const candidates = [];
  for (const { sourceFile, source } of [...sources].sort((a, b) => a.sourceFile.localeCompare(b.sourceFile))) {
    const events = ddlEvents(source);
    for (const candidate of events.candidates || []) candidates.push({ ...candidate, sourceFile, canonicalId: "rpc.__ddl_candidate__." + sourceFile + ":" + candidate.index, message: "RPC DDL could not be classified safely." });
    events.forEach((event, eventIndex) => {
      const prefix = event.schema + "." + event.name + "(";
      if (event.kind === "drop" && event.signature === null) {
        const matches = [...active.keys()].filter((identity) => identity.startsWith(prefix));
        if (matches.length === 1) active.delete(matches[0]);
        else if (matches.length > 1) candidates.push({ code: "AMBIGUOUS_RPC_DROP", sourceFile, canonicalId: "rpc." + event.schema + "." + event.name + "(?)", message: "DROP FUNCTION without signature matches multiple active overloads." });
        return;
      }
      const identity = prefix + event.signature + ")";
      if (event.kind === "drop") { active.delete(identity); return; }
      const segment = source.slice(event.index, events[eventIndex + 1]?.index ?? source.length);
      active.set(identity, {
        canonicalId: "rpc." + identity,
        actionName: event.schema + "." + event.name,
        sourceKind: "postgres-function",
        sourceFile,
        handler: identity,
        handlerStatus: "named-existing",
        endpoint: "PostgreSQL function / PostgREST RPC surface " + identity,
        exposureHint: "internal/service-role",
        sourceFingerprint: fingerprint(segment, { sql: true }),
        authorizationFingerprint: fingerprint(segment, { sql: true }),
        dependencyFiles: [sourceFile],
        unresolvedDependencies: [],
        dynamicDependencies: [],
        externalDependencies: [],
        coverageSignals: ["direct"],
        analysisCoverage: "direct",
        discoveryKind: "postgres-ddl",
        rpcSignature: event.signature
      });
    });
  }
  const surfaces = [...active.values()].sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
  surfaces.ddlCandidates = candidates;
  return surfaces;
}

function migrationSources(repoRoot) {
  const directory = join(repoRoot, "supabase/migrations");
  return readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()
    .map((name) => ({ sourceFile: "supabase/migrations/" + name, source: text(join(directory, name)) }));
}

export function discoverGovernableInventory(repoRoot) {
  const root = resolve(repoRoot);
  const functionsDirectory = join(root, "supabase/functions");
  const surfaces = [];
  const candidates = [];
  const declarations = [];
  for (const functionName of readdirSync(functionsDirectory).sort()) {
    const directory = join(functionsDirectory, functionName);
    if (!statSync(directory).isDirectory() || functionName === "_shared") continue;
    const sourceFile = "supabase/functions/" + functionName + "/index.ts";
    const path = join(root, sourceFile);
    if (!existsSync(path)) {
      declarations.push({ canonicalId: "declaration.edge." + functionName, sourcePath: "supabase/functions/" + functionName, expectedHandlerAbsent: true });
      continue;
    }
    const source = text(path);
    if (FIXED_EDGE_OPERATIONS.has(functionName)) {
      surfaces.push(...discoverFixedApis(root, functionName, sourceFile, source));
      continue;
    }
    if (functionName === "rateware-api") {
      const growthFile = "supabase/functions/rateware-api/growth.ts";
      const growth = text(join(root, growthFile));
      const found = discoverRatewareApiFromText(source, growth, { envelope: dependencyEnvelope(root, [sourceFile, growthFile]) });
      surfaces.push(...found);
      for (const candidate of found.dispatchCandidates || []) candidates.push({ ...candidate, functionName, sourceFile });
      continue;
    }
    const found = discoverSelectorSurfacesFromText(functionName, sourceFile, source, null, { envelope: dependencyEnvelope(root, [sourceFile]) });
    surfaces.push(...found);
    if (found.dispatchCandidates?.length) {
      for (const candidate of found.dispatchCandidates) candidates.push({ ...candidate, functionName, sourceFile });
    } else if (found.length === 0) candidates.push({ code: "UNREGISTERED_EDGE_ENTRYPOINT", functionName, sourceFile });
  }
  const postgres = discoverPostgresFunctionsFromSources(migrationSources(root));
  surfaces.push(...postgres);
  candidates.push(...(postgres.ddlCandidates || []));
  surfaces.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
  return { surfaces, candidates, declarations };
}

export function discoverGovernableSurfaces(repoRoot) {
  const inventory = discoverGovernableInventory(repoRoot);
  inventory.surfaces.discoveryCandidates = inventory.candidates;
  inventory.surfaces.discoveredDeclarations = inventory.declarations;
  return inventory.surfaces;
}

function issue(level, code, canonicalId, message) {
  return { level, code, canonicalId: canonicalId || "-", message };
}

function validateEntry(entry, issues) {
  const id = entry?.canonicalId || "-";
  const required = [
    "canonicalId", "actionName", "sourceKind", "sourceFile", "handler", "endpoint", "businessModule", "operation",
    "resource", "access", "exposure", "sensitivity", "tenantRelevance", "proposedPermissionKey", "functionalOwner",
    "decisionStatus", "lifecycle", "sourceFingerprint", "analysisCoverage"
  ];
  for (const key of required) {
    if (entry?.[key] === undefined || entry?.[key] === null || entry?.[key] === "") issues.push(issue("error", "MISSING_METADATA", id, "Missing required field " + key + "."));
  }
  const edgeId = /^edge\.[a-z0-9-]+\.[a-z0-9_]+$/;
  const rpcId = /^rpc\.(?:"[^"]+"|[a-z_][a-z0-9_$]*)\.(?:"[^"]+"|[a-z_][a-z0-9_$]*)\([^)]*\)$/;
  if (!(edgeId.test(entry.canonicalId || "") || rpcId.test(entry.canonicalId || ""))) issues.push(issue("error", "INVALID_CANONICAL_ID", id, "Canonical ID does not match the stable naming convention."));
  if (!/^[a-z][a-z0-9_.-]*$/.test(entry.proposedPermissionKey || "")) issues.push(issue("error", "INVALID_PERMISSION_KEY", id, "Permission key is not stable lower-case notation."));
  if (!/^[0-9a-f]{64}$/.test(entry.sourceFingerprint || "")) issues.push(issue("error", "INVALID_SOURCE_FINGERPRINT", id, "sourceFingerprint must be lower-case SHA-256."));
  if (!SOURCE_KINDS.has(entry.sourceKind)) issues.push(issue("error", "INVALID_SOURCE_KIND", id, "Invalid sourceKind."));
  if (!EXPOSURES.has(entry.exposure)) issues.push(issue("error", "INVALID_EXPOSURE", id, "Invalid exposure."));
  if (!DECISION_STATUSES.has(entry.decisionStatus)) issues.push(issue("error", "INVALID_DECISION_STATUS", id, "Invalid decisionStatus."));
  if (!LIFECYCLES.has(entry.lifecycle)) issues.push(issue("error", "INVALID_LIFECYCLE", id, "Invalid lifecycle."));
  if (!ACCESS_KINDS.has(entry.access)) issues.push(issue("error", "INVALID_ACCESS", id, "Invalid access."));
  if (!SENSITIVITIES.has(entry.sensitivity)) issues.push(issue("error", "INVALID_SENSITIVITY", id, "Invalid sensitivity."));
  if (!TENANT_RELEVANCE.has(entry.tenantRelevance)) issues.push(issue("error", "INVALID_TENANT_RELEVANCE", id, "Invalid tenantRelevance."));
  if (!ANALYSIS_COVERAGE.has(entry.analysisCoverage)) issues.push(issue("error", "INVALID_ANALYSIS_COVERAGE", id, "Invalid analysisCoverage."));
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
    if (signatures.size > 1) issues.push(issue("error", "INCOMPATIBLE_PERMISSION_REUSE", values[0].canonicalId, "Permission key " + key + " has incompatible metadata."));
  }
  return issues;
}

function renameIssues(entries, discovered) {
  const issues = [];
  const actualIds = new Set(discovered.map((item) => item.canonicalId));
  const contractIds = new Set(entries.map((item) => item.canonicalId));
  const removed = entries.filter((item) => !actualIds.has(item.canonicalId) && item.lifecycle === "active");
  const added = discovered.filter((item) => !contractIds.has(item.canonicalId));
  for (const oldEntry of removed) {
    const candidate = added.find((item) => item.sourceFile === oldEntry.sourceFile && (item.handler === oldEntry.handler || item.sourceFingerprint === oldEntry.sourceFingerprint));
    if (candidate) issues.push(issue("error", "RENAME_REQUIRES_DISPOSITION", candidate.canonicalId, "Possible rename from " + oldEntry.canonicalId + " requires alias/deprecation disposition."));
  }
  return issues;
}

export function validateActionContract(contract, discovered, { repoRoot } = {}) {
  const issues = [];
  if (!CONTRACT_VERSION_PATTERN.test(contract?.contractVersion || "")) issues.push(issue("error", "INVALID_CONTRACT_VERSION", "-", "contractVersion must use semver."));
  const entries = Array.isArray(contract?.surfaces) ? contract.surfaces : [];
  if (!Array.isArray(contract?.surfaces)) issues.push(issue("error", "MISSING_SURFACES", "-", "surfaces must be an array."));
  const reviewedMetadata = contract?.reviewedMetadataFingerprints || {};
  const reviewedAuthorization = contract?.reviewedAuthorizationFingerprints || {};
  const idGroups = new Map();
  const nameGroups = new Map();
  for (const entry of entries) {
    validateEntry(entry, issues);
    const ids = idGroups.get(entry.canonicalId) || [];
    ids.push(entry);
    idGroups.set(entry.canonicalId, ids);
    const names = nameGroups.get(entry.actionName) || [];
    names.push(entry);
    nameGroups.set(entry.actionName, names);
    if (entry.contractVersion !== contract.contractVersion) issues.push(issue("error", "ENTRY_VERSION_MISMATCH", entry.canonicalId, "Entry contractVersion differs from the contract."));
    if (!reviewedMetadata[entry.canonicalId]) issues.push(issue("error", "METADATA_REVIEW_MISSING", entry.canonicalId, "Sensitive metadata has no reviewed fingerprint."));
    else if (reviewedMetadata[entry.canonicalId] !== metadataFingerprint(entry)) issues.push(issue("error", "SENSITIVE_METADATA_CHANGED", entry.canonicalId, "Sensitive metadata changed without reviewed fingerprint refresh."));
    if (!reviewedAuthorization[entry.canonicalId]) issues.push(issue("error", "AUTHORIZATION_FINGERPRINT_MISSING", entry.canonicalId, "Authorization dependency envelope has no reviewed fingerprint."));
  }
  for (const [id, values] of idGroups) if (values.length > 1) issues.push(issue("error", "DUPLICATE_CANONICAL_ID", id, "Canonical ID occurs more than once."));
  for (const [name, values] of nameGroups) if (values.length > 1) issues.push(issue("info", "DUPLICATE_ACTION_NAME", values[0].canonicalId, "Action name " + name + " occurs on " + values.length + " governed surfaces."));
  for (const candidate of discovered.discoveryCandidates || []) {
    issues.push(issue("error", candidate.code, candidate.canonicalId || ("edge." + candidate.functionName + ".__candidate__"), candidate.message || "Entrypoint, dispatch, dependency, or DDL requires explicit review and registration."));
  }
  const expected = contract?.expectedCounts || {};
  const actualCounts = {
    governable: discovered.length,
    edge: discovered.filter((entry) => entry.canonicalId.startsWith("edge.")).length,
    postgres: discovered.filter((entry) => entry.canonicalId.startsWith("rpc.")).length,
    ratewareApi: discovered.filter((entry) => entry.canonicalId.startsWith("edge.rateware-api.")).length
  };
  for (const key of ["governable", "edge", "postgres", "ratewareApi"]) {
    if (expected[key] !== actualCounts[key]) issues.push(issue("error", "EXPECTED_COUNT_MISMATCH", "-", key + " expected count differs from the reproducible inventory."));
  }
  issues.push(...aliasIssues(entries), ...permissionIssues(entries), ...renameIssues(entries, discovered));

  const contractById = new Map(entries.map((entry) => [entry.canonicalId, entry]));
  const actualById = new Map(discovered.map((entry) => [entry.canonicalId, entry]));
  for (const actual of discovered) {
    const expectedEntry = contractById.get(actual.canonicalId);
    if (!expectedEntry) { issues.push(issue("error", "UNREGISTERED_SURFACE", actual.canonicalId, "Governable surface is not registered.")); continue; }
    if (actual.handlerStatus === "named-missing") issues.push(issue("error", "HANDLER_MISSING", actual.canonicalId, "Named handler referenced by dispatch does not exist."));
    if (actual.handlerStatus === "undetermined") issues.push(issue("error", "HANDLER_UNDETERMINED", actual.canonicalId, "Handler structure is not statically determinable."));
    if (actual.analysisCoverage === "dependency-undetermined" || actual.unresolvedDependencies?.length || actual.dynamicDependencies?.length || actual.coverageSignals?.includes("coverage_not_determinable")) {
      issues.push(issue("error", "AUTHORIZATION_DEPENDENCY_UNDETERMINED", actual.canonicalId, "Authorization-relevant local dependency could not be resolved."));
    }
    for (const key of ["actionName", "sourceKind", "sourceFile", "handler", "endpoint", "analysisCoverage"]) {
      if (expectedEntry[key] !== actual[key]) issues.push(issue("error", "SENSITIVE_SOURCE_CHANGE", actual.canonicalId, key + " differs from the contract."));
    }
    if (JSON.stringify(expectedEntry.coverageSignals || []) !== JSON.stringify(actual.coverageSignals || [])) issues.push(issue("error", "DEPENDENCY_COVERAGE_CHANGED", actual.canonicalId, "Dependency coverage classification differs from the contract."));
    if ((expectedEntry.rpcSignature || "") !== (actual.rpcSignature || "")) issues.push(issue("error", "RPC_SIGNATURE_CHANGED", actual.canonicalId, "RPC signature differs from the contract."));
    if (expectedEntry.exposure !== actual.exposureHint) issues.push(issue("error", "EXPOSURE_CHANGED", actual.canonicalId, "Observed exposure class differs from the contract."));
    if (expectedEntry.sourceFingerprint !== actual.sourceFingerprint) issues.push(issue("error", "SOURCE_FINGERPRINT_CHANGED", actual.canonicalId, "Direct source fingerprint changed; review and refresh deliberately."));
    if (reviewedAuthorization[actual.canonicalId] !== actual.authorizationFingerprint) issues.push(issue("error", "AUTHORIZATION_ENVELOPE_CHANGED", actual.canonicalId, "Authorization/shared dependency envelope changed; review and refresh deliberately."));
  }
  for (const entry of entries) {
    if (actualById.has(entry.canonicalId)) {
      if (["removed", "unreachable"].includes(entry.lifecycle)) issues.push(issue("error", "DISPOSED_SURFACE_STILL_PRESENT", entry.canonicalId, "Removed/unreachable surface is still present in source."));
    } else if (!["removed", "unreachable"].includes(entry.lifecycle)) {
      issues.push(issue("error", "REMOVED_WITHOUT_DISPOSITION", entry.canonicalId, "Contract surface is absent from source without removed/unreachable lifecycle."));
    }
  }

  if (repoRoot) {
    for (const entry of entries) {
      const path = join(repoRoot, entry.sourceFile);
      if (!existsSync(path)) { issues.push(issue("error", "SOURCE_PATH_MISSING", entry.canonicalId, "Source path does not exist.")); continue; }
      const actual = actualById.get(entry.canonicalId);
      if (!["inline", "undetermined", "Deno.serve"].includes(entry.handler) && entry.sourceKind !== "postgres-function" && actual?.handlerResolution !== "imported-static" && !functionSegment(text(path), entry.handler)) {
        issues.push(issue("error", "HANDLER_MISSING", entry.canonicalId, "Named handler does not exist in source."));
      }
    }
    const foundDeclarations = new Map((discovered.discoveredDeclarations || []).map((item) => [item.canonicalId, item]));
    const contractDeclarations = new Map((contract.nonGovernableDeclarations || []).map((item) => [item.canonicalId, item]));
    for (const declaration of discovered.discoveredDeclarations || []) {
      if (!contractDeclarations.has(declaration.canonicalId)) issues.push(issue("error", "UNREGISTERED_NON_GOVERNABLE_DECLARATION", declaration.canonicalId, "Directory without entrypoint requires explicit contract disposition."));
    }
    for (const declaration of contract.nonGovernableDeclarations || []) {
      const path = join(repoRoot, declaration.sourcePath);
      if (!existsSync(path)) issues.push(issue("warning", "DECLARATION_PATH_MISSING", declaration.canonicalId, "Declaration path no longer exists."));
      if (declaration.expectedHandlerAbsent && existsSync(join(path, "index.ts"))) issues.push(issue("error", "UNREACHABLE_BECAME_REACHABLE", declaration.canonicalId, "Previously unreachable declaration now has an index.ts handler."));
      if (foundDeclarations.has(declaration.canonicalId) && declaration.expectedHandlerAbsent) issues.push(issue("info", "NON_GOVERNABLE_DECLARATION", declaration.canonicalId, "Declaration remains unreachable and excluded from governable totals."));
    }
  }

  const sorted = issues.sort((a, b) => [a.level, a.code, a.canonicalId].join("|").localeCompare([b.level, b.code, b.canonicalId].join("|")));
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
    "Action contract validation: " + (result.ok ? "PASS" : "FAIL"),
    "contract=" + result.counts.contract + " discovered=" + result.counts.discovered + " edge=" + result.counts.edge + " postgres=" + result.counts.postgres,
    "errors=" + result.counts.errors + " warnings=" + result.counts.warnings + " info=" + result.counts.info
  ];
  for (const item of result.issues) lines.push(item.level.toUpperCase() + " " + item.code + " " + item.canonicalId + " " + item.message);
  return lines.join("\n") + "\n";
}

export function validationExitCode(result) {
  return result.ok ? 0 : 1;
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
    fingerprintMatches: actual.get(entry.canonicalId)?.sourceFingerprint === entry.sourceFingerprint ? "yes" : "no",
    authorizationFingerprintMatches: actual.get(entry.canonicalId)?.authorizationFingerprint === contract.reviewedAuthorizationFingerprints?.[entry.canonicalId] ? "yes" : "no",
    metadataFingerprintMatches: metadataFingerprint(entry) === contract.reviewedMetadataFingerprints?.[entry.canonicalId] ? "yes" : "no"
  }));
}
