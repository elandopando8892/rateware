const CAPABILITY_STATES = new Set(["pending", "enabled", "error", "disabled"]);

export function createCarrierTemplateCapabilityView({
  tab,
  workspace,
  errorRegion,
  errorMessage,
  formatError = (error) => error instanceof Error ? error.message : String(error || "Unknown error"),
  onTransition = () => {}
} = {}) {
  let capability = "";

  function transition(nextCapability, { error = null } = {}) {
    if (!CAPABILITY_STATES.has(nextCapability)) {
      throw new TypeError(`Unknown carrier template capability state: ${nextCapability}`);
    }

    const previousCapability = capability;
    const changed = previousCapability !== nextCapability;
    capability = nextCapability;
    const enabled = capability === "enabled";
    const failed = capability === "error";

    if (tab) tab.hidden = !enabled;
    if (workspace) workspace.hidden = !enabled;
    if (errorRegion) errorRegion.hidden = !failed;
    if (failed && errorMessage) errorMessage.textContent = formatError(error);

    if (changed) onTransition(capability, { previousCapability, error });
    return changed;
  }

  return {
    get capability() {
      return capability || "pending";
    },
    get enabled() {
      return capability === "enabled";
    },
    transition
  };
}
