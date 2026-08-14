# Build 30 — Rateware Provider Onboarding workspace

Build 30 renders the case pipeline introduced in Build 26 and the controlled outputs introduced in Builds 27–29 as a first-class private Rateware workspace.

## Included

- sanitized service-role pipeline read model;
- authenticated paginated pipeline and case-detail actions;
- queues for draft, evidence collection, blocked, ready for approval, closed, and overdue work;
- “My Work” task list plus approval, private assembly, delivery, and event status;
- first-class link from Provider Service;
- responsive master-detail UI and deterministic domain tests.

## Privacy boundary

The read model and API exclude canonical fact values, document bytes and storage paths, evidence hashes, signature assets and consent evidence, recipients, mailbox addresses, message subjects/bodies, Gmail IDs, and credentials.

## Authority boundary

Build 30 is observation-only. It cannot approve a release package, authorize or apply a signature, assemble a form, send an email, or submit to an external party. Each consequential action remains a separately scoped and audited server command.

## Next

Build 31 performs complete end-to-end integration, controlled private pilot ingestion, production configuration, rollout verification, and operator handoff. Supplied XBF documents and the JAGP signature remain outside the repository.
