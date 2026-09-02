import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { parse } from "@babel/parser";

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
  ["provider-gmail-oauth-callback", [["complete_provider_gmail_oauth_callback", "GET /functions/v1/provider-gmail-oauth-callback?code&state", "external-tokenized"]]],
  ["provider-gmail-push", [["receive_provider_gmail_push", "POST /functions/v1/provider-gmail-push", "external-tokenized"]]],
  ["google-chat-app", [["health", "GET /functions/v1/google-chat-app", "public"], ["handle_chat_event", "POST /functions/v1/google-chat-app provider event", "public"]]],
  ["interpret-upload", [["interpret_upload", "POST /functions/v1/interpret-upload", "human"]]],
  ["osp-case-api", [
    ["list_clarification_reviews", "GET /functions/v1/osp-case-api?action=list_clarification_reviews", "human"],
    ["save_clarification_review", "POST /functions/v1/osp-case-api?action=save_clarification_review", "human"],
    ["save_request_manifest_review", "POST /functions/v1/osp-case-api?action=save_request_manifest_review", "human"],
    ["get_request_knowledge_workspace", "GET /functions/v1/osp-case-api?action=get_request_knowledge_workspace", "human"],
    ["promote_request_knowledge", "POST /functions/v1/osp-case-api?action=promote_request_knowledge", "human"],
    ["get_approval_communications_workspace", "GET /functions/v1/osp-case-api?action=get_approval_communications_workspace", "human"],
    ["complete_operations_review", "POST /functions/v1/osp-case-api?action=complete_operations_review", "human"],
    ["approve_and_apply_signature", "POST /functions/v1/osp-case-api?action=approve_and_apply_signature", "human"],
    ["save_outbound_draft", "POST /functions/v1/osp-case-api?action=save_outbound_draft", "human"],
    ["freeze_outbound_payload", "POST /functions/v1/osp-case-api?action=freeze_outbound_payload", "human"],
    ["authorize_outbound_payload", "POST /functions/v1/osp-case-api?action=authorize_outbound_payload", "human"],
    ["request_authorized_send", "POST /functions/v1/osp-case-api?action=request_authorized_send", "human"],
  ]],
  ["osp-document-api", [
    ["list_document_versions", "GET /functions/v1/osp-document-api?action=list_document_versions", "human"],
    ["upload_document_version", "POST /functions/v1/osp-document-api?action=upload_document_version", "human"],
    ["approve_document_version", "POST /functions/v1/osp-document-api?action=approve_document_version", "human"],
    ["claim_profile_review", "POST /functions/v1/osp-document-api?action=claim_profile_review", "human"],
    ["decide_profile_review_field", "POST /functions/v1/osp-document-api?action=decide_profile_review_field", "human"],
    ["finalize_profile_review", "POST /functions/v1/osp-document-api?action=finalize_profile_review", "human"],
    ["promote_profile_review_facts", "POST /functions/v1/osp-document-api?action=promote_profile_review_facts", "human"],
    ["bind_case_profile", "POST /functions/v1/osp-document-api?action=bind_case_profile", "human"],
    ["assemble_case_profile_draft", "POST /functions/v1/osp-document-api?action=assemble_case_profile_draft", "human"],
  ]],
  ["osp-form-api", [
    ["list_form_templates", "POST /functions/v1/osp-form-api action=list_form_templates", "human"],
    ["get_case_form_workspace", "POST /functions/v1/osp-form-api action=get_case_form_workspace", "human"],
    ["save_form_template_draft", "POST /functions/v1/osp-form-api action=save_form_template_draft", "human"],
    ["publish_form_template", "POST /functions/v1/osp-form-api action=publish_form_template", "human"],
    ["save_case_form_draft", "POST /functions/v1/osp-form-api action=save_case_form_draft", "human"],
    ["accept_case_form_mapping", "POST /functions/v1/osp-form-api action=accept_case_form_mapping", "human"],
    ["correct_case_form_mapping", "POST /functions/v1/osp-form-api action=correct_case_form_mapping", "human"],
    ["submit_case_form_for_review", "POST /functions/v1/osp-form-api action=submit_case_form_for_review", "human"],
  ]],
  ["osp-gmail-poll", [
    ["poll_connected_provider_mailbox", "POST /functions/v1/osp-gmail-poll action=poll_connected_provider_mailbox", "internal/service-role"],
    ["drain_queued_osp_jobs", "POST /functions/v1/osp-gmail-poll action=drain_queued_osp_jobs", "internal/service-role"],
  ]],
  ["osp-gmail-sync-api", [
    ["sync_provider_gmail_inbox", "POST /functions/v1/osp-gmail-sync-api action=sync_provider_gmail_inbox", "human"],
    ["renew_provider_gmail_watch", "POST /functions/v1/osp-gmail-sync-api action=renew_provider_gmail_watch", "human"],
    ["preview_historical_provider_gmail", "POST /functions/v1/osp-gmail-sync-api action=preview_historical_provider_gmail", "human"],
    ["import_historical_provider_gmail", "POST /functions/v1/osp-gmail-sync-api action=import_historical_provider_gmail", "human"],
  ]],
  ["osp-read-api", [
    ["list_provider_onboarding_workspace", "POST /functions/v1/osp-read-api action=list_provider_onboarding_workspace", "human"],
    ["provider_gmail_status", "POST /functions/v1/osp-read-api action=provider_gmail_status", "human"],
    ["list_customer_registration_cases", "POST /functions/v1/osp-read-api action=list_customer_registration_cases", "human"],
    ["get_customer_registration_case", "POST /functions/v1/osp-read-api action=get_customer_registration_case", "human"],
    ["get_corporate_profile", "POST /functions/v1/osp-read-api action=get_corporate_profile", "human"],
  ]],
  ["osp-release-control", [
    ["get_release_mode", "GET /functions/v1/osp-release-control?action=get_release_mode", "internal/service-role"],
    ["consume_release_evidence", "POST /functions/v1/osp-release-control?action=consume_release_evidence", "internal/service-role"],
    ["set_release_mode", "POST /functions/v1/osp-release-control?action=set_release_mode", "internal/service-role"],
  ]],
  ["osp-worker", [
    ["run_manual_request_canary", "POST /functions/v1/osp-worker action=run_manual_request_canary", "internal/service-role"],
    ["drain_rateware_gmail", "POST /functions/v1/osp-worker action=drain_rateware_gmail", "internal/service-role"],
    ["run_request_manifest_shadow", "POST /functions/v1/osp-worker action=run_request_manifest_shadow", "internal/service-role"],
    ["run_request_manifest_canary", "POST /functions/v1/osp-worker action=run_request_manifest_canary", "internal/service-role"],
    ["run_supplier_package_canary", "POST /functions/v1/osp-worker action=run_supplier_package_canary", "internal/service-role"],
    ["run_signature_application_canary", "POST /functions/v1/osp-worker action=run_signature_application_canary", "internal/service-role"],
    ["run_xlsx_document_extract_canary", "POST /functions/v1/osp-worker action=run_xlsx_document_extract_canary", "internal/service-role"],
  ]],
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
  value = value.replace(/\r\n?/g, "\n");
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

function reviewedAuthorizationValues(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function validReviewedAuthorization(value) {
  const values = reviewedAuthorizationValues(value);
  return values.length > 0
    && values.every((item) => typeof item === "string" && /^[0-9a-f]{64}$/.test(item))
    && new Set(values).size === values.length;
}

function reviewedAuthorizationMatches(value, actualFingerprint) {
  return reviewedAuthorizationValues(value).includes(actualFingerprint);
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

function jsLexicalSignals(source) {
  const identifiers = [];
  let hasInlineFunction = false;
  let index = 0;
  let canStartRegex = true;
  while (index < source.length) {
    const c = source[index];
    const n = source[index + 1];
    if (/\s/.test(c)) { index += 1; continue; }
    if (c === "/" && n === "/") {
      const end = source.indexOf("\n", index + 2);
      index = end < 0 ? source.length : end + 1;
      continue;
    }
    if (c === "/" && n === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end < 0 ? source.length : end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      index += 1;
      while (index < source.length) {
        if (source[index] === "\\") { index += 2; continue; }
        if (source[index] === quote) { index += 1; break; }
        index += 1;
      }
      canStartRegex = false;
      continue;
    }
    if (c === "/" && canStartRegex) {
      let inClass = false;
      index += 1;
      while (index < source.length) {
        if (source[index] === "\\") { index += 2; continue; }
        if (source[index] === "[") { inClass = true; index += 1; continue; }
        if (source[index] === "]") { inClass = false; index += 1; continue; }
        if (source[index] === "/" && !inClass) {
          index += 1;
          while (index < source.length && /[A-Za-z]/.test(source[index])) index += 1;
          break;
        }
        if (source[index] === "\n" || source[index] === "\r") break;
        index += 1;
      }
      canStartRegex = false;
      continue;
    }
    if (c === "=" && n === ">") { hasInlineFunction = true; index += 2; continue; }
    if (/[A-Za-z_$]/.test(c)) {
      let identifier = c;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) { identifier += source[index]; index += 1; }
      identifiers.push(identifier);
      if (identifier === "function") hasInlineFunction = true;
      canStartRegex = ["return", "throw", "case", "delete", "void", "typeof", "instanceof", "in", "of", "new", "await", "yield"].includes(identifier);
      continue;
    }
    if (/[0-9]/.test(c) || c === ")" || c === "]" || c === "}") canStartRegex = false;
    else if (!/\s/.test(c)) canStartRegex = true;
    index += 1;
  }
  return { identifiers, hasInlineFunction };
}

function jsStructureTokens(source, { detailed = false } = {}) {
  const tokens = [];
  let index = 0;
  let canStartRegex = true;
  let nextScopeId = 1;
  const scope = [];
  const braceKinds = [];
  const functionScopeIds = new Set();
  const add = (value, tokenIndex) => {
    tokens.push({ value, index: tokenIndex, scope: [...scope], functionScopes: scope.filter((id) => functionScopeIds.has(id)) });
    if (value === "{") {
      const previous = tokens.at(-2)?.value;
      const objectLike = ["=", ":", "(", "[", ",", "const", "let", "var"].includes(previous);
      braceKinds.push(objectLike ? "object" : "scope");
      if (!objectLike) {
        const scopeId = nextScopeId++;
        const boundary = tokens.findLastIndex((token, index) => index < tokens.length - 1 && [";", "{", "}"].includes(token.value));
        if (tokens.slice(boundary + 1, -1).some((token) => token.value === "function")) functionScopeIds.add(scopeId);
        scope.push(scopeId);
      }
    }
    if (value === "}" && braceKinds.pop() === "scope") scope.pop();
  };
  while (index < source.length) {
    const c = source[index];
    const n = source[index + 1];
    if (/\s/.test(c)) { index += 1; continue; }
    if (c === "/" && n === "/") { const end = source.indexOf("\n", index + 2); index = end < 0 ? source.length : end + 1; continue; }
    if (c === "/" && n === "*") { const end = source.indexOf("*/", index + 2); index = end < 0 ? source.length : end + 2; continue; }
    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      const literalStart = index;
      index += 1;
      while (index < source.length) {
        if (source[index] === "\\") { index += 2; continue; }
        if (source[index] === quote) { index += 1; break; }
        index += 1;
      }
      const literal = quote === "`" ? "<string>" : "str:" + source.slice(literalStart + 1, Math.max(literalStart + 1, index - 1));
      add(literal, literalStart);
      canStartRegex = false;
      continue;
    }
    if (c === "/" && canStartRegex) {
      let inClass = false;
      index += 1;
      while (index < source.length) {
        if (source[index] === "\\") { index += 2; continue; }
        if (source[index] === "[") { inClass = true; index += 1; continue; }
        if (source[index] === "]") { inClass = false; index += 1; continue; }
        if (source[index] === "/" && !inClass) { index += 1; while (index < source.length && /[A-Za-z]/.test(source[index])) index += 1; break; }
        if (source[index] === "\n" || source[index] === "\r") break;
        index += 1;
      }
      add("<regex>", index);
      canStartRegex = false;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let token = c;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) { token += source[index]; index += 1; }
      add(token, index - token.length);
      canStartRegex = ["return", "throw", "case", "delete", "void", "typeof", "instanceof", "in", "of", "new", "await", "yield"].includes(token);
      continue;
    }
    if (/[0-9]/.test(c)) {
      while (index < source.length && /[A-Za-z0-9_.]/.test(source[index])) index += 1;
      add("<number>", index);
      canStartRegex = false;
      continue;
    }
    add(c, index);
    canStartRegex = ![")", "]", "}"].includes(c);
    index += 1;
  }
  return detailed ? tokens : tokens.map((token) => token.value);
}

function arrayInitializer(tokens, equalIndex) {
  const first = tokens[equalIndex + 1];
  if (first === "[") return true;
  return first === "Array" && tokens[equalIndex + 2] === "." && tokens[equalIndex + 3] === "from" && tokens[equalIndex + 4] === "(";
}

function objectArrayProperty(tokens, equalIndex, property) {
  if (tokens[equalIndex + 1] !== "{") return false;
  let depth = 0;
  for (let index = equalIndex + 1; index < tokens.length; index += 1) {
    if (tokens[index] === "{") { depth += 1; continue; }
    if (tokens[index] === "}") { depth -= 1; if (depth === 0) break; continue; }
    if (depth === 1 && tokens[index] === property && tokens[index + 1] === ":") {
      return tokens[index + 2] === "[" || (tokens[index + 2] === "Array" && tokens[index + 3] === "." && tokens[index + 4] === "from");
    }
  }
  return false;
}

function latestReceiverArrayEvidence(source, receiver, calleeText, searchStart = 0) {
  const detailed = jsStructureTokens(source, { detailed: true });
  const callIndex = source.indexOf(calleeText, Math.max(0, searchStart));
  const callToken = [...detailed].reverse().find((token) => token.index <= callIndex);
  const callScope = callToken?.scope || [];
  const callFunctionScopes = new Set(callToken?.functionScopes || []);
  const inCallScope = (token) => token.scope.every((scopeId, index) => callScope[index] === scopeId);
  const executableForCall = (token) => token.functionScopes.every((scopeId) => callFunctionScopes.has(scopeId));
  const beforeCall = detailed.filter((token) => token.index < callIndex);
  const tokens = beforeCall.map((token) => token.value);
  const bindings = new Map();
  const descriptorAt = (equalIndex) => {
    if (arrayInitializer(tokens, equalIndex)) return { kind: "array" };
    if ((tokens[equalIndex + 1] || "").startsWith("str:")) return { kind: "string", value: tokens[equalIndex + 1].slice(4) };
    if (/^[A-Za-z_$][\w$]*$/.test(tokens[equalIndex + 1] || "")) return bindings.get(tokens[equalIndex + 1]) || { kind: "other" };
    if (tokens[equalIndex + 1] === "{") {
      const props = new Map();
      let depth = 0;
      for (let index = equalIndex + 1; index < tokens.length; index += 1) {
        if (tokens[index] === "{") { depth += 1; continue; }
        if (tokens[index] === "}") { depth -= 1; if (depth === 0) break; continue; }
        let property = null;
        let colon = -1;
        if (depth === 1 && (/^[A-Za-z_$][\w$]*$/.test(tokens[index]) || tokens[index]?.startsWith("str:")) && tokens[index + 1] === ":") {
          property = tokens[index].startsWith("str:") ? tokens[index].slice(4) : tokens[index];
          colon = index + 1;
        } else if (depth === 1 && tokens[index] === "[" && tokens[index + 1]?.startsWith("str:") && tokens[index + 2] === "]" && tokens[index + 3] === ":") {
          property = tokens[index + 1].slice(4);
          colon = index + 3;
        }
        if (property) {
          props.set(property, descriptorAt(colon));
        }
      }
      return { kind: "object", props };
    }
    return { kind: "other" };
  };
  const exactEqual = (index) => tokens[index] === "=" && tokens[index - 1] !== "=" && !["=", ">"].includes(tokens[index + 1]);
  for (let index = 0; index < tokens.length; index += 1) {
    if (["const", "let", "var"].includes(tokens[index])) {
      if (!inCallScope(beforeCall[index])) {
        while (index < tokens.length && tokens[index] !== ";") index += 1;
        continue;
      }
      if (tokens[index + 1] === "[") {
        const close = tokens.indexOf("]", index + 2);
        const equal = tokens.indexOf("=", close + 1);
        const sourceDescriptor = exactEqual(equal) ? descriptorAt(equal) : null;
        if (close > 0 && sourceDescriptor?.kind === "array") {
          for (let item = index + 2; item < close; item += 1) if (tokens[item - 1] === "." && tokens[item - 2] === ".") bindings.set(tokens[item], { kind: "array" });
        }
        continue;
      }
      if (tokens[index + 1] === "{") {
        const close = tokens.indexOf("}", index + 2);
        const equal = tokens.indexOf("=", close + 1);
        const sourceBinding = exactEqual(equal) ? bindings.get(tokens[equal + 1]) : null;
        if (close > 0 && sourceBinding?.kind === "object") {
          for (let item = index + 2; item < close; item += 1) {
            if (tokens[item] === "." && tokens[item + 1] === "." && tokens[item + 2] === "." && /^[A-Za-z_$][\w$]*$/.test(tokens[item + 3] || "")) {
              bindings.set(tokens[item + 3], sourceBinding);
              item += 3;
            } else if (/^[A-Za-z_$][\w$]*$/.test(tokens[item])) {
              const local = tokens[item + 1] === ":" && /^[A-Za-z_$][\w$]*$/.test(tokens[item + 2] || "") ? tokens[item + 2] : tokens[item];
              bindings.set(local, sourceBinding.props.get(tokens[item]) || { kind: "other" });
              if (local !== tokens[item]) item += 2;
            }
          }
        }
        continue;
      }
      const name = tokens[index + 1];
      if (!/^[A-Za-z_$][\w$]*$/.test(name || "")) continue;
      let equal = index + 2;
      let squareDepth = 0;
      while (equal < tokens.length) {
        if (tokens[equal] === "[") squareDepth += 1;
        if (tokens[equal] === "]") squareDepth = Math.max(0, squareDepth - 1);
        if (tokens[equal] === "=" && squareDepth === 0) break;
        if ([";", ","].includes(tokens[equal]) && squareDepth === 0) break;
        equal += 1;
      }
      if (exactEqual(equal)) bindings.set(name, descriptorAt(equal));
      continue;
    }
    const name = tokens[index];
    if (!/^[A-Za-z_$][\w$]*$/.test(name || "") || ["const", "let", "var"].includes(tokens[index - 1])) continue;
    if (!executableForCall(beforeCall[index])) continue;
    if (exactEqual(index + 1)) {
      bindings.set(name, descriptorAt(index + 1));
      continue;
    }
    let property = null;
    let equalIndex = -1;
    if (tokens[index + 1] === "." && /^[A-Za-z_$][\w$]*$/.test(tokens[index + 2] || "") && exactEqual(index + 3)) {
      property = tokens[index + 2];
      equalIndex = index + 3;
    } else if (tokens[index + 1] === "[") {
      const close = tokens.indexOf("]", index + 2);
      if (close > 0 && exactEqual(close + 1)) {
        const keyToken = tokens[index + 2];
        property = keyToken?.startsWith("str:") ? keyToken.slice(4) : bindings.get(keyToken)?.kind === "string" ? bindings.get(keyToken).value : null;
        equalIndex = close + 1;
      }
    }
    if (equalIndex >= 0) {
      const current = bindings.get(name);
      if (current?.kind === "object") {
        if (property) current.props.set(property, descriptorAt(equalIndex));
        else for (const key of current.props.keys()) current.props.set(key, { kind: "other" });
      } else {
        bindings.set(name, { kind: "other" });
      }
    }
  }
  let descriptor = bindings.get(receiver[0]);
  for (const property of receiver.slice(1)) descriptor = descriptor?.kind === "object" ? descriptor.props.get(property) : null;
  return descriptor?.kind === "array";
}

function provenLocalArrayTransform(call, source, searchStart = 0) {
  const transforms = new Set(["map", "filter", "reduce", "reduceRight", "flatMap", "forEach", "some", "every", "find", "findIndex", "findLast", "findLastIndex", "sort", "toSorted", "toReversed", "toSpliced", "with"]);
  if (!call?.terminal || !transforms.has(call.terminal)) return false;
  if (call.calleeText.trimStart().startsWith("[")) return true;
  return latestReceiverArrayEvidence(source, call.receiver, call.calleeText, searchStart);
}

function returnedInlineCallbackCall(dispatch, source = dispatch, searchStart = 0) {
  const returned = /\breturn\b/.exec(dispatch);
  if (!returned) return null;
  let start = skipJsTrivia(dispatch, returned.index + returned[0].length);
  if (/^await\b/.test(dispatch.slice(start))) start = skipJsTrivia(dispatch, start + 5);
  let squareDepth = 0;
  let braceDepth = 0;
  for (let index = start; index < dispatch.length; index += 1) {
    const next = skipJsTrivia(dispatch, index);
    if (next !== index) { index = next - 1; continue; }
    const c = dispatch[index];
    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      index += 1;
      while (index < dispatch.length) {
        if (dispatch[index] === "\\") { index += 2; continue; }
        if (dispatch[index] === quote) break;
        index += 1;
      }
      continue;
    }
    if (c === "[") { squareDepth += 1; continue; }
    if (c === "]") { squareDepth = Math.max(0, squareDepth - 1); continue; }
    if (c === "{") { braceDepth += 1; continue; }
    if (c === "}") {
      if (braceDepth === 0 && squareDepth === 0) break;
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (c === ";" && squareDepth === 0 && braceDepth === 0) break;
    if (c !== "(" || squareDepth !== 0 || braceDepth !== 0) continue;
    const close = closingDelimiter(dispatch, index, "(", ")");
    if (close < 0) break;
    const argumentsText = dispatch.slice(index + 1, close);
    const argumentSignals = jsLexicalSignals(argumentsText);
    if (argumentSignals.hasInlineFunction) {
      const calleeSignals = jsLexicalSignals(dispatch.slice(start, index));
      const calleeIdentifiers = calleeSignals.identifiers.filter((item) => !["await", "new"].includes(item));
      const root = calleeIdentifiers[0] || null;
      const terminal = calleeIdentifiers.at(-1) || null;
      const receiver = calleeIdentifiers.slice(0, -1);
      const calleeText = dispatch.slice(start, index);
      if (root === "jsonResponse") {
        const nested = returnedInlineCallbackCall("return " + argumentsText, source, searchStart);
        if (nested && !provenLocalArrayTransform(nested, source, searchStart)) return nested;
      }
      return { root, terminal, receiver, calleeText };
    }
    index = close;
  }
  return null;
}

const actionAstCache = new Map();
const ARRAY_CALLBACK_METHODS = new Set(["map", "filter", "reduce", "reduceRight", "flatMap", "forEach", "some", "every", "find", "findIndex", "findLast", "findLastIndex", "sort", "toSorted", "toReversed", "toSpliced", "with"]);

function actionAst(source) {
  if (actionAstCache.has(source)) return actionAstCache.get(source);
  let ast = null;
  try {
    ast = parse(source, {
      sourceType: "module",
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
      errorRecovery: true,
      plugins: ["decorators-legacy", "typescript", "importAttributes", "explicitResourceManagement"]
    });
  } catch {}
  actionAstCache.set(source, ast);
  if (actionAstCache.size > 64) actionAstCache.delete(actionAstCache.keys().next().value);
  return ast;
}

function astChildren(node) {
  const out = [];
  if (!node || typeof node !== "object") return out;
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "start", "end", "extra", "errors", "comments", "tokens"].includes(key)) continue;
    if (Array.isArray(value)) {
      for (const item of value) if (item?.type) out.push(item);
    } else if (value?.type) out.push(value);
  }
  return out;
}

function walkAst(node, visitor) {
  if (!node?.type) return;
  visitor(node);
  for (const child of astChildren(node)) walkAst(child, visitor);
}

function astContains(node, position) { return Number.isInteger(node?.start) && Number.isInteger(node?.end) && node.start <= position && position < node.end; }
function unwrapAst(node) {
  let current = node;
  while (["AwaitExpression", "TSAsExpression", "TSTypeAssertion", "TSNonNullExpression", "ParenthesizedExpression", "ChainExpression"].includes(current?.type)) current = current.argument || current.expression;
  return current;
}
function astPropertyName(node, scope = null) {
  const value = unwrapAst(node);
  if (scope && value?.type === "Identifier") return scope.get(value.name)?.kind === "string" ? scope.get(value.name).value : null;
  if (["Identifier", "PrivateName"].includes(value?.type)) return value.name || value.id?.name || null;
  if (["StringLiteral", "NumericLiteral", "BooleanLiteral"].includes(value?.type)) return String(value.value);
  if (value?.type === "TemplateLiteral" && value.expressions.length === 0) return value.quasis[0]?.value?.cooked ?? null;
  return null;
}
function directInlineCallback(call) {
  return ["CallExpression", "OptionalCallExpression"].includes(call?.type) && call.arguments.some((argument) => ["ArrowFunctionExpression", "FunctionExpression"].includes(unwrapAst(argument)?.type));
}
function nestedInlineCallbackCall(node) {
  const value = unwrapAst(node);
  if (!value?.type) return null;
  if (directInlineCallback(value)) return value;
  for (const child of astChildren(value)) {
    if (["ArrowFunctionExpression", "FunctionExpression", "ObjectMethod", "ClassMethod"].includes(child.type)) continue;
    const found = nestedInlineCallbackCall(child);
    if (found) return found;
  }
  return null;
}
function returnedCallbackCall(returnNode) {
  const outer = unwrapAst(returnNode?.argument);
  if (!outer) return null;
  if (outer.type === "NewExpression" && astPropertyName(outer.callee) === "Response") return null;
  if (!["CallExpression", "OptionalCallExpression"].includes(outer.type)) return nestedInlineCallbackCall(outer);
  const outerName = astPropertyName(outer.callee);
  if (outerName === "Response") return null;
  if (outerName === "jsonResponse") {
    for (const argument of outer.arguments) {
      const found = nestedInlineCallbackCall(argument);
      if (found) return found;
    }
    return null;
  }
  return directInlineCallback(outer) ? outer : nestedInlineCallbackCall(outer);
}

class AstScope {
  constructor(parent = null) { this.parent = parent; this.bindings = new Map(); }
  declare(name, value) { if (name) this.bindings.set(name, value); }
  cell(name) { return this.bindings.has(name) ? this : this.parent?.cell(name) || null; }
  get(name) { return this.cell(name)?.bindings.get(name) || null; }
  assign(name, value) { const target = this.cell(name) || this; target.bindings.set(name, value); }
}

const OTHER_VALUE = Object.freeze({ kind: "other" });
const UNKNOWN_VALUE = Object.freeze({ kind: "unknown" });
const ARRAY_VALUE = Object.freeze({ kind: "array" });
const SUPABASE_CLIENT_VALUE = Object.freeze({ kind: "supabase-client" });
const BUILTIN_PROMISE_VALUE = Object.freeze({ kind: "builtin-promise" });
const BUILTIN_OBJECT_VALUE = Object.freeze({ kind: "builtin-object" });
const BUILTIN_ARRAY_VALUE = Object.freeze({ kind: "builtin-array" });
const NULL_VALUE = Object.freeze({ kind: "scalar", truthy: false, nullish: true });
function astTypeContainsArray(node) {
  if (!node?.type) return false;
  if (["TSArrayType", "TSTupleType"].includes(node.type)) return true;
  return astChildren(node).some(astTypeContainsArray);
}
function typedArrayReturnsAreSafe(node) {
  let sawReturn = false;
  let safe = true;
  const visit = (current) => {
    if (!current?.type || !safe) return;
    if (current !== node && ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ObjectMethod", "ClassMethod"].includes(current.type)) return;
    if (current.type === "ReturnStatement") {
      sawReturn = true;
      const returned = unwrapAst(current.argument);
      if (!["ArrayExpression", "CallExpression", "OptionalCallExpression"].includes(returned?.type)) safe = false;
      return;
    }
    for (const child of astChildren(current)) visit(child);
  };
  visit(node?.body);
  return sawReturn && safe;
}
function functionValue(node, scope) { return { kind: "function", node, scope, returnsArray: astTypeContainsArray(node.returnType), typedArrayReturnsSafe: typedArrayReturnsAreSafe(node) }; }
function arrayValue(elements = null) { return elements ? { kind: "array", elements } : ARRAY_VALUE; }
function queryRowsValue(single = false, selected = true) {
  return { kind: "object", queryRows: true, querySelected: selected, unknownProps: false, props: new Map([["data", selected ? (single ? OTHER_VALUE : ARRAY_VALUE) : UNKNOWN_VALUE], ["error", OTHER_VALUE], ["count", OTHER_VALUE]]) };
}
function trustedSupabaseModule(source) {
  const value = String(source || "");
  if (/^(?:npm:)?@supabase\/supabase-js(?:@[^/]+)?$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.hostname === "esm.sh" && /^\/@supabase\/supabase-js(?:@[^/]+)?\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

function cloneAstValue(value, memo = new Map()) {
  if (!value || value === OTHER_VALUE || value === UNKNOWN_VALUE || value === ARRAY_VALUE) return value;
  if (value.kind === "array") return arrayValue(value.elements?.map((entry) => cloneAstValue(entry, memo)) || null);
  if (value.kind !== "object") return value;
  if (memo.has(value)) return memo.get(value);
  const copy = { kind: "object", props: new Map(), unknownProps: value.unknownProps === true, queryRows: value.queryRows === true, querySelected: value.querySelected === true };
  memo.set(value, copy);
  for (const [key, child] of value.props) copy.props.set(key, cloneAstValue(child, memo));
  return copy;
}

function astValuesEquivalent(left, right, seen = new Map()) {
  if (left === right) return true;
  if (!left || !right || left.kind !== right.kind) return false;
  if (left.kind === "array") {
    if (!left.elements || !right.elements) return !left.elements && !right.elements;
    return left.elements.length === right.elements.length && left.elements.every((value, index) => astValuesEquivalent(value, right.elements[index], seen));
  }
  if (["other", "unknown"].includes(left.kind)) return true;
  if (left.kind === "string") return left.value === right.value;
  if (left.kind === "function") return left.node === right.node;
  if (left.kind !== "object" || left.props.size !== right.props.size || left.unknownProps !== right.unknownProps || left.queryRows !== right.queryRows || left.querySelected !== right.querySelected) return false;
  if (seen.get(left)?.has(right)) return true;
  if (!seen.has(left)) seen.set(left, new Set());
  seen.get(left).add(right);
  for (const [key, value] of left.props) if (!right.props.has(key) || !astValuesEquivalent(value, right.props.get(key), seen)) return false;
  return true;
}

function joinAstValues(values, memo = [], depth = 0) {
  if (!values.length) return OTHER_VALUE;
  if (depth > 16) return UNKNOWN_VALUE;
  if (values.every((value) => value?.kind === "object")) {
    const existing = memo.find((entry) => entry.values.length === values.length && entry.values.every((value, index) => value === values[index]));
    if (existing) return existing.result;
    const common = [...values[0].props.keys()].filter((key) => values.every((value) => value.props.has(key)));
    const joined = { kind: "object", props: new Map(), unknownProps: values.some((value) => value.unknownProps), queryRows: values.every((value) => value.queryRows), querySelected: values.every((value) => value.querySelected) };
    memo.push({ values: [...values], result: joined });
    for (const key of common) joined.props.set(key, joinAstValues(values.map((value) => value.props.get(key)), memo, depth + 1));
    return joined;
  }
  if (values.every((value) => value?.kind === "array")) {
    const elementCounts = values.map((value) => value.elements?.length ?? -1);
    if (elementCounts[0] >= 0 && elementCounts.every((count) => count === elementCounts[0])) return arrayValue(values[0].elements.map((_, index) => joinAstValues(values.map((value) => value.elements[index]), memo, depth + 1)));
    return ARRAY_VALUE;
  }
  if (values.every((value) => astValuesEquivalent(value, values[0]))) return cloneAstValue(values[0]);
  return values.some((value) => value?.kind === "unknown") ? UNKNOWN_VALUE : OTHER_VALUE;
}

function astScopeChain(scope) {
  const scopes = [];
  for (let current = scope; current; current = current.parent) scopes.unshift(current);
  return scopes;
}

function captureAstScopes(scope) {
  const memo = new Map();
  return astScopeChain(scope).map((current) => ({ scope: current, bindings: new Map([...current.bindings].map(([key, value]) => [key, cloneAstValue(value, memo)])) }));
}

function restoreAstScopes(snapshot) {
  const memo = new Map();
  for (const entry of snapshot) entry.scope.bindings = new Map([...entry.bindings].map(([key, value]) => [key, cloneAstValue(value, memo)]));
}

function joinAstScopeSnapshots(base, alternatives) {
  const joined = [];
  for (let index = 0; index < base.length; index += 1) {
    const keys = new Set(base[index].bindings.keys());
    for (const alternative of alternatives) for (const key of alternative[index].bindings.keys()) keys.add(key);
    const memo = [];
    joined.push({
      scope: base[index].scope,
      bindings: new Map([...keys].map((key) => [key, joinAstValues(alternatives.map((alternative) => alternative[index].bindings.get(key) || OTHER_VALUE), memo)]))
    });
  }
  restoreAstScopes(joined);
}

function executeAstAlternatives(scope, state, alternatives, includeBase = false) {
  const base = captureAstScopes(scope);
  const results = includeBase ? [base] : [];
  const completions = includeBase ? ["normal"] : [];
  for (const execute of alternatives) {
    restoreAstScopes(base);
    completions.push(execute() || "normal");
    results.push(captureAstScopes(scope));
  }
  joinAstScopeSnapshots(base, results.length ? results : [base]);
  const labeled = completions.find((completion) => completion.startsWith?.("break:") || completion.startsWith?.("continue:"));
  if (labeled) return labeled;
  const first = completions[0] || "normal";
  return completions.length && completions.every((completion) => completion === first) ? first : "normal";
}

function memberValue(node, scope) {
  const member = unwrapAst(node);
  if (!["MemberExpression", "OptionalMemberExpression"].includes(member?.type)) return UNKNOWN_VALUE;
  const object = evaluateAst(member.object, scope);
  const property = member.computed ? astPropertyName(member.property, scope) : astPropertyName(member.property);
  if (object?.kind !== "object" || property == null) return UNKNOWN_VALUE;
  return object.props.get(property) || (object.unknownProps ? UNKNOWN_VALUE : NULL_VALUE);
}

function evaluateObject(node, scope) {
  const props = new Map();
  let unknownProps = false;
  for (const property of node.properties || []) {
    if (property.type === "SpreadElement") {
      const spread = evaluateAst(property.argument, scope);
      if (spread?.kind === "object") {
        for (const [key, value] of spread.props) props.set(key, value);
        if (spread.unknownProps) unknownProps = true;
      }
      else {
        unknownProps = true;
        for (const key of props.keys()) props.set(key, UNKNOWN_VALUE);
      }
      continue;
    }
    const key = property.computed ? astPropertyName(property.key, scope) : astPropertyName(property.key);
    if (key == null) {
      const assigned = ["ObjectMethod"].includes(property.type) ? functionValue(property, scope) : evaluateAst(property.value, scope);
      unknownProps = true;
      for (const existing of props.keys()) props.set(existing, joinAstValues([props.get(existing), assigned]));
      continue;
    }
    if (["ObjectMethod"].includes(property.type)) props.set(key, functionValue(property, scope));
    else props.set(key, evaluateAst(property.value, scope));
  }
  return { kind: "object", props, unknownProps };
}

function evaluateAst(node, scope, state = null) {
  const value = unwrapAst(node);
  if (!value) return OTHER_VALUE;
  const evaluationState = state || {};
  if (!evaluationState.activeExpressions) evaluationState.activeExpressions = new Set();
  if (evaluationState.activeExpressions.has(value)) return OTHER_VALUE;
  evaluationState.activeExpressions.add(value);
  try {
    return evaluateAstValue(value, scope, evaluationState);
  } finally {
    evaluationState.activeExpressions.delete(value);
  }
}

function evaluateAstValue(value, scope, state) {
  if (value.type === "ArrayExpression") return arrayValue((value.elements || []).map((element) => element ? evaluateAst(element, scope, state) : OTHER_VALUE));
  if (value.type === "NullLiteral") return NULL_VALUE;
  if (value.type === "BooleanLiteral") return { kind: "scalar", truthy: value.value, nullish: false };
  if (value.type === "NumericLiteral") return { kind: "scalar", truthy: Boolean(value.value), nullish: false };
  if (value.type === "BigIntLiteral") return { kind: "scalar", truthy: value.value !== "0", nullish: false };
  if (value.type === "UnaryExpression") {
    const argument = evaluateAst(value.argument, scope, state);
    if (["+", "-"].includes(value.operator) && argument?.kind === "scalar") return argument;
    if (value.operator === "typeof") return { kind: "string", value: "known-type" };
    if (value.operator === "void") return NULL_VALUE;
    if (value.operator === "!" && argument?.kind === "scalar") return { kind: "scalar", truthy: !argument.truthy, nullish: false };
    if (value.operator === "!" && argument?.kind === "string") return { kind: "scalar", truthy: !argument.value, nullish: false };
    if (value.operator === "!" && ["array", "object", "function", "supabase-client", "builtin-promise", "builtin-object", "builtin-array"].includes(argument?.kind)) return { kind: "scalar", truthy: false, nullish: false };
    return UNKNOWN_VALUE;
  }
  if (["StringLiteral", "TemplateLiteral"].includes(value.type)) {
    if (value.type === "TemplateLiteral" && value.expressions.length) return OTHER_VALUE;
    return { kind: "string", value: value.type === "StringLiteral" ? value.value : value.quasis[0]?.value?.cooked };
  }
  if (value.type === "Identifier") {
    const binding = scope.get(value.name);
    if (binding) return binding;
    if (value.name === "undefined") return NULL_VALUE;
    if (value.name === "NaN") return { kind: "scalar", truthy: false, nullish: false };
    if (value.name === "Infinity") return { kind: "scalar", truthy: true, nullish: false };
    if (value.name === "Promise") return BUILTIN_PROMISE_VALUE;
    if (value.name === "Object") return BUILTIN_OBJECT_VALUE;
    if (value.name === "Array") return BUILTIN_ARRAY_VALUE;
    return UNKNOWN_VALUE;
  }
  if (value.type === "ObjectExpression") return evaluateObject(value, scope);
  if (value.type === "LogicalExpression") {
    const left = evaluateAst(value.left, scope, state);
    if (value.operator === "||" && ["array", "object", "function", "supabase-client"].includes(left?.kind)) return left;
    if (value.operator === "||" && ((left?.kind === "scalar" && !left.truthy) || (left?.kind === "string" && !left.value))) return evaluateAst(value.right, scope, state);
    if (value.operator === "??" && left?.nullish) return evaluateAst(value.right, scope, state);
    if (value.operator === "??" && !["unknown", "other", "null"].includes(left?.kind)) return left;
    const right = evaluateAst(value.right, scope, state);
    if (value.operator === "&&" && ["array", "object", "function", "supabase-client"].includes(left?.kind)) return right;
    if (value.operator === "&&" && ((left?.kind === "scalar" && left.truthy) || (left?.kind === "string" && left.value))) return right;
    return left?.kind === "array" && right?.kind === "array" ? ARRAY_VALUE : (left?.kind === "unknown" || right?.kind === "unknown" ? UNKNOWN_VALUE : OTHER_VALUE);
  }
  if (value.type === "ConditionalExpression") {
    const consequent = evaluateAst(value.consequent, scope, state);
    const alternate = evaluateAst(value.alternate, scope, state);
    return joinAstValues([consequent, alternate]);
  }
  if (["FunctionExpression", "ArrowFunctionExpression"].includes(value.type)) return functionValue(value, scope);
  if (["MemberExpression", "OptionalMemberExpression"].includes(value.type)) return memberValue(value, scope);
  if (value.type === "AssignmentExpression") return applyAstAssignment(value, scope, state);
  if (["CallExpression", "OptionalCallExpression"].includes(value.type)) {
    if (["MemberExpression", "OptionalMemberExpression"].includes(value.callee?.type)) {
      const method = value.callee.computed ? astPropertyName(value.callee.property, scope) : astPropertyName(value.callee.property);
      const receiver = evaluateAst(value.callee.object, scope, state);
      if (receiver?.kind === "builtin-object" && method === "assign") {
        const target = evaluateAst(value.arguments[0], scope, state);
        if (target?.kind !== "object") return UNKNOWN_VALUE;
        for (const argument of value.arguments.slice(1)) {
          const source = evaluateAst(argument, scope, state);
          if (source?.kind !== "object") {
            target.unknownProps = true;
            for (const key of target.props.keys()) target.props.set(key, UNKNOWN_VALUE);
            continue;
          }
          for (const [key, child] of source.props) target.props.set(key, child);
          if (source.unknownProps) target.unknownProps = true;
        }
        return target;
      }
      if (receiver?.kind === "builtin-promise" && ["all", "allSettled"].includes(method)) {
        const collection = evaluateAst(value.arguments[0], scope, state);
        return collection?.kind === "array" ? collection : ARRAY_VALUE;
      }
      if ((receiver?.kind === "builtin-array" && method === "from") || (receiver?.kind === "builtin-object" && ["entries", "keys", "values"].includes(method))) return ARRAY_VALUE;
      if (receiver?.kind === "supabase-client" && method === "from") return queryRowsValue(false, false);
      if (receiver?.queryRows) {
        if (method === "select") return queryRowsValue(false, true);
        if (method === "single" || method === "maybeSingle") return queryRowsValue(true, true);
        return receiver;
      }
      if (receiver?.kind === "array" && new Set([...ARRAY_CALLBACK_METHODS, "slice", "concat", "flat"]).has(method)) return ARRAY_VALUE;
    }
    const callee = unwrapAst(value.callee);
    if (callee?.type === "Identifier" && ((callee.name === "createClient" && !scope.cell(callee.name)) || scope.get(callee.name)?.kind === "supabase-create-client")) return SUPABASE_CLIENT_VALUE;
    const fn = ["FunctionExpression", "ArrowFunctionExpression"].includes(callee?.type) ? functionValue(callee, scope) : evaluateAst(callee, scope, state);
    if (fn?.kind === "supabase-create-client") return SUPABASE_CLIENT_VALUE;
    const result = evaluateAstFunctionResult(fn, value.arguments, { ...(state || {}), scope });
    if (result) return result;
    if (fn?.returnsArray && fn.typedArrayReturnsSafe) return ARRAY_VALUE;
    return UNKNOWN_VALUE;
  }
  return OTHER_VALUE;
}

function declareAstPattern(pattern, value, scope) {
  const target = unwrapAst(pattern);
  if (!target) return;
  if (target.type === "Identifier") { scope.declare(target.name, value); return; }
  if (target.type === "RestElement") { declareAstPattern(target.argument, value?.kind === "object" ? value : ARRAY_VALUE, scope); return; }
  if (target.type === "AssignmentPattern") { declareAstPattern(target.left, value, scope); return; }
  if (target.type === "ArrayPattern") {
    for (let index = 0; index < (target.elements || []).length; index += 1) {
      const element = target.elements[index];
      if (element) declareAstPattern(element, element.type === "RestElement" ? ARRAY_VALUE : value?.elements?.[index] || UNKNOWN_VALUE, scope);
    }
    return;
  }
  if (target.type === "ObjectPattern") {
    for (const property of target.properties || []) {
      if (property.type === "RestElement") { declareAstPattern(property.argument, value?.kind === "object" ? value : OTHER_VALUE, scope); continue; }
      const key = property.computed ? astPropertyName(property.key, scope) : astPropertyName(property.key);
      declareAstPattern(property.value, value?.kind === "object" && key != null ? value.props.get(key) || OTHER_VALUE : OTHER_VALUE, scope);
    }
  }
}

function assignAstTarget(targetNode, value, scope, state) {
  const target = unwrapAst(targetNode);
  if (target?.type === "Identifier") { scope.assign(target.name, value); return; }
  if (["ObjectPattern", "ArrayPattern", "AssignmentPattern", "RestElement"].includes(target?.type)) { assignAstPattern(target, value, scope, state); return; }
  if (!["MemberExpression", "OptionalMemberExpression"].includes(target?.type)) return;
  const object = evaluateAst(target.object, scope, state);
  if (object?.kind !== "object") return;
  const property = target.computed ? astPropertyName(target.property, scope) : astPropertyName(target.property);
  if (property == null) {
    object.unknownProps = true;
    for (const key of object.props.keys()) object.props.set(key, joinAstValues([object.props.get(key), value]));
  }
  else object.props.set(property, value);
}

function assignAstPattern(pattern, value, scope, state) {
  const target = unwrapAst(pattern);
  if (!target) return;
  if (target.type === "Identifier") { scope.assign(target.name, value); return; }
  if (target.type === "AssignmentPattern") { assignAstPattern(target.left, value, scope, state); return; }
  if (target.type === "RestElement") { assignAstPattern(target.argument, value, scope, state); return; }
  if (target.type === "ArrayPattern") {
    for (let index = 0; index < (target.elements || []).length; index += 1) {
      const element = target.elements[index];
      if (element) assignAstPattern(element, element.type === "RestElement" ? ARRAY_VALUE : value?.elements?.[index] || UNKNOWN_VALUE, scope, state);
    }
    return;
  }
  if (target.type === "ObjectPattern") {
    for (const property of target.properties || []) {
      if (property.type === "RestElement") { assignAstPattern(property.argument, value?.kind === "object" ? value : OTHER_VALUE, scope, state); continue; }
      const key = property.computed ? astPropertyName(property.key, scope) : astPropertyName(property.key);
      assignAstPattern(property.value, value?.kind === "object" && key != null ? value.props.get(key) || OTHER_VALUE : OTHER_VALUE, scope, state);
    }
  }
}
function applyAstAssignment(node, scope, state) {
  const value = evaluateAst(node.right, scope, state);
  assignAstTarget(node.left, value, scope, state);
  return value;
}

function declareAstFunctionParameters(fnValue, args, state, functionScope) {
  for (let index = 0; index < (fnValue.node.params || []).length; index += 1) {
    const parameter = fnValue.node.params[index];
    if (parameter.type === "AssignmentPattern" && index >= (args?.length || 0)) {
      declareAstPattern(parameter.left, evaluateAst(parameter.right, functionScope, state), functionScope);
      continue;
    }
    declareAstPattern(parameter, evaluateAst(args?.[index], state?.scope || fnValue.scope, state), functionScope);
  }
}

function executeAstFunction(fnValue, args, state, target = null) {
  if (fnValue?.kind !== "function" || state?.activeFunctions?.has(fnValue.node)) return null;
  const functionScope = new AstScope(fnValue.scope);
  declareAstFunctionParameters(fnValue, args, state, functionScope);
  state?.activeFunctions?.add(fnValue.node);
  const result = target ? executeAstToward(fnValue.node.body, functionScope, target, state) : executeAstStatement(fnValue.node.body, functionScope, state);
  state?.activeFunctions?.delete(fnValue.node);
  return result;
}
function evaluateDirectBranchReturns(node, scope, state) {
  if (!node) return [];
  if (node.type === "ReturnStatement") return [evaluateAst(node.argument, scope, state)];
  if (node.type === "IfStatement") return [...evaluateDirectBranchReturns(node.consequent, new AstScope(scope), state), ...evaluateDirectBranchReturns(node.alternate, new AstScope(scope), state)];
  if (node.type !== "BlockStatement") return [];
  const blockScope = new AstScope(scope);
  const values = [];
  for (const statement of node.body || []) {
    if (["VariableDeclaration", "FunctionDeclaration"].includes(statement.type)) executeAstStatement(statement, blockScope, state);
    else if (statement.type === "ReturnStatement") { values.push(evaluateAst(statement.argument, blockScope, state)); break; }
    else if (statement.type === "IfStatement") values.push(...evaluateDirectBranchReturns(statement, blockScope, state));
  }
  return values;
}
function astAlwaysReturns(node) {
  if (!node) return false;
  if (node.type === "ReturnStatement" || node.type === "ThrowStatement") return true;
  if (node.type === "IfStatement") return Boolean(node.alternate) && astAlwaysReturns(node.consequent) && astAlwaysReturns(node.alternate);
  if (node.type === "BlockStatement") return (node.body || []).some((statement) => astAlwaysReturns(statement));
  return false;
}
function evaluateAstFunctionResult(fnValue, args, state) {
  if (fnValue?.kind !== "function" || state?.activeFunctions?.has(fnValue.node)) return null;
  const functionScope = new AstScope(fnValue.scope);
  declareAstFunctionParameters(fnValue, args, state, functionScope);
  if (fnValue.node.body?.type !== "BlockStatement") return evaluateAst(fnValue.node.body, functionScope, state);
  const statements = (fnValue.node.body.body || []).filter((statement) => statement.type !== "EmptyStatement");
  const alternativeReturns = [];
  for (const statement of statements) {
    if (["VariableDeclaration", "FunctionDeclaration"].includes(statement.type)) executeAstStatement(statement, functionScope, state);
    else if (statement.type === "IfStatement") {
      alternativeReturns.push(...evaluateDirectBranchReturns(statement, functionScope, state));
      if (astAlwaysReturns(statement)) return joinAstValues(alternativeReturns);
    }
    else if (statement.type === "ReturnStatement") return joinAstValues([...alternativeReturns, evaluateAst(statement.argument, functionScope, state)]);
    else return null;
  }
  return alternativeReturns.length ? UNKNOWN_VALUE : null;
}
function executeAstCall(node, scope, state) {
  const callee = unwrapAst(node.callee);
  const fn = ["FunctionExpression", "ArrowFunctionExpression"].includes(callee?.type) ? functionValue(callee, scope) : evaluateAst(callee, scope, state);
  if (fn?.kind === "function") return executeAstFunction(fn, node.arguments, { ...(state || {}), scope }, null);
  return evaluateAst(node, scope, state);
}

function executeAstStatement(node, scope, state) {
  if (!node) return "normal";
  if (node.type === "Program" || node.type === "BlockStatement") {
    const blockScope = node.type === "BlockStatement" ? new AstScope(scope) : scope;
    for (const statement of node.body || []) {
      const completion = executeAstStatement(statement, blockScope, state);
      if (completion !== "normal") return completion;
    }
    return "normal";
  }
  if (node.type === "VariableDeclaration") {
    for (const declaration of node.declarations) declareAstPattern(declaration.id, evaluateAst(declaration.init, scope, state), scope);
    return "normal";
  }
  if (node.type === "ImportDeclaration") {
    const source = String(node.source?.value || "");
    for (const specifier of node.specifiers || []) {
      const imported = specifier.imported?.name || specifier.imported?.value || (specifier.type === "ImportDefaultSpecifier" ? "default" : "*");
      let binding = { kind: "import", source, imported };
      if (trustedSupabaseModule(source) && imported === "createClient") binding = { kind: "supabase-create-client" };
      else if (trustedSupabaseModule(source) && specifier.type === "ImportNamespaceSpecifier") binding = { kind: "object", props: new Map([["createClient", { kind: "supabase-create-client" }]]), unknownProps: true };
      scope.declare(specifier.local?.name, binding);
    }
    return "normal";
  }
  if (node.type === "FunctionDeclaration") { scope.declare(node.id?.name, functionValue(node, scope)); return "normal"; }
  if (node.type === "ExpressionStatement") {
    const expression = unwrapAst(node.expression);
    if (["CallExpression", "OptionalCallExpression"].includes(expression?.type)) executeAstCall(expression, scope, state);
    else evaluateAst(expression, scope, state);
    return "normal";
  }
  if (node.type === "IfStatement") {
    return executeAstAlternatives(scope, state, [() => executeAstStatement(node.consequent, new AstScope(scope), state), ...(node.alternate ? [() => executeAstStatement(node.alternate, new AstScope(scope), state)] : [])], !node.alternate);
  }
  if (node.type === "TryStatement") {
    const completion = executeAstAlternatives(scope, state, [() => executeAstStatement(node.block, new AstScope(scope), state), ...(node.handler ? [() => executeAstStatement(node.handler.body, new AstScope(scope), state)] : [])], !node.handler);
    if (node.finalizer) {
      const finalCompletion = executeAstStatement(node.finalizer, new AstScope(scope), state);
      if (finalCompletion !== "normal") return finalCompletion;
    }
    return completion;
  }
  if (node.type === "SwitchStatement") {
    const alternatives = (node.cases || []).map((_, start) => () => {
      const switchScope = new AstScope(scope);
      for (let index = start; index < node.cases.length; index += 1) {
        for (const statement of node.cases[index].consequent || []) {
          const completion = executeAstStatement(statement, switchScope, state);
          if (completion === "break") return "normal";
          if (completion !== "normal") return completion;
        }
      }
      return "normal";
    });
    return executeAstAlternatives(scope, state, alternatives, !(node.cases || []).some((entry) => entry.test == null));
  }
  if (node.type === "LabeledStatement") {
    const completion = executeAstStatement(node.body, new AstScope(scope), state);
    if (completion === `break:${node.label?.name}`) return "normal";
    if (completion === `continue:${node.label?.name}` && ["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"].includes(node.body?.type)) return "normal";
    return completion;
  }
  if (["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement"].includes(node.type)) {
    const completion = executeAstAlternatives(scope, state, [() => executeAstStatement(node.body, new AstScope(scope), state)], true);
    return completion.startsWith?.("break:") || completion.startsWith?.("continue:") ? completion : "normal";
  }
  if (node.type === "DoWhileStatement") {
    const first = executeAstStatement(node.body, new AstScope(scope), state);
    if (first === "return" || first === "throw") return first;
    if (first === "break") return "normal";
    const completion = executeAstAlternatives(scope, state, [() => executeAstStatement(node.body, new AstScope(scope), state)], true);
    return completion.startsWith?.("break:") || completion.startsWith?.("continue:") ? completion : "normal";
  }
  if (node.type === "ReturnStatement") { evaluateAst(node.argument, scope, state); return "return"; }
  if (node.type === "ThrowStatement") { evaluateAst(node.argument, scope, state); return "throw"; }
  if (node.type === "BreakStatement") return node.label?.name ? `break:${node.label.name}` : "break";
  if (node.type === "ContinueStatement") return node.label?.name ? `continue:${node.label.name}` : "continue";
  for (const child of astChildren(node)) {
    const completion = executeAstStatement(child, scope, state);
    if (completion !== "normal") return completion;
  }
  return "normal";
}

function executeAstToward(node, scope, target, state) {
  if (!astContains(node, target.start)) return null;
  if (node.type === "Program" || node.type === "BlockStatement") {
    const blockScope = node.type === "BlockStatement" ? new AstScope(scope) : scope;
    for (const statement of node.body || []) {
      if (statement.end <= target.start) {
        const completion = executeAstStatement(statement, blockScope, state);
        if (completion !== "normal") return null;
      }
      else if (astContains(statement, target.start)) return executeAstToward(statement, blockScope, target, state);
      else break;
    }
    return blockScope;
  }
  if (node.type === "FunctionDeclaration" && astContains(node.body, target.start)) {
    return executeAstFunction(functionValue(node, scope), [], state, target);
  }
  if (node.type === "ReturnStatement") {
    const returned = unwrapAst(node.argument);
    if (["FunctionExpression", "ArrowFunctionExpression"].includes(returned?.type) && astContains(returned.body, target.start)) {
      return executeAstFunction(functionValue(returned, scope), [], state, target);
    }
    return scope;
  }
  if (node.type === "IfStatement") {
    if (astContains(node.consequent, target.start)) return executeAstToward(node.consequent, new AstScope(scope), target, state);
    if (node.alternate && astContains(node.alternate, target.start)) return executeAstToward(node.alternate, new AstScope(scope), target, state);
  }
  if (node.type === "TryStatement") {
    for (const part of [node.block, node.handler?.body, node.finalizer]) if (part && astContains(part, target.start)) return executeAstToward(part, new AstScope(scope), target, state);
  }
  if (["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"].includes(node.type) && astContains(node.body, target.start)) return executeAstToward(node.body, new AstScope(scope), target, state);
  if (node.type === "ExpressionStatement") {
    let containingFunction = null;
    walkAst(node.expression, (child) => { if (!containingFunction && ["FunctionExpression", "ArrowFunctionExpression"].includes(child.type) && astContains(child.body, target.start)) containingFunction = child; });
    if (containingFunction) return executeAstFunction(functionValue(containingFunction, scope), [], state, target);
  }
  for (const child of astChildren(node)) if (astContains(child, target.start)) return executeAstToward(child, scope, target, state);
  return scope;
}

function returnedInlineCallbackAst(dispatch, source) {
  const ast = actionAst(source);
  if (!ast) return { parsed: false, wrapper: false };
  const dispatchStart = source.indexOf(dispatch);
  const dispatchEnd = dispatchStart + dispatch.length;
  let targetReturn = null;
  let targetCall = null;
  const returns = [];
  const visit = (node, functionDepth = 0) => {
    if (!node?.type || node.end < dispatchStart || node.start > dispatchEnd) return;
    if (node.type === "ReturnStatement" && node.start >= dispatchStart && node.end <= dispatchEnd) returns.push({ node, functionDepth });
    for (const child of astChildren(node)) {
      const nestedFunction = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ObjectMethod", "ClassMethod"].includes(child.type);
      visit(child, functionDepth + (nestedFunction ? 1 : 0));
    }
  };
  visit(ast.program);
  const minimumFunctionDepth = Math.min(...returns.map((entry) => entry.functionDepth));
  for (const entry of returns) {
    if (entry.functionDepth !== minimumFunctionDepth) continue;
    const call = returnedCallbackCall(entry.node);
    if (call) { targetReturn = entry.node; targetCall = call; break; }
  }
  if (!targetCall) return { parsed: true, wrapper: false };
  const rootScope = new AstScope();
  const state = { activeFunctions: new Set(), scope: rootScope };
  const callScope = executeAstToward(ast.program, rootScope, targetReturn, state) || rootScope;
  const callee = unwrapAst(targetCall.callee);
  if (!["MemberExpression", "OptionalMemberExpression"].includes(callee?.type)) return { parsed: true, wrapper: true };
  const method = callee.computed ? astPropertyName(callee.property, callScope) : astPropertyName(callee.property);
  const receiver = evaluateAst(callee.object, callScope, state);
  return { parsed: true, wrapper: !(receiver?.kind === "array" && ARRAY_CALLBACK_METHODS.has(method)) };
}

function handlerAnalysis(dispatch, source, handlerHint = null, options = {}) {
  const ignored = new Set(["jsonResponse", "Response", "cleanText", "String", "Number", "Boolean", "Object", "Array", "Date", "Set", "Map"]);
  const returnedMatch = /return\s+(?:jsonResponse\s*\(\s*)?(?:await\s+)?([A-Za-z_$][\w$]*(?:(?:\s*(?:\.|\?\.)\s*[A-Za-z_$][\w$]*)|(?:\s*(?:\?\.)?\s*\[\s*[^\]\r\n]+\s*\]))*)\s*(?:\?\.)?\s*\(/.exec(dispatch);
  const returnedCallee = returnedMatch?.[1]?.replace(/\s+/g, "") || null;
  const returned = returnedCallee && /^[A-Za-z_$][\w$]*$/.test(returnedCallee) ? returnedCallee : null;
  const assignedReturn = /const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+([A-Za-z_$][\w$]*)\s*\([\s\S]*?return\s+jsonResponse\s*\(\s*\1\s*\)/.exec(dispatch)?.[2] || null;
  const astCallback = returnedInlineCallbackAst(dispatch, source);
  const callbackWrapper = astCallback.parsed ? (astCallback.wrapper ? { root: "ast-undetermined" } : null) : { root: "ast-parse-failure" };
  if (callbackWrapper && !ignored.has(callbackWrapper.root)) {
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
  for (const match of allMatches(/\bfrom\b/g, source)) {
    const quote = skipJsTrivia(source, match.index + match[0].length);
    const literal = /^(["'])([^"']+)\1/.exec(source.slice(quote));
    if (literal) staticReferences.push({ specifier: literal[2], kind: "static" });
  }
  for (const match of allMatches(/\bimport\b/g, source)) {
    const quote = skipJsTrivia(source, match.index + match[0].length);
    const literal = /^(["'])([^"']+)\1/.exec(source.slice(quote));
    if (literal) staticReferences.push({ specifier: literal[2], kind: "static-side-effect" });
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
    for (const item of allMatches(/\bcase\b/g, block)) {
      const expressionStart = skipJsTrivia(block, item.index + item[0].length);
      if (/^`[^`]*\$\{/.test(block.slice(expressionStart))) {
        candidates.push({ code: "DYNAMIC_TEMPLATE_ACTION", detail: "dynamic-switch-case" });
        break;
      }
    }
  }
  out.candidates = candidates;
  return out;
}

function skipJsTrivia(source, start) {
  let index = start;
  while (index < source.length) {
    if (/\s/.test(source[index])) { index += 1; continue; }
    if (source[index] === "/" && source[index + 1] === "/") {
      const end = source.indexOf("\n", index + 2);
      index = end < 0 ? source.length : end + 1;
      continue;
    }
    if (source[index] === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end < 0 ? source.length : end + 2;
      continue;
    }
    break;
  }
  return index;
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

function selectorDispatchScope(source) {
  const fallback = Math.max(0, source.indexOf("Deno.serve"));
  const ast = actionAst(source);
  if (!ast) return { minimum: fallback, candidates: [] };

  const serveCalls = [];
  walkAst(ast.program, (node) => {
    if (node.type !== "CallExpression") return;
    const callee = unwrapAst(node.callee);
    if (
      callee?.type === "MemberExpression" &&
      unwrapAst(callee.object)?.type === "Identifier" &&
      unwrapAst(callee.object)?.name === "Deno" &&
      astPropertyName(callee.property) === "serve"
    ) serveCalls.push(node);
  });
  if (serveCalls.length !== 1) return { minimum: fallback, candidates: [] };

  const argument = unwrapAst(serveCalls[0].arguments[0]);
  if (["ArrowFunctionExpression", "FunctionExpression"].includes(argument?.type)) {
    return { minimum: serveCalls[0].start ?? fallback, candidates: [] };
  }

  const factoryCall = argument?.type === "CallExpression" ? argument : null;
  const handlerName = factoryCall
    ? (factoryCall.arguments.length === 0 && unwrapAst(factoryCall.callee)?.type === "Identifier" ? unwrapAst(factoryCall.callee).name : null)
    : (argument?.type === "Identifier" ? argument.name : null);
  if (!handlerName) return { minimum: fallback, candidates: [] };

  const declarations = [];
  walkAst(ast.program, (node) => {
    if (node.type === "FunctionDeclaration" && node.id?.name === handlerName) declarations.push(node);
  });
  if (declarations.length !== 1) {
    return {
      minimum: fallback,
      candidates: [{ code: "UNRESOLVED_EDGE_HANDLER_FACTORY", detail: handlerName }]
    };
  }
  return { minimum: declarations[0].start ?? fallback, candidates: [] };
}

export function discoverSelectorSurfacesFromText(functionName, sourceFile, source, _legacyRegex, options = {}) {
  const scope = selectorDispatchScope(source);
  const dispatch = dispatchAnalysis(source, scope.minimum);
  dispatch.candidates.push(...scope.candidates);
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
    const reviewedAuthorizationValue = reviewedAuthorization[entry.canonicalId];
    if (!reviewedAuthorizationValue) issues.push(issue("error", "AUTHORIZATION_FINGERPRINT_MISSING", entry.canonicalId, "Authorization dependency envelope has no reviewed fingerprint."));
    else if (!validReviewedAuthorization(reviewedAuthorizationValue)) issues.push(issue("error", "INVALID_AUTHORIZATION_FINGERPRINT", entry.canonicalId, "Reviewed authorization fingerprints must be unique lower-case SHA-256 values."));
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
    if (!reviewedAuthorizationMatches(reviewedAuthorization[actual.canonicalId], actual.authorizationFingerprint)) issues.push(issue("error", "AUTHORIZATION_ENVELOPE_CHANGED", actual.canonicalId, "Authorization/shared dependency envelope changed; review and refresh deliberately."));
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
    authorizationFingerprintMatches: reviewedAuthorizationMatches(contract.reviewedAuthorizationFingerprints?.[entry.canonicalId], actual.get(entry.canonicalId)?.authorizationFingerprint) ? "yes" : "no",
    metadataFingerprintMatches: metadataFingerprint(entry) === contract.reviewedMetadataFingerprints?.[entry.canonicalId] ? "yes" : "no"
  }));
}
