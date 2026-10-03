// Ejecuta los callbacks Deno.serve reales de create-raw-upload e interpret-upload
// con transporte simulado. Espera el patch s15-source-file-role-gates integrado.
// Requiere S15_TYPESCRIPT_PATH (typescript.js; no es dependencia de Rateware).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const tsPath = process.env.S15_TYPESCRIPT_PATH;
if (!tsPath) throw new Error("S15_TYPESCRIPT_PATH is required");
const ts = createRequire(import.meta.url)(tsPath);

const root = path.resolve(import.meta.dirname, "..");
const fnDir = path.join(root, "supabase", "functions");
const SENTINEL = "S15_SENTINEL_RESOLVE";

function transpile(file) {
  const source = readFileSync(file, "utf8");
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function runModule(file, requireFn, context) {
  const module = { exports: {} };
  const wrapped = `(function (require, exports, module) {${transpile(file)}\n})`;
  vm.runInContext(wrapped, context)(requireFn, module.exports, module);
  return module.exports;
}

function makeHarness(fnName, identity, options = {}) {
  const log = [];
  const handlers = [];
  const defaultDb = new Proxy(() => {}, {
    get: (_t, prop) => (prop === "then" ? undefined : (...a) => { log.push(`db:${String(prop)}`); return defaultDb; }),
    apply: () => defaultDb,
  });
  const db = options.approvedRates ? { from(table) {
    log.push(`db:from:${table}`);
    const query = {
      select() { return query; }, eq() { return query; },
      insert() { log.push(`db:insert:${table}`); return query; },
      async single() { return table === "raw_uploads"
        ? { data: { id: "file-a", document_type: "email", owner_email: "org:org_test" }, error: null }
        : { data: null, error: new Error("S15_STOP_BEFORE_PROVIDER") }; },
      then(resolve, reject) { return Promise.resolve({ count: options.approvedRates, error: null }).then(resolve, reject); },
    };
    return query;
  } } : defaultDb;
  const context = vm.createContext({
    Deno: {
      env: { get: () => "test-value" },
      serve: (...args) => { handlers.push(args[args.length - 1]); },
    },
    Response, Request, Headers, URL, TextEncoder, TextDecoder, console,
    fetch: async () => { log.push("fetch"); throw new Error("network blocked"); },
  });
  const jsonResponse = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const stubs = {
    "../_shared/kinde.ts": { corsHeaders: {}, jsonResponse },
    "../_shared/auth.ts": {
      requireRatewareUser: async () => { log.push("requireRatewareUser"); return identity; },
    },
    "../_shared/source-file-access.ts": {
      SOURCE_FILE_ACTIONS: new Proxy({}, { get: (_t, p) => String(p) }),
      resolveSourceFileUser: async () => {
        log.push("resolveSourceFileUser");
        if (options.canonicalMissing) throw Object.assign(new Error("External identity is not registered."), { code: "IDENTITY_NOT_REGISTERED" });
        if (options.approvedRates) return { owner_email: "org:org_test", organization_id: "org_test" };
        throw new Error(SENTINEL);
      },
    },
    "../_shared/runtime-identity.ts": { runtimeIdentityStatus: (error) => error.code === "IDENTITY_NOT_REGISTERED" ? 403 : 500 },
  };
  const teamRolesFile = path.join(fnDir, "_shared", "team-roles.ts");
  const requireFn = (spec) => {
    if (spec.endsWith("_shared/team-roles.ts")) {
      return runModule(teamRolesFile, requireFn, context);
    }
    if (stubs[spec]) return stubs[spec];
    if (/supabase-js|esm\.sh/.test(spec)) return { createClient: () => db };
    return new Proxy({}, {
      get: (_t, p) => (p === "__esModule" ? false : (...a) => { log.push(`unknown:${spec}.${String(p)}`); return undefined; }),
    });
  };
  const handlerFile = path.join(fnDir, fnName, "index.ts");
  runModule(handlerFile, requireFn, context);
  assert.ok(handlers.length > 0, "Deno.serve was not registered");
  const request = {
    method: "POST",
    url: "http://localhost/",
    headers: new Headers({ authorization: "Bearer test" }),
    formData: async () => { log.push("formData"); throw new Error("formData must not run"); },
    json: async () => { log.push("json"); return { raw_upload_id: "00000000-0000-0000-0000-000000000000" }; },
  };
  return { log, handler: handlers[handlers.length - 1], request };
}

const identityWith = (roles) => ({
  user_id: "u1", sub: "u1", email: "x@example.com", organization_id: "org_test",
  roles, app_metadata: roles === undefined ? {} : { roles },
});

for (const fnName of ["create-raw-upload", "interpret-upload"]) {
  for (const [label, roles] of [["viewer", ["viewer"]], ["missing roles", undefined]]) {
    test(`${fnName}: ${label} gets 403 role_forbidden before any side effect`, async () => {
      const h = makeHarness(fnName, identityWith(roles));
      const res = await h.handler(h.request);
      assert.equal(res.status, 403);
      assert.match(await res.text(), /role_forbidden/);
      assert.deepEqual(h.log.filter((e) => e !== "requireRatewareUser"), []);
    });
  }

  for (const role of ["operator", "admin"]) {
    test(`${fnName}: ${role} passes role gate and reaches resolveSourceFileUser sentinel`, async () => {
      const h = makeHarness(fnName, identityWith([role]));
      const res = await h.handler(h.request);
      assert.ok(h.log.includes("resolveSourceFileUser"), "gate must let the role reach canonical resolution");
      assert.ok(!(await res.text()).includes("role_forbidden"));
      assert.ok(!h.log.includes("formData") && !h.log.some((e) => e.startsWith("fetch")));
    });
  }

  test(`${fnName}: gate runs after auth and before canonical identity resolution`, async () => {
    const h = makeHarness(fnName, identityWith(["viewer"]));
    await h.handler(h.request);
    assert.deepEqual(h.log.slice(0, 1), ["requireRatewareUser"]);
    assert.ok(!h.log.includes("resolveSourceFileUser"));
  });
}

test("actual Auth adapter gets roles only from server-managed metadata", async () => {
  const context = vm.createContext({
    Deno: { env: { get: (key) => key === "SUPABASE_URL" ? "https://fixture.invalid" : "fixture" } },
    fetch: async () => ({ ok: true, json: async () => ({ id: "fixture-user", email: "fixture@example.test", email_confirmed_at: "2026-10-02", app_metadata: { roles: ["operator"], rateware_organization_id: "org_test" }, user_metadata: { roles: ["admin"] } }) }),
  });
  const auth = runModule(path.join(fnDir, "_shared", "auth.ts"), () => assert.fail("unexpected import"), context);
  const claims = await auth.requireRatewareUser(new Request("https://fixture.invalid", { headers: { Authorization: "Bearer fixture" } }));
  assert.deepEqual([...claims.roles], ["operator"]);
  assert.equal(claims.rateware_organization_id, "org_test");
});

for (const fnName of ["create-raw-upload", "interpret-upload"]) {
  test(`${fnName}: Operator still needs registered canonical identity`, async () => {
    const h = makeHarness(fnName, identityWith(["operator"]), { canonicalMissing: true });
    const response = await h.handler(h.request);
    assert.equal(response.status, 403);
    assert.match(await response.text(), /External identity is not registered/);
    assert.ok(!h.log.includes("formData") && !h.log.includes("json") && !h.log.some((entry) => entry.startsWith("db:")));
  });
}

for (const role of ["operator", "admin"]) {
  test(`interpret-upload: approved rates still require Admin (${role})`, async () => {
    const h = makeHarness("interpret-upload", identityWith([role]), { approvedRates: 1 });
    const response = await h.handler(h.request);
    if (role === "operator") {
      assert.equal(response.status, 403);
      assert.equal((await response.json()).required, "admin");
      assert.ok(!h.log.includes("db:insert:interpretation_jobs"));
    } else {
      assert.ok(h.log.includes("db:insert:interpretation_jobs"));
      assert.equal(response.status, 500); // Stub stops before any provider call.
    }
    assert.ok(!h.log.includes("fetch"));
  });
}

test("client body cannot elevate role: roles come from identity only", async () => {
  const h = makeHarness("interpret-upload", identityWith(["viewer"]));
  h.request.json = async () => { h.log.push("json"); return { role: "admin", roles: ["admin"], action: "x" }; };
  const res = await h.handler(h.request);
  assert.equal(res.status, 403);
  assert.ok(!h.log.includes("json"));
});
