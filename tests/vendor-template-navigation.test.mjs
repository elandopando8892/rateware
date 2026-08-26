import assert from "node:assert/strict";
import test from "node:test";

import { createVendorTemplateNavigationGuard } from "../src/vendor-template-navigation.js";

function createHarness(initialHref) {
  let href = initialHref;
  let activeTab = "funnel";
  let selectedTemplateId = "";
  let replacements = 0;
  const panels = {
    funnel: { hidden: false },
    "list-templates": { hidden: true }
  };

  const guard = createVendorTemplateNavigationGuard({
    readHref: () => href,
    activateTab: (tab, { historyMode = "", templateId = "" } = {}) => {
      activeTab = tab;
      selectedTemplateId = templateId;
      for (const [name, panel] of Object.entries(panels)) panel.hidden = name !== tab;
      if (historyMode === "replace") {
        const url = new URL(href);
        url.searchParams.set("tab", tab);
        url.searchParams.delete("template");
        href = url.href;
        replacements += 1;
      }
    }
  });

  return {
    guard,
    navigate(nextHref) {
      href = nextHref;
      return guard.handlePopState();
    },
    state() {
      return { href, activeTab, selectedTemplateId, replacements, panels };
    }
  };
}

test("disabled List Templates popstate replaces the URL and keeps Funnel visible", () => {
  const harness = createHarness("https://rateware.test/vendors.html?tab=list-templates&template=template-a");
  harness.guard.resolveCapability(false);

  assert.equal(harness.state().activeTab, "funnel");
  assert.equal(harness.state().panels.funnel.hidden, false);
  assert.equal(harness.state().panels["list-templates"].hidden, true);
  assert.equal(new URL(harness.state().href).searchParams.get("tab"), "funnel");
  assert.equal(new URL(harness.state().href).searchParams.has("template"), false);
  assert.equal(harness.state().replacements, 1);

  harness.navigate("https://rateware.test/vendors.html?tab=list-templates&template=template-b");
  assert.equal(harness.state().activeTab, "funnel");
  assert.equal(new URL(harness.state().href).searchParams.get("tab"), "funnel");
  assert.equal(harness.state().replacements, 2);
});

test("capability resolution re-reads the latest popstate URL instead of module-load template A", () => {
  const harness = createHarness("https://rateware.test/vendors.html?tab=list-templates&template=template-a");
  harness.guard.handlePopState();
  assert.equal(harness.state().activeTab, "funnel");
  assert.equal(harness.state().replacements, 0);

  harness.navigate("https://rateware.test/vendors.html?tab=list-templates&template=template-b");
  assert.equal(harness.state().activeTab, "funnel");
  assert.equal(harness.state().replacements, 0);

  harness.guard.resolveCapability(true);
  assert.equal(harness.state().activeTab, "list-templates");
  assert.equal(harness.state().selectedTemplateId, "template-b");
  assert.equal(harness.state().panels.funnel.hidden, true);
  assert.equal(harness.state().panels["list-templates"].hidden, false);
});
