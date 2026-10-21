import test from "node:test";
import assert from "node:assert/strict";

// fr8onboard-service.js imports the API client, which needs browser globals; test the pure part only.
const source = await import("node:fs").then((fs) => fs.readFileSync(new URL("../src/fr8onboard-service.js", import.meta.url), "utf8"));
const pure = source.replace(/^import .*$/m, "").replace(/export async function fetchFr8OnboardAptos[\s\S]*?\n}\n/, "");
const { fr8OnboardBadgeData } = await import(`data:text/javascript,${encodeURIComponent(pure)}`);

test("no Fr8Onboard row means no badge", () => {
  assert.equal(fr8OnboardBadgeData([]), null);
});

test("cleared vendor shows the validity date", () => {
  const badge = fr8OnboardBadgeData([{ rol: "proveedor", estado: "apto", vigente_hasta: "2026-11-20", entidad_codigo: "XBF_MX" }]);
  assert.deepEqual(badge, { label: "Fr8Onboard: cleared until 2026-11-20", tone: "success", entity: "XBF_MX" });
});

test("suspended vendor is flagged as danger", () => {
  const badge = fr8OnboardBadgeData([{ rol: "proveedor", estado: "suspendido", vigente_hasta: null, entidad_codigo: "XBF_US" }]);
  assert.equal(badge.tone, "danger");
  assert.equal(badge.label, "Fr8Onboard: suspended");
});
