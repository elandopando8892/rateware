const TEMPLATE_TAB = "list-templates";
const FALLBACK_TAB = "funnel";
const CAPABILITY_STATES = new Set(["pending", "enabled", "error", "disabled"]);

export function createVendorTemplateNavigationGuard({ readHref, activateTab, initialRoute = null }) {
  if (typeof readHref !== "function" || typeof activateTab !== "function") {
    throw new TypeError("Vendor template navigation requires URL and tab adapters.");
  }

  let capability = "pending";
  let navigationObserved = false;

  function currentRoute() {
    const url = new URL(readHref(), "https://rateware.invalid/");
    const tab = url.searchParams.get("tab") || (!navigationObserved ? initialRoute?.tab : "") || "";
    return {
      tab,
      templateId: tab === TEMPLATE_TAB
        ? url.searchParams.get("template") || initialRoute?.templateId || ""
        : ""
    };
  }

  function applyCurrentRoute() {
    const route = currentRoute();
    if (route.tab !== TEMPLATE_TAB) return { handled: false, capability, ...route };

    if (capability === "enabled") {
      activateTab(TEMPLATE_TAB, { templateId: route.templateId });
      return { handled: true, capability, tab: TEMPLATE_TAB, templateId: route.templateId };
    }

    activateTab(FALLBACK_TAB, { historyMode: capability === "disabled" ? "replace" : "" });
    return { handled: true, capability, tab: FALLBACK_TAB, templateId: "" };
  }

  function transitionCapability(nextCapability) {
    if (!CAPABILITY_STATES.has(nextCapability)) {
      throw new TypeError(`Unknown carrier template capability state: ${nextCapability}`);
    }
    capability = nextCapability;
    return applyCurrentRoute();
  }

  return {
    get capability() {
      return capability;
    },
    transitionCapability,
    handlePopState() {
      navigationObserved = true;
      return applyCurrentRoute();
    },
    applyCurrentRoute
  };
}
