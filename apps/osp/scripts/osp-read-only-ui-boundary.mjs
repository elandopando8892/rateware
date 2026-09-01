import { createHash } from 'node:crypto';
import { access, constants } from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';

import ts from '../node_modules/typescript/lib/typescript.js';

const SOURCE_ROOT = 'apps/osp/src/';
const ENTRYPOINT = 'apps/osp/src/main.tsx';
const SOURCE_EXTENSIONS = ['.css', '.ts', '.tsx'];
const BUILD_DETERMINANT_PATHS = new Set([
  'apps/osp/index.html',
  'apps/osp/package.json',
  'apps/osp/patches/@kinde-oss__kinde-auth-pkce-js@4.5.1.patch',
  'apps/osp/pnpm-lock.yaml',
  'apps/osp/pnpm-workspace.yaml',
  'apps/osp/tsconfig.json',
  'apps/osp/vercel.json',
  'apps/osp/vite.config.ts',
]);
const APP_ROOT = 'apps/osp/';
const VITE_CONFIG_PATH = 'apps/osp/vite.config.ts';
const ALTERNATE_VITE_CONFIG_PATHS = new Set([
  'apps/osp/vite.config.js',
  'apps/osp/vite.config.mjs',
  'apps/osp/vite.config.cjs',
  'apps/osp/vite.config.mts',
  'apps/osp/vite.config.cts',
]);
const OPERATIONAL_CONTROL_NAMES = new Set([
  'approve', 'authorize', 'digitalsignature', 'oauth', 'renew', 'send', 'signature', 'sync', 'upload',
]);
const OUTBOUND_DRAFT_COMPOSER_PATH = 'apps/osp/src/features/approval/FinalResponseComposer.tsx';
const REQUEST_REVIEW_WORKBENCH_PATH = 'apps/osp/src/features/cases/AdaptiveReviewWorkbench.tsx';
const OUTBOUND_DRAFT_ALLOWED_IMPORTS = new Set(['../../api/contracts', 'react']);
const REQUEST_REVIEW_ALLOWED_IMPORTS = new Set(['../../api/contracts', '@tanstack/react-router', 'react']);
const OUTBOUND_DRAFT_FORBIDDEN_CALLS = new Set([
  'approveandapplysignature',
  'authorizeoutboundpayload',
  'completeoperationsreview',
  'fetch',
  'freezeoutboundpayload',
  'open',
  'postmessage',
  'requestauthorizedsend',
  'send',
  'sendbeacon',
  'uploaddocumentversion',
]);
const OUTBOUND_DRAFT_FORBIDDEN_CONSTRUCTORS = new Set(['eventsource', 'websocket', 'xmlhttprequest']);

function fail(code) {
  throw new Error(code);
}

function hasExactKeys(value, expected) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value)) === JSON.stringify(expected);
}

function compareCanonicalPath(left, right) {
  const foldedLeft = left.toLocaleLowerCase('en-US');
  const foldedRight = right.toLocaleLowerCase('en-US');
  if (foldedLeft < foldedRight) return -1;
  if (foldedLeft > foldedRight) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function isNormalizedSourcePath(value) {
  if (typeof value !== 'string' || !value.startsWith(SOURCE_ROOT) || value.includes('\\')) return false;
  const segments = value.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..' ||
      !/^[A-Za-z0-9._-]+$/.test(segment))) return false;
  if (!SOURCE_EXTENSIONS.some((extension) => value.endsWith(extension))) return false;
  const name = segments.at(-1);
  return !!name && !name.endsWith('.d.ts') && !name.includes('.test.') &&
    !name.includes('.spec.') && !name.includes('.compile.') && !value.startsWith(`${SOURCE_ROOT}test/`);
}

function isNormalizedBuildInputPath(value) {
  return BUILD_DETERMINANT_PATHS.has(value) || ALTERNATE_VITE_CONFIG_PATHS.has(value) ||
    isNormalizedSourcePath(value) || isNormalizedTsconfigPath(value);
}

function isNormalizedTsconfigPath(value) {
  if (typeof value !== 'string' || !value.startsWith(APP_ROOT) || value.includes('\\') || !value.endsWith('.json')) {
    return false;
  }
  const segments = value.split('/');
  const name = segments.at(-1);
  return !!name && /^tsconfig(?:[A-Za-z0-9._-]*)\.json$/.test(name) &&
    segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..' && /^[A-Za-z0-9._-]+$/.test(segment));
}

function localTsconfigReference(fromPath, value) {
  if (typeof value !== 'string' || !value.startsWith('.')) fail('UI_TSCONFIG_REFERENCE');
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), value));
  const candidate = base.endsWith('.json') ? base : `${base}.json`;
  if (!isNormalizedTsconfigPath(candidate)) fail('UI_TSCONFIG_REFERENCE');
  return candidate;
}

function tsconfigReferences(source) {
  let config;
  try {
    config = JSON.parse(source.text);
  } catch {
    fail('UI_TSCONFIG_PARSE');
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) fail('UI_TSCONFIG_PARSE');
  const references = [];
  if (Object.hasOwn(config, 'extends')) references.push(localTsconfigReference(source.path, config.extends));
  if (Object.hasOwn(config, 'references')) {
    if (!Array.isArray(config.references)) fail('UI_TSCONFIG_REFERENCE');
    for (const reference of config.references) {
      if (!reference || typeof reference !== 'object' || Array.isArray(reference) ||
          Object.keys(reference).length !== 1 || typeof reference.path !== 'string') {
        fail('UI_TSCONFIG_REFERENCE');
      }
      references.push(localTsconfigReference(source.path, reference.path));
    }
  }
  return references;
}

function assertTsconfigClosure(verifiedInputs) {
  const byPath = new Map(verifiedInputs.map((source) => [source.path, source]));
  const pending = ['apps/osp/tsconfig.json'];
  const expected = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    if (expected.has(current)) continue;
    const source = byPath.get(current);
    if (!source) fail('UI_TSCONFIG_CLOSURE');
    expected.add(current);
    for (const reference of tsconfigReferences(source)) pending.push(reference);
  }
  const actual = verifiedInputs.filter((source) => isNormalizedTsconfigPath(source.path)).map((source) => source.path).sort();
  if (JSON.stringify([...expected].sort()) !== JSON.stringify(actual)) fail('UI_TSCONFIG_CLOSURE');
}

function assertNoAlternateViteConfig(verifiedInputs) {
  if (verifiedInputs.some((source) => ALTERNATE_VITE_CONFIG_PATHS.has(source.path)) ||
      !verifiedInputs.some((source) => source.path === VITE_CONFIG_PATH)) {
    fail('UI_VITE_CONFIG_ALTERNATE');
  }
}

export async function assertNoAlternateViteConfigOnDisk(appRoot) {
  for (const alternatePath of ALTERNATE_VITE_CONFIG_PATHS) {
    const filename = path.posix.basename(alternatePath);
    try {
      await access(path.join(appRoot, filename), constants.F_OK);
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') continue;
      fail('UI_VITE_CONFIG_ALTERNATE');
    }
    fail('UI_VITE_CONFIG_ALTERNATE');
  }
}

function parseManifest(rawManifestBytes) {
  if (!(rawManifestBytes instanceof Uint8Array)) fail('UI_MANIFEST_CANONICAL');
  if (rawManifestBytes[0] === 0xef && rawManifestBytes[1] === 0xbb && rawManifestBytes[2] === 0xbf) {
    fail('UI_MANIFEST_CANONICAL');
  }
  let rawText;
  try {
    rawText = new TextDecoder('utf-8', { fatal: true }).decode(rawManifestBytes);
  } catch {
    fail('UI_MANIFEST_ENCODING');
  }
  let manifest;
  try {
    manifest = JSON.parse(rawText);
  } catch {
    fail('UI_MANIFEST_PARSE');
  }
  if (rawText !== `${JSON.stringify(manifest, null, 2)}\n`) fail('UI_MANIFEST_CANONICAL');
  if (!hasExactKeys(manifest, ['schema_version', 'algorithm', 'entrypoint', 'files']) ||
      manifest.schema_version !== 2 || manifest.algorithm !== 'sha256' ||
      manifest.entrypoint !== ENTRYPOINT || !Array.isArray(manifest.files)) {
    fail('UI_MANIFEST_SCHEMA');
  }

  const entries = new Map();
  const caseFolded = new Set();
  let previousPath;
  for (const entry of manifest.files) {
    if (!hasExactKeys(entry, ['kind', 'path', 'sha256']) || entry.kind !== 'production-ui' ||
        typeof entry.path !== 'string' || typeof entry.sha256 !== 'string') {
      fail('UI_MANIFEST_SCHEMA');
    }
    const folded = entry.path.toLocaleLowerCase('en-US');
    if (!isNormalizedBuildInputPath(entry.path) || entries.has(entry.path) || caseFolded.has(folded) ||
        (previousPath !== undefined && compareCanonicalPath(previousPath, entry.path) >= 0)) {
      fail('UI_MANIFEST_INVENTORY');
    }
    if (!/^[a-f0-9]{64}$/.test(entry.sha256)) fail('UI_MANIFEST_HASH');
    entries.set(entry.path, entry.sha256);
    caseFolded.add(folded);
    previousPath = entry.path;
  }
  if (!entries.has(ENTRYPOINT) ||
      [...BUILD_DETERMINANT_PATHS].some((inputPath) => !entries.has(inputPath))) {
    fail('UI_MANIFEST_INVENTORY');
  }
  return entries;
}

function verifyFingerprints(sources, manifestEntries) {
  if (!Array.isArray(sources)) fail('UI_SOURCE_INVENTORY');
  const sourcesByPath = new Map();
  const caseFolded = new Set();
  for (const source of sources) {
    if (!source || typeof source !== 'object' || !isNormalizedBuildInputPath(source.path) ||
        sourcesByPath.has(source.path) || caseFolded.has(source.path.toLocaleLowerCase('en-US'))) {
      fail('UI_SOURCE_INVENTORY');
    }
    sourcesByPath.set(source.path, source);
    caseFolded.add(source.path.toLocaleLowerCase('en-US'));
  }
  const actualPaths = [...sourcesByPath.keys()].sort(compareCanonicalPath);
  const expectedPaths = [...manifestEntries.keys()];
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) fail('UI_SOURCE_INVENTORY');

  const decoder = new TextDecoder('utf-8', { fatal: true });
  return expectedPaths.map((sourcePath) => {
    const source = sourcesByPath.get(sourcePath);
    if (!(source.bytes instanceof Uint8Array)) fail('UI_SOURCE_HASH');
    const hash = createHash('sha256').update(source.bytes).digest('hex');
    if (hash !== manifestEntries.get(sourcePath)) fail('UI_SOURCE_HASH');
    let text;
    try {
      text = decoder.decode(source.bytes);
    } catch {
      fail('UI_SOURCE_ENCODING');
    }
    return { path: sourcePath, text };
  });
}

function parseTypeScript(source, sourcePath) {
  const kind = sourcePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, kind);
  if (file.parseDiagnostics.length !== 0) fail('UI_SOURCE_PARSE');
  return file;
}

function visit(node, operation) {
  operation(node);
  ts.forEachChild(node, (child) => visit(child, operation));
}

function jsxName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return `${jsxName(node.expression)}.${node.name.text}`;
  if (ts.isJsxNamespacedName(node)) return `${node.namespace.text}:${node.name.text}`;
  return '';
}

function normalizedControlName(value) {
  return value.split('.').at(-1)?.replace(/[^A-Za-z]/g, '').toLowerCase() ?? '';
}

function assertSafeElementName(name, allowDocumentMutation = false) {
  const normalized = name.toLowerCase();
  if (['embed', 'iframe', 'object'].includes(normalized)) fail('UI_EMBEDDED_CONTENT');
  if (normalized === 'form' && !allowDocumentMutation) fail('UI_MUTATION_CONTROL');
  if (OPERATIONAL_CONTROL_NAMES.has(normalizedControlName(name))) fail('UI_OPERATIONAL_CONTROL');
}

function assertSafeJsxAttributes(attributes, allowDocumentMutation = false) {
  for (const attribute of attributes.properties) {
    if (!ts.isJsxAttribute(attribute)) continue;
    const name = attribute.name.getText();
    if (name === 'dangerouslySetInnerHTML') fail('UI_DANGEROUS_HTML');
    if (name === 'type' && attribute.initializer && ts.isStringLiteral(attribute.initializer) &&
        attribute.initializer.text.toLowerCase() === 'file') {
      if (!allowDocumentMutation) fail('UI_MUTATION_CONTROL');
      const accept = attributes.properties.find((candidate) => ts.isJsxAttribute(candidate) && candidate.name.getText() === 'accept');
      if (!accept || !accept.initializer || !ts.isStringLiteral(accept.initializer) ||
          accept.initializer.text !== 'application/pdf,image/jpeg,image/png,image/tiff') fail('UI_MUTATION_CONTROL');
    }
  }
}

function isCreateElementCall(expression) {
  if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'createElement') return true;
  return ts.isIdentifier(expression) && expression.text === 'createElement';
}

function expressionName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return `${expressionName(expression.expression)}.${expression.name.text}`;
  if (ts.isElementAccessExpression(expression) && expression.argumentExpression &&
      ts.isStringLiteral(expression.argumentExpression)) {
    return `${expressionName(expression.expression)}.${expression.argumentExpression.text}`;
  }
  return '';
}

function literalJsxAttribute(attributes, attributeName) {
  const attribute = attributes.properties.find((candidate) =>
    ts.isJsxAttribute(candidate) && candidate.name.getText() === attributeName);
  return attribute && attribute.initializer && ts.isStringLiteral(attribute.initializer)
    ? attribute.initializer.text
    : undefined;
}

function assertGovernedOutboundDraftSurface(file, sourcePath) {
  if (sourcePath.replace(/\\/g, '/') !== OUTBOUND_DRAFT_COMPOSER_PATH) return;
  const imports = [];
  let composerDeclarations = 0;
  let saveCalls = 0;
  let actionButtons = 0;
  visit(file, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'FinalResponseComposer') {
      composerDeclarations += 1;
      const binding = node.parameters[0]?.name;
      if (!binding || !ts.isObjectBindingPattern(binding) ||
          JSON.stringify(binding.elements.map((element) => element.name.getText()).sort()) !==
            JSON.stringify(['initialBodyText', 'onDirtyChange', 'onSave', 'replyContext', 'revision', 'signedPackage'])) {
        fail('UI_MUTATION_CONTROL');
      }
    }
    if (ts.isCallExpression(node)) {
      const name = normalizedControlName(expressionName(node.expression));
      if (name === 'onsave') saveCalls += 1;
      if (OUTBOUND_DRAFT_FORBIDDEN_CALLS.has(name)) fail('UI_MUTATION_CONTROL');
    }
    if (ts.isNewExpression(node) &&
        OUTBOUND_DRAFT_FORBIDDEN_CONSTRUCTORS.has(normalizedControlName(expressionName(node.expression)))) {
      fail('UI_MUTATION_CONTROL');
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        jsxName(node.tagName).toLowerCase() === 'button') {
      actionButtons += 1;
      if (literalJsxAttribute(node.attributes, 'type') !== 'button') fail('UI_MUTATION_CONTROL');
    }
  });
  if (composerDeclarations !== 1 || saveCalls !== 1 || actionButtons !== 1 ||
      imports.some((specifier) => !OUTBOUND_DRAFT_ALLOWED_IMPORTS.has(specifier)) ||
      new Set(imports).size !== imports.length) {
    fail('UI_MUTATION_CONTROL');
  }
}

function assertGovernedRequestReviewSurface(file, sourcePath) {
  if (sourcePath.replace(/\\/g, '/') !== REQUEST_REVIEW_WORKBENCH_PATH) return;
  const imports = [];
  let declarations = 0;
  let reviewCalls = 0;
  let forms = 0;
  const buttonTypes = [];
  visit(file, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'AdaptiveReviewWorkbench') declarations += 1;
    if (ts.isCallExpression(node)) {
      const name = normalizedControlName(expressionName(node.expression));
      if (name === 'onsavereview') reviewCalls += 1;
      if (OUTBOUND_DRAFT_FORBIDDEN_CALLS.has(name) || ['assemblecaseprofiledraft', 'bindcaseprofile'].includes(name)) fail('UI_MUTATION_CONTROL');
    }
    if (ts.isNewExpression(node) && OUTBOUND_DRAFT_FORBIDDEN_CONSTRUCTORS.has(normalizedControlName(expressionName(node.expression)))) fail('UI_MUTATION_CONTROL');
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = jsxName(node.tagName).toLowerCase();
      if (name === 'form') forms += 1;
      if (name === 'button') buttonTypes.push(literalJsxAttribute(node.attributes, 'type'));
    }
  });
  if (declarations !== 1 || reviewCalls !== 1 || forms !== 1 ||
      JSON.stringify(buttonTypes.sort()) !== JSON.stringify(['button', 'submit']) ||
      imports.some((specifier) => !REQUEST_REVIEW_ALLOWED_IMPORTS.has(specifier)) || new Set(imports).size !== imports.length) {
    fail('UI_MUTATION_CONTROL');
  }
}

export function assertNoUnsafeUiSyntax(source, sourcePath = 'fixture.tsx') {
  if (sourcePath.endsWith('.css')) return;
  const file = parseTypeScript(source, sourcePath);
  const allowDocumentMutation = sourcePath.replace(/\\/g, '/').endsWith('apps/osp/src/features/documents/QuarterlyDocumentVault.tsx');
  const allowRequestReview = sourcePath.replace(/\\/g, '/') === REQUEST_REVIEW_WORKBENCH_PATH;
  let documentForms = 0;
  let documentFileInputs = 0;
  visit(file, (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const elementName = jsxName(node.tagName).toLowerCase();
      assertSafeElementName(elementName, allowDocumentMutation || allowRequestReview);
      assertSafeJsxAttributes(node.attributes, allowDocumentMutation);
      if (allowDocumentMutation && elementName === 'form') documentForms += 1;
      if (allowDocumentMutation && elementName === 'input' && node.attributes.properties.some((attribute) =>
        ts.isJsxAttribute(attribute) && attribute.name.getText() === 'type' && attribute.initializer && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === 'file')) documentFileInputs += 1;
    }
    if (ts.isCallExpression(node) && isCreateElementCall(node.expression) && node.arguments.length > 0) {
      const element = node.arguments[0];
      if (ts.isStringLiteral(element)) assertSafeElementName(element.text);
      else assertSafeElementName(jsxName(element));
      const properties = node.arguments[1];
      if (properties && ts.isObjectLiteralExpression(properties) && properties.properties.some((property) =>
        ts.isPropertyAssignment(property) && property.name.getText().replace(/["']/g, '') === 'dangerouslySetInnerHTML')) {
        fail('UI_DANGEROUS_HTML');
      }
    }
  });
  if (allowDocumentMutation && (documentForms !== 1 || documentFileInputs !== 1)) fail('UI_MUTATION_CONTROL');
  assertGovernedOutboundDraftSurface(file, sourcePath);
  assertGovernedRequestReviewSurface(file, sourcePath);
}

function cssImports(source) {
  const imports = [];
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) fail('UI_SOURCE_PARSE');
      index = end + 2;
      continue;
    }
    if (source[index] === '"' || source[index] === "'") {
      const quote = source[index++];
      while (index < source.length && source[index] !== quote) {
        if (source[index] === '\\') index += 1;
        index += 1;
      }
      if (index >= source.length) fail('UI_SOURCE_PARSE');
      index += 1;
      continue;
    }
    if (source.startsWith('@import', index) && !/[A-Za-z0-9_-]/.test(source[index + 7] ?? '')) {
      const end = source.indexOf(';', index + 7);
      if (end < 0) fail('UI_SOURCE_PARSE');
      const clause = source.slice(index + 7, end).trim();
      const match = /^(?:url\(\s*)?(["'])([^"']+)\1\s*\)?/.exec(clause);
      if (!match) fail('UI_SOURCE_PARSE');
      imports.push(match[2]);
      index = end + 1;
      continue;
    }
    index += 1;
  }
  return imports;
}

function moduleImports(source) {
  const imports = [];
  const file = parseTypeScript(source.text, source.path);
  visit(file, (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])) fail('UI_IMPORT_DYNAMIC');
      imports.push(node.arguments[0].text);
    }
  });
  return imports;
}

function resolveImport(importer, specifier, sourcePaths) {
  if (!specifier.startsWith('.')) return undefined;
  if (specifier.includes('\\')) fail('UI_IMPORT_ALIAS');
  const importerDirectory = path.posix.dirname(importer);
  const base = path.posix.normalize(path.posix.join(importerDirectory, specifier));
  if (!base.startsWith(SOURCE_ROOT)) fail('UI_IMPORT_OUTSIDE_ROOT');
  const extension = path.posix.extname(base);
  const candidates = extension
    ? [base]
    : SOURCE_EXTENSIONS.flatMap((candidateExtension) => [
      `${base}${candidateExtension}`,
      `${base}/index${candidateExtension}`,
    ]);
  const matches = candidates.filter((candidate) => sourcePaths.has(candidate));
  if (matches.length === 0) fail('UI_IMPORT_MISSING');
  if (matches.length > 1) fail('UI_IMPORT_AMBIGUOUS');
  return matches[0];
}

function assertCompleteImportClosure(sources) {
  const byPath = new Map(sources.map((source) => [source.path, source]));
  const sourcePaths = new Set(byPath.keys());
  const visited = new Set();
  const pending = [ENTRYPOINT];
  while (pending.length > 0) {
    const currentPath = pending.pop();
    if (visited.has(currentPath)) continue;
    const source = byPath.get(currentPath);
    if (!source) fail('UI_IMPORT_MISSING');
    visited.add(currentPath);
    const imports = currentPath.endsWith('.css') ? cssImports(source.text) : moduleImports(source);
    for (const specifier of imports) {
      const resolved = resolveImport(currentPath, specifier, sourcePaths);
      if (resolved && !visited.has(resolved)) pending.push(resolved);
    }
  }
  if (JSON.stringify([...visited].sort()) !== JSON.stringify([...sourcePaths].sort())) {
    fail('UI_IMPORT_CLOSURE');
  }
}

export function assertReadOnlyUiBoundary(sources, rawManifestBytes) {
  const manifestEntries = parseManifest(rawManifestBytes);
  const verifiedInputs = verifyFingerprints(sources, manifestEntries);
  assertNoAlternateViteConfig(verifiedInputs);
  assertTsconfigClosure(verifiedInputs);
  const verifiedSources = verifiedInputs.filter((input) => isNormalizedSourcePath(input.path));
  assertCompleteImportClosure(verifiedSources);
  for (const source of verifiedSources) assertNoUnsafeUiSyntax(source.text, source.path);
}

export async function assertReadOnlyUiBoundaryOnDisk(sources, rawManifestBytes, appRoot) {
  await assertNoAlternateViteConfigOnDisk(appRoot);
  assertReadOnlyUiBoundary(sources, rawManifestBytes);
}
