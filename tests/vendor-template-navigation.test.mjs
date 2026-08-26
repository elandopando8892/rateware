import assert from "node:assert/strict";
import test from "node:test";

import { createCarrierTemplateCapabilityView } from "../src/carrier-list-template-capability.js";
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
  harness.guard.transitionCapability("disabled");

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

  harness.guard.transitionCapability("enabled");
  assert.equal(harness.state().activeTab, "list-templates");
  assert.equal(harness.state().selectedTemplateId, "template-b");
  assert.equal(harness.state().panels.funnel.hidden, true);
  assert.equal(harness.state().panels["list-templates"].hidden, false);
});

test("real capability callback wiring handles enabled to error to disabled without stale navigation", () => {
  const harness = createHarness("https://rateware.test/vendors.html?tab=list-templates&template=template-a");
  const tab = { hidden: true };
  const workspace = { hidden: true };
  const errorRegion = { hidden: true };
  const errorMessage = { textContent: "" };
  const transitions = [];
  const capabilityView = createCarrierTemplateCapabilityView({
    tab,
    workspace,
    errorRegion,
    errorMessage,
    formatError: (error) => error.message,
    onTransition: (state) => {
      transitions.push(state);
      harness.guard.transitionCapability(state);
    }
  });

  capabilityView.transition("enabled");
  assert.equal(harness.state().activeTab, "list-templates");
  assert.equal(harness.state().panels.funnel.hidden, true);
  assert.equal(harness.state().panels["list-templates"].hidden, false);
  assert.equal(tab.hidden, false);
  assert.equal(workspace.hidden, false);
  assert.equal(errorRegion.hidden, true);
  assert.equal(new URL(harness.state().href).searchParams.get("tab"), "list-templates");

  capabilityView.transition("error", { error: new Error("Templates are temporarily unavailable") });
  assert.equal(harness.guard.capability, "error");
  assert.equal(harness.state().activeTab, "funnel");
  assert.equal(harness.state().panels.funnel.hidden, false);
  assert.equal(harness.state().panels["list-templates"].hidden, true);
  assert.equal(tab.hidden, true);
  assert.equal(workspace.hidden, true);
  assert.equal(errorRegion.hidden, false);
  assert.equal(errorMessage.textContent, "Templates are temporarily unavailable");
  assert.equal(new URL(harness.state().href).searchParams.get("tab"), "list-templates");
  assert.equal(new URL(harness.state().href).searchParams.get("template"), "template-a");
  assert.equal(harness.state().replacements, 0);

  capabilityView.transition("error", { error: new Error("Templates are still unavailable") });
  assert.deepEqual(transitions, ["enabled", "error"]);
  assert.equal(errorMessage.textContent, "Templates are still unavailable");

  capabilityView.transition("disabled");
  assert.equal(harness.guard.capability, "disabled");
  assert.equal(harness.state().activeTab, "funnel");
  assert.equal(errorRegion.hidden, true);
  assert.equal(new URL(harness.state().href).searchParams.get("tab"), "funnel");
  assert.equal(new URL(harness.state().href).searchParams.has("template"), false);
  assert.equal(harness.state().replacements, 1);
  assert.deepEqual(transitions, ["enabled", "error", "disabled"]);
});
