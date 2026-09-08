# Scheduled intake diagnosis correction

Production evidence showed a configured poll with failures while the UI claimed no cloud trigger and recommended Pub/Sub. Root cause: configuration was inferred from healthy `polling` status. The component now retains configured-but-degraded polling separately, shows recovery guidance, and disables watch activation rather than recommending a second provider.

Validation: 23 pipeline/health tests passed using Node 24, and TypeScript passed. The default Node invocation failed before executing tests (ESM dependency incompatibility); rerun used the bundled supported runtime without changing dependencies. Regression fixture initially omitted a required read-client method; corrected and revalidated.

This is local source work, not a deployed fix or proof of Gmail recovery. Live job 3 remains active; no reconnection or queue action performed. Live package-set, per-member-review and set-operations-review counts are all zero, so persistent review remains unproven. Next functional gate requires generating the isolated permitted package, not approving an empty or historical package.
