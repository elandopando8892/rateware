const freezeRoute = (route) => Object.freeze({
  cleanPath: `/${route.path.replace(/^\.\//, "").replace(/\.html$/i, "")}`,
  keywords: Object.freeze([...(route.keywords || [])]),
  ...route
});

export const PLATFORM55_ROUTES = Object.freeze([
  freezeRoute({ key: "app", path: "./app.html", shell: "tenant", group: "Home", label: "Command Center", icon: "command", title: "Command Center", subtitle: "Decisions, priorities and lifecycle" }),
  freezeRoute({ key: "upload-center", path: "./upload-center.html", shell: "tenant", group: "Operate", label: "Import", icon: "upload", title: "Import", subtitle: "Preserve and interpret carrier source files" }),
  freezeRoute({ key: "upload-history", path: "./upload-history.html", shell: "tenant", group: "Operate", label: "Source Files", icon: "source", title: "Source Files", subtitle: "Trace every imported source and result" }),
  freezeRoute({ key: "staging-review", path: "./staging-review.html", shell: "tenant", group: "Operate", label: "Review Queue", icon: "review", title: "Review Queue", subtitle: "Human approval before Rateware insertion" }),
  freezeRoute({ key: "rateware", path: "./rateware.html", shell: "tenant", group: "Operate", label: "Rateware", icon: "rate", title: "Rateware", subtitle: "Approved rates and controlled publication" }),
  freezeRoute({ key: "business-intelligence", path: "./business-intelligence.html", shell: "tenant", group: "Analyze", label: "Analyze", icon: "ai", title: "Analyze", subtitle: "Evidence-backed commercial intelligence" }),
  freezeRoute({ key: "growth-hacking", path: "./growth-hacking.html", shell: "tenant", group: "Analyze", label: "Growth Hacking", icon: "shipper", title: "Growth Hacking", subtitle: "Shipper opportunities and growth signals" }),
  freezeRoute({ key: "vendors", path: "./vendors.html", shell: "tenant", group: "Source", label: "Carrier CRM", icon: "carrier", title: "Carrier CRM", subtitle: "Carrier master and procurement readiness" }),
  freezeRoute({ key: "shipper-crm", path: "./shipper-crm.html", shell: "tenant", group: "Source", label: "Shipper CRM", icon: "shipper", title: "Shipper CRM", subtitle: "Customer master and commercial progress" }),
  freezeRoute({ key: "rfx-process", path: "./rfx-process.html", shell: "tenant", group: "Source", label: "RFx Process", icon: "rfx", title: "RFx Process", subtitle: "Procurement design and award preparation" }),
  freezeRoute({ key: "rfx-events", path: "./rfx-events.html", shell: "tenant", group: "Source", label: "Bid Room", icon: "rfx", title: "Bid Room", subtitle: "Controlled sourcing events and responses" }),
  freezeRoute({ key: "ratebook", path: "./ratebook.html", shell: "tenant", group: "Source", label: "Ratebook", icon: "rate", title: "Ratebook", subtitle: "RFx route books and carrier pricing" }),
  freezeRoute({ key: "outreach", path: "./outreach.html", shell: "tenant", group: "Source", label: "Outreach", icon: "bell", title: "Outreach", subtitle: "Invitation drafts and communication review" }),
  freezeRoute({ key: "vendor-support", path: "./vendor-support.html", shell: "tenant", group: "Service", label: "Vendor Support", icon: "carrier", title: "Vendor Support", subtitle: "Carrier assistance and service cases" }),
  freezeRoute({ key: "vendor-improvement", path: "./vendor-improvement.html", shell: "tenant", group: "Service", label: "Vendor CI", icon: "check", title: "Vendor Continuous Improvement", subtitle: "Carrier performance and improvement work" }),
  freezeRoute({ key: "provider-service", path: "./provider-service.html", shell: "tenant", group: "Service", label: "Provider Service", icon: "source", title: "Provider Service", subtitle: "Integration operations and controlled release" }),
  freezeRoute({ key: "provider-onboarding", path: "./provider-onboarding.html", shell: "tenant", group: "Service", label: "Provider Onboarding", icon: "check", title: "Provider Onboarding", subtitle: "Connection setup and compliance review" }),
  freezeRoute({ key: "provider-gmail", path: "./provider-gmail.html", shell: "tenant", group: "Service", label: "Provider Gmail", icon: "bell", title: "Provider Gmail", subtitle: "Read-only provider message operations" }),
  freezeRoute({ key: "provider-communications", path: "./provider-communications.html", shell: "tenant", group: "Service", label: "Provider Communications", icon: "bell", title: "Provider Communications", subtitle: "Governed communication drafts and evidence" }),
  freezeRoute({ key: "settings", path: "./settings.html", shell: "tenant", group: "Admin", label: "Settings", icon: "settings", title: "Settings", subtitle: "Workspace controls and governance" }),
  freezeRoute({ key: "interpretation-memory", path: "./interpretation-memory.html", shell: "tenant", group: "Admin", label: "Learning Rules", icon: "ai", title: "Learning Rules", subtitle: "Interpretation memory and reviewed rules" }),
  freezeRoute({ key: "catalog-workbench", path: "./catalog-workbench.html", shell: "tenant", group: "Admin", label: "Catalog", icon: "catalog", title: "Catalog", subtitle: "Normalization catalogs and mappings" }),
  freezeRoute({ key: "bid-room-board", path: "./bid-room-board.html", shell: "public", label: "Bid Room Board", icon: "rfx" }),
  freezeRoute({ key: "carrier-profile", path: "./carrier-profile.html", shell: "public", label: "Carrier Profile", icon: "carrier" }),
  freezeRoute({ key: "customer-rfi", path: "./customer-rfi.html", shell: "public", label: "Customer RFI", icon: "rfx" }),
  freezeRoute({ key: "index", path: "./index.html", shell: "entry", label: "Rateware", icon: "command" }),
  freezeRoute({ key: "ratebook-carrier", path: "./ratebook-carrier.html", shell: "public", label: "Carrier Ratebook", icon: "rate" }),
  freezeRoute({ key: "rfx-bid", path: "./rfx-bid.html", shell: "public", label: "RFx Bid", icon: "rfx" }),
  freezeRoute({ key: "shipper-profile", path: "./shipper-profile.html", shell: "public", label: "Shipper Profile", icon: "shipper" })
]);

function pathKey(pathname = "") {
  let value = String(pathname || "").trim();
  try {
    value = new URL(value, "https://rateware.local").pathname;
  } catch {
    value = value.split(/[?#]/, 1)[0];
  }
  const leaf = value.split("/").filter(Boolean).pop() || "index";
  return leaf.replace(/\.html$/i, "") || "index";
}

function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function routeForPath(pathname) {
  const key = pathKey(pathname);
  return PLATFORM55_ROUTES.find((route) => route.key === key) || null;
}

export function visibleNavigation(accessContext = {}) {
  const can = typeof accessContext?.can === "function" ? accessContext.can.bind(accessContext) : () => false;
  return Object.freeze(
    PLATFORM55_ROUTES.filter((route) => route.shell === "tenant")
      .filter((route) => route.requiredAction == null || can(route.requiredAction))
  );
}

export function shellModel({ pageKey = "app", user = null, accessContext = {}, notificationSummary = {} } = {}) {
  const activeRoute = PLATFORM55_ROUTES.find((route) => route.key === pageKey) || routeForPath(pageKey);
  const displaySource = user?.given_name || user?.name || user?.email || "Rateware user";
  const unread = Number(notificationSummary?.unread);
  return Object.freeze({
    activeRoute: activeRoute?.shell === "tenant" ? activeRoute : PLATFORM55_ROUTES[0],
    navigation: visibleNavigation(accessContext),
    userLabel: escapeText(displaySource),
    notificationCount: Number.isFinite(unread) && unread > 0 ? Math.floor(unread) : 0
  });
}
